import {
  Annotation,
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
  ItineraryChangeProposal,
} from '../types'
import { ASSISTANT_GRAPH_VERSION } from '../types'
import {
  normalizeAssistantOperations,
  validateAssistantOperations,
  parseAssistantOperations,
} from '../api'

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

/**
 * GraphState is purely focused on conversation messages and context
 */
const GraphState = Annotation.Root({
  graphVersion: Annotation<number>({ default: () => ASSISTANT_GRAPH_VERSION, reducer: (_, u) => u }),
  summary: Annotation<string>({ default: () => '', reducer: (_, u) => u }),
  messages: Annotation<AssistantMessage[]>({ default: () => [], reducer: (_, u) => u }),
  request: Annotation<AssistantTurnRequest | null>({ default: () => null, reducer: (_, u) => u }),
  assistantMessage: Annotation<AssistantMessage | null>({ default: () => null, reducer: (_, u) => u }),
})

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
  const progressListeners = new Map<string, AssistantProgressListener>()
  const emitProgress = (threadId?: string, phase?: AssistantProgressPhase) => {
    if (threadId && phase) progressListeners.get(threadId)?.(phase)
  }

  const workflow = new StateGraph(GraphState)
    // 1. Prepare context & summarize if threshold reached
    .addNode('prepare_context', async (state) => {
      const req = state.request!
      emitProgress(req.threadId, 'checking_context')
      const prevMsgs = state.messages.filter((m) => m.turnId !== req.turnId)
      if (!shouldSummarizeMessages(prevMsgs, msgLimit, charLimit)) return {}

      emitProgress(req.threadId, 'summarizing_context')
      const currentTurn = state.messages.filter((m) => m.turnId === req.turnId)
      const summary = await dependencies.model.summarize(state.summary, prevMsgs)
      return {
        summary,
        messages: [...recentAssistantMessages(prevMsgs, recentLimit), ...currentTurn],
      }
    })
    // 2. Chat with model & execute tool / proposal if present
    .addNode('respond', async (state) => {
      const req = state.request!
      emitProgress(req.threadId, 'generating_response')
      const result = await dependencies.model.respond({
        summary: state.summary,
        messages: state.messages,
        userText: req.text,
        itinerary: req.itinerary,
      })

      let proposal: ItineraryChangeProposal | null = null
      emitProgress(req.threadId, 'validating_response')
      if (result.proposal) {
        const operations = normalizeAssistantOperations(result.proposal.operations)
        validateAssistantOperations(req.itinerary, operations)
        proposal = {
          id: crypto.randomUUID(),
          threadId: req.threadId,
          turnId: req.turnId,
          itineraryId: req.itinerary.id,
          title: result.proposal.title,
          explanation: result.proposal.explanation,
          expectedDayRevisions: req.dayRevisions,
          operations,
          status: 'pending',
          createdAt: new Date().toISOString(),
        }

        emitProgress(req.threadId, 'saving_proposal')
        await dependencies.proposals.savePending(proposal)
      }

      const assistantMessage: AssistantMessage = {
        id: crypto.randomUUID(),
        turnId: req.turnId,
        role: 'assistant',
        content: result.reply,
        createdAt: new Date().toISOString(),
        proposal,
      }

      emitProgress(req.threadId, 'saving_checkpoint')
      return {
        assistantMessage,
        messages: [...state.messages, assistantMessage],
        request: null,
      }
    })
    .addEdge(START, 'prepare_context')
    .addEdge('prepare_context', 'respond')
    .addEdge('respond', END)
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

      const summary = await dependencies.model.summarize(prev.summary, prev.messages)
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
