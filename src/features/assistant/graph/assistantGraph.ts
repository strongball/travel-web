import {
  END,
  Command,
  START,
  StateGraph,
  isGraphInterrupt,
  type BaseCheckpointSaver,
} from '@langchain/langgraph/web'
import { AIMessage } from '@langchain/core/messages'
import type {
  AssistantGraphDependencies,
  AssistantGraphRunner,
  AssistantGraphState,
  AssistantMessage,
  AssistantPendingToolCall,
  AssistantProposalReviewInterrupt,
  AssistantProgressListener,
  AssistantProgressPhase,
  AssistantStreamEvent,
  AssistantStreamListener,
  AssistantTurnRequest,
  AssistantUserDecision,
} from '../types'
import { ASSISTANT_GRAPH_VERSION } from '../types'
import {
  parseAssistantOperations,
  summarizeWithGemini,
  validateAssistantOperations,
} from '../services'
import { ToolNode } from '@langchain/langgraph/prebuilt'
import { assistantCallableTools } from '../tools'
import { assistantGraphState } from './graphState'
import { routeAfterRespond, routeAfterTools } from './routing'
import { createFinalizeResponseNode } from './nodes/finalizeResponseNode'
import { createPrepareContextNode } from './nodes/prepareContextNode'
import { createRespondNode } from './nodes/respondNode'
import { createToolLimitNode } from './nodes/toolLimitNode'
import { ensureLangGraphAsyncContext } from '../../../lib/langGraphAsyncContext'

export {
  ASSISTANT_GRAPH_VERSION,
  parseAssistantOperations,
  validateAssistantOperations,
}

export const DEFAULT_SUMMARY_MESSAGE_THRESHOLD = 30
export const DEFAULT_SUMMARY_CHARACTER_THRESHOLD = 24_000
export const DEFAULT_RECENT_MESSAGE_COUNT = 10

export const shouldSummarizeMessages = (
  messages: AssistantMessage[],
  msgThreshold = DEFAULT_SUMMARY_MESSAGE_THRESHOLD,
  charThreshold = DEFAULT_SUMMARY_CHARACTER_THRESHOLD,
) => messages.length >= msgThreshold || messages.reduce((acc, m) => acc + m.content.length, 0) >= charThreshold

export const recentAssistantMessages = (messages: AssistantMessage[], count = DEFAULT_RECENT_MESSAGE_COUNT) =>
  messages.slice(-Math.max(count, 0))

export class AssistantGraphVersionError extends Error {
  readonly storedVersion: number
  readonly expectedVersion: number

  constructor(storedVersion: number, expectedVersion: number) {
    super(`Assistant graph version ${storedVersion} cannot resume as version ${expectedVersion}`)
    this.storedVersion = storedVersion
    this.expectedVersion = expectedVersion
  }
}

