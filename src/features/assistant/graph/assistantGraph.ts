import {
  END,
  START,
  StateGraph,
  type BaseCheckpointSaver,
} from '@langchain/langgraph/web'
import type {
  AssistantGraphDependencies,
  AssistantGraphRunner,
  AssistantGraphState,
  AssistantMessage,
  AssistantProgressListener,
  AssistantProgressPhase,
  AssistantTurnRequest,
} from '../types'
import { ASSISTANT_GRAPH_VERSION } from '../types'
import {
  normalizeAssistantOperations,
  parseAssistantOperations,
  summarizeWithGemini,
  validateAssistantOperations,
} from '../api'
import { assistantGraphState } from './graphState'
import { routeAfterRespond, routeAfterTools } from './routing'
import { createExecuteToolsNode } from './nodes/executeToolsNode'
import { createFinalizeResponseNode } from './nodes/finalizeResponseNode'
import { createPrepareContextNode } from './nodes/prepareContextNode'
import { createRespondNode } from './nodes/respondNode'
import { createToolLimitNode } from './nodes/toolLimitNode'

export {
  ASSISTANT_GRAPH_VERSION,
  parseAssistantOperations,
  normalizeAssistantOperations,
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
  const version = dependencies.graphVersion ?? ASSISTANT_GRAPH_VERSION
  const msgLimit = dependencies.summaryMessageThreshold ?? DEFAULT_SUMMARY_MESSAGE_THRESHOLD
  const charLimit = dependencies.summaryCharacterThreshold ?? DEFAULT_SUMMARY_CHARACTER_THRESHOLD
  const recentLimit = dependencies.recentMessageCount ?? DEFAULT_RECENT_MESSAGE_COUNT
  const maxToolRounds = dependencies.maxToolRounds ?? 4
  const progressListeners = new Map<string, AssistantProgressListener>()
  const emitProgress = (threadId?: string, phase?: AssistantProgressPhase) => {
    if (threadId && phase) progressListeners.get(threadId)?.(phase)
  }

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
    .addNode('execute_tools', createExecuteToolsNode())
    .addNode('finalize_response', createFinalizeResponseNode({
      savePending: dependencies.proposals.savePending,
      emitProgress,
    }))
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
      finalize_response: 'finalize_response',
      tool_limit: 'tool_limit',
    })
    .addEdge('finalize_response', END)
    .compile({ checkpointer })

  const config = (threadId: string) => ({ configurable: { thread_id: threadId }, durability: 'exit' as const })
  const inFlightTurns = new Map<string, Promise<AssistantGraphState>>()

  const getState = async (threadId: string): Promise<AssistantGraphState | null> => {
    const snapshot = await workflow.getState(config(threadId))
    if (!snapshot.config.configurable?.checkpoint_id) return null
    const values = snapshot.values as AssistantGraphState
    return {
      ...values,
      pendingProposal: values.assistantMessage?.proposal ?? null,
    }
  }

  const sendTurn = async (request: AssistantTurnRequest, onProgress?: AssistantProgressListener) => {
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

        const output = await workflow.invoke({
          graphVersion: version,
          summary: previous?.summary ?? request.rehydratedSummary ?? '',
          messages,
          request,
          assistantMessage: null,
          modelMessages: [],
          toolRound: 0,
          toolCallKind: null,
        }, config(request.threadId))

        const stateOutput = output as AssistantGraphState
        return {
          ...stateOutput,
          pendingProposal: stateOutput.assistantMessage?.proposal ?? null,
        }
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

  return {
    sendTurn,
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