export const createAssistantGraph = (
  checkpointer: BaseCheckpointSaver,
  dependencies: AssistantGraphDependencies,
): AssistantGraphRunner => {
  ensureLangGraphAsyncContext()
  const version = dependencies.graphVersion ?? ASSISTANT_GRAPH_VERSION
  const msgLimit = dependencies.summaryMessageThreshold ?? DEFAULT_SUMMARY_MESSAGE_THRESHOLD
  const charLimit = dependencies.summaryCharacterThreshold ?? DEFAULT_SUMMARY_CHARACTER_THRESHOLD
  const recentLimit = dependencies.recentMessageCount ?? DEFAULT_RECENT_MESSAGE_COUNT
  const maxToolRounds = dependencies.maxToolRounds ?? 4
  const progressListeners = new Map<string, AssistantProgressListener>()
  const emitProgress = (threadId?: string, phase?: AssistantProgressPhase) => {
    if (threadId && phase) progressListeners.get(threadId)?.(phase)
  }

  const toolNode = new ToolNode(assistantCallableTools, { handleToolErrors: false })

  const workflow = new StateGraph(assistantGraphState)
    .addNode('prepare_context', createPrepareContextNode({
      messageThreshold: msgLimit,
      characterThreshold: charLimit,
      recentMessageCount: recentLimit,
      emitProgress,
      shouldSummarizeMessages,
      recentAssistantMessages,
    }))
    .addNode('respond', createRespondNode({ emitProgress }))
    .addNode('execute_tools', async (state, config) => {
      const result = await toolNode.invoke({ ...state, messages: state.modelMessages }, config) as {
        messages: typeof state.modelMessages
      }
      return { modelMessages: [...state.modelMessages, ...result.messages] }
    })
    .addNode('finalize_response', createFinalizeResponseNode({ emitProgress }))
    .addNode('tool_limit', createToolLimitNode(maxToolRounds))
    .addEdge(START, 'prepare_context')
    .addEdge('prepare_context', 'respond')
    .addConditionalEdges('respond', (state) => routeAfterRespond(state, maxToolRounds), {
      execute_tools: 'execute_tools',
      finalize_response: 'finalize_response',
      tool_limit: 'tool_limit',
    })
    .addConditionalEdges('execute_tools', (state) => routeAfterTools(state, maxToolRounds), {
      respond: 'respond',
      tool_limit: 'tool_limit',
    })
    .addEdge('finalize_response', END)
    .compile({ checkpointer })

  const config = (threadId: string, req?: AssistantTurnRequest | null) => ({
    configurable: {
      thread_id: threadId,
      request: req,
      applyProposal: dependencies.proposals.apply,
    },
    durability: 'exit' as const,
  })
  const inFlightTurns = new Map<string, Promise<AssistantGraphState>>()

  const isAssistantStreamEvent = (value: unknown): value is AssistantStreamEvent => {
    if (!value || typeof value !== 'object') return false
    const event = value as Partial<AssistantStreamEvent>
    return event.type === 'assistant_text_delta' &&
      typeof event.turnId === 'string' &&
      typeof event.text === 'string' &&
      event.text.length > 0
  }

  const runWorkflowStream = async (
    input: unknown,
    threadId: string,
    request: AssistantTurnRequest | null,
    onStream?: AssistantStreamListener,
  ) => {
    try {
      const stream = await workflow.stream(input as never, {
        ...config(threadId, request),
        streamMode: ['custom', 'values'],
      })
      for await (const event of stream) {
        const customEvent = Array.isArray(event) && event[0] === 'custom'
          ? event[1]
          : null
        if (isAssistantStreamEvent(customEvent)) onStream?.(customEvent)
      }
    } catch (error) {
      if (!isGraphInterrupt(error)) throw error
    }

    const snapshot = await workflow.getState(config(threadId))
    return stateWithSnapshot(snapshot.values as AssistantGraphState, snapshot)
  }

  const pendingToolCallFromSnapshot = (
    snapshot: Awaited<ReturnType<typeof workflow.getState>>,
  ): AssistantPendingToolCall | null => {
    const interruptValue = snapshot.tasks
      .flatMap((task) => task.interrupts ?? [])
      .map((item) => item.value)
      .find((value): value is AssistantProposalReviewInterrupt => (
        Boolean(value) &&
        typeof value === 'object' &&
        (value as { type?: unknown }).type === 'proposal_review' &&
        typeof (value as { toolCallId?: unknown }).toolCallId === 'string' &&
        Boolean((value as { proposal?: unknown }).proposal)
      ))
    if (!interruptValue?.proposal) return null

    const values = snapshot.values as AssistantGraphState
    const lastAiMessage = values.modelMessages
      .findLast((message) => AIMessage.isInstance(message))
    const toolCall = lastAiMessage && AIMessage.isInstance(lastAiMessage)
      ? (lastAiMessage.tool_calls ?? []).find((call) => call.id === interruptValue.toolCallId)
      : undefined

    return {
      id: interruptValue.toolCallId,
      name: toolCall?.name ?? 'proposal_review',
      proposal: interruptValue.proposal,
    }
  }

  const stateWithSnapshot = (
    state: AssistantGraphState,
    snapshot: Awaited<ReturnType<typeof workflow.getState>>,
  ): AssistantGraphState => {
    return {
      ...state,
      pendingToolCall: pendingToolCallFromSnapshot(snapshot),
    }
  }

  const getState = async (threadId: string): Promise<AssistantGraphState | null> => {
    const snapshot = await workflow.getState(config(threadId))
    if (!snapshot.config.configurable?.checkpoint_id) return null
    const values = snapshot.values as AssistantGraphState
    return stateWithSnapshot(values, snapshot)
  }

  const sendTurn = async (
    request: AssistantTurnRequest,
    onProgress?: AssistantProgressListener,
    onStream?: AssistantStreamListener,
  ) => {
    const active = inFlightTurns.get(request.threadId)
    if (active) return active

    const run = (async () => {
      if (onProgress) progressListeners.set(request.threadId, onProgress)
      try {
        const previous = await getState(request.threadId)
        if (previous && previous.graphVersion !== version) {
          throw new AssistantGraphVersionError(previous.graphVersion, version)
        }

        // Return cached assistant message if this turn was already completed
        const completed = previous?.messages.find((m) => m.turnId === request.turnId && m.role === 'assistant')
        if (completed && previous) return { ...previous, assistantMessage: completed }
        if (previous?.pendingToolCall?.proposal.turnId === request.turnId) return previous

        const existingUser = previous?.messages.find((m) => m.turnId === request.turnId && m.role === 'user') ??
          request.rehydratedMessages?.find((m) => m.turnId === request.turnId && m.role === 'user')

        const userMessage: AssistantMessage = existingUser ?? {
          id: crypto.randomUUID(),
          turnId: request.turnId,
          role: 'user',
          content: request.text.trim(),
          createdAt: request.createdAt ?? new Date().toISOString(),
        }

        const baseMsgs = previous?.messages ?? request.rehydratedMessages ?? []
        const messages = existingUser ? baseMsgs : [...baseMsgs, userMessage]

        return await runWorkflowStream({
          graphVersion: version,
          summary: previous?.summary ?? request.rehydratedSummary ?? '',
          messages,
          request,
          assistantMessage: null,
          pendingToolCall: null,
          modelMessages: [],
          toolRound: 0,
        }, request.threadId, request, onStream)
      } finally {
        progressListeners.delete(request.threadId)
      }
    })()

    inFlightTurns.set(request.threadId, run)
    try {
      return await run
    } finally {
      if (inFlightTurns.get(request.threadId) === run) inFlightTurns.delete(request.threadId)
    }
  }

  const resumeTurn = async (
    threadId: string,
    decision: AssistantUserDecision,
    onProgress?: AssistantProgressListener,
    onStream?: AssistantStreamListener,
  ): Promise<AssistantGraphState> => {
    const active = inFlightTurns.get(threadId)
    if (active) return active

    const run = (async () => {
      if (onProgress) progressListeners.set(threadId, onProgress)
      try {
        return await runWorkflowStream(new Command({ resume: decision }), threadId, null, onStream)
      } finally {
        progressListeners.delete(threadId)
      }
    })()

    inFlightTurns.set(threadId, run)
    try {
      return await run
    } finally {
      if (inFlightTurns.get(threadId) === run) inFlightTurns.delete(threadId)
    }
  }

  return {
    sendTurn,
    resumeTurn,
    async summarizeThread(threadId) {
      const prev = await getState(threadId)
      if (!prev) throw new Error('Assistant thread has no checkpoint to summarize')
      if (prev.graphVersion !== version) throw new AssistantGraphVersionError(prev.graphVersion, version)

      const summary = await summarizeWithGemini(prev.summary, prev.messages)
      await workflow.updateState(config(threadId), {
        summary,
        messages: recentAssistantMessages(prev.messages, recentLimit),
      })

      const updated = await getState(threadId)
      if (!updated) throw new Error('Assistant summary checkpoint was not saved')
      return updated
    },
    getState,
  }
}
