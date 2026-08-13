import {
  Annotation,
  END,
  START,
  StateGraph,
  type BaseCheckpointSaver,
} from '@langchain/langgraph/web'
import type { Itinerary } from '../../types/database'
import type {
  AssistantAttractionDraft,
  AssistantGraphDependencies,
  AssistantGraphRunner,
  AssistantGraphState,
  AssistantMessage,
  AssistantOperation,
  AssistantProgressListener,
  AssistantTurnRequest,
  ItineraryChangeProposal,
} from './types'
import { ASSISTANT_GRAPH_VERSION } from './types'

export { ASSISTANT_GRAPH_VERSION }
export const DEFAULT_SUMMARY_MESSAGE_THRESHOLD = 30
export const DEFAULT_SUMMARY_CHARACTER_THRESHOLD = 24_000
export const DEFAULT_RECENT_MESSAGE_COUNT = 10
const transportModes = new Set(['driving', 'walking', 'transit', 'bicycling'])

type UnknownRecord = Record<string, unknown>

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const text = (value: unknown, field: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Invalid ${field}`)
  return value.trim()
}

const nullableText = (value: unknown, field: string) => {
  if (value === null) return null
  if (typeof value !== 'string') throw new Error(`Invalid ${field}`)
  return value.trim() || null
}

const finiteNumber = (value: unknown, field: string, minimum?: number) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || (minimum !== undefined && value < minimum)) {
    throw new Error(`Invalid ${field}`)
  }
  return value
}

const nullableNumber = (value: unknown, field: string, minimum?: number) => {
  if (value === null) return null
  return finiteNumber(value, field, minimum)
}

const integer = (value: unknown, field: string, minimum = 0) => {
  const result = finiteNumber(value, field, minimum)
  if (!Number.isInteger(result)) throw new Error(`Invalid ${field}`)
  return result
}

const attractionDraft = (value: unknown): AssistantAttractionDraft => {
  if (!isRecord(value)) throw new Error('Invalid attraction')
  return {
    id: typeof value.id === 'string' && value.id ? value.id : crypto.randomUUID(),
    name: text(value.name, 'attraction.name'),
    description: typeof value.description === 'string' ? value.description.trim() : '',
    cost: finiteNumber(value.cost ?? 0, 'attraction.cost', 0),
    latitude: nullableNumber(value.latitude ?? null, 'attraction.latitude'),
    longitude: nullableNumber(value.longitude ?? null, 'attraction.longitude'),
    duration: integer(value.duration ?? 60, 'attraction.duration'),
    transportMode: typeof value.transportMode === 'string' && transportModes.has(value.transportMode)
      ? value.transportMode
      : null,
    travelTime: nullableNumber(value.travelTime ?? null, 'attraction.travelTime', 0),
    placeId: nullableText(value.placeId ?? null, 'attraction.placeId'),
    locationName: nullableText(value.locationName ?? null, 'attraction.locationName'),
  }
}

const attractionChanges = (value: unknown) => {
  if (!isRecord(value)) throw new Error('Invalid attraction changes')
  const allowed = new Set([
    'name', 'description', 'cost', 'latitude', 'longitude', 'duration',
    'transportMode', 'travelTime', 'placeId', 'locationName',
  ])
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Unsupported attraction change: ${key}`)
  }
  const seed = attractionDraft({
    id: 'changes',
    name: value.name ?? 'unchanged',
    description: value.description ?? '',
    cost: value.cost ?? 0,
    latitude: value.latitude ?? null,
    longitude: value.longitude ?? null,
    duration: value.duration ?? 60,
    transportMode: value.transportMode ?? null,
    travelTime: value.travelTime ?? null,
    placeId: value.placeId ?? null,
    locationName: value.locationName ?? null,
  })
  return Object.fromEntries(Object.keys(value).map((key) => [key, seed[key as keyof typeof seed]]))
}

export const parseAssistantOperations = (value: unknown): AssistantOperation[] => {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Proposal requires operations')
  return value.map((entry) => {
    if (!isRecord(entry)) throw new Error('Invalid operation')
    switch (entry.type) {
      case 'set_day_start_time':
        return {
          type: entry.type,
          dayId: text(entry.dayId, 'dayId'),
          startTime: text(entry.startTime, 'startTime'),
        }
      case 'add_attraction':
        return {
          type: entry.type,
          dayId: text(entry.dayId, 'dayId'),
          attraction: attractionDraft(entry.attraction),
          ...(entry.index === undefined ? {} : { index: integer(entry.index, 'index') }),
        }
      case 'update_attraction':
        return {
          type: entry.type,
          attractionId: text(entry.attractionId, 'attractionId'),
          changes: attractionChanges(entry.changes),
        }
      case 'remove_attraction':
        return { type: entry.type, attractionId: text(entry.attractionId, 'attractionId') }
      case 'move_attraction':
        return {
          type: entry.type,
          attractionId: text(entry.attractionId, 'attractionId'),
          targetDayId: text(entry.targetDayId, 'targetDayId'),
          index: integer(entry.index, 'index'),
        }
      case 'reorder_attractions':
        if (!Array.isArray(entry.attractionIds)) throw new Error('Invalid attractionIds')
        return {
          type: entry.type,
          dayId: text(entry.dayId, 'dayId'),
          attractionIds: entry.attractionIds.map((id) => text(id, 'attractionId')),
        }
      default:
        throw new Error('Unsupported assistant operation')
    }
  })
}

const attractionById = (itinerary: Itinerary) => new Map(
  (itinerary.days ?? []).flatMap((day) => day.attractions).map((attraction) => [attraction.id, attraction]),
)

/**
 * Models often return only the attractions they intend to move. Materialize
 * that shorthand into the full order expected by the proposal applier while
 * leaving unknown or duplicate IDs untouched for validation to reject.
 */
export const normalizeAssistantOperations = (
  itinerary: Itinerary,
  operations: AssistantOperation[],
): AssistantOperation[] => operations.map((operation) => {
  if (operation.type !== 'reorder_attractions') return operation
  const day = (itinerary.days ?? []).find((item) => item.id === operation.dayId)
  if (!day) return operation
  const currentIds = day.attractions.map((item) => item.id)
  const requestedIds = operation.attractionIds
  const requestedSet = new Set(requestedIds)
  if (requestedSet.size !== requestedIds.length || requestedIds.some((id) => !currentIds.includes(id))) {
    return operation
  }
  return {
    ...operation,
    attractionIds: [...requestedIds, ...currentIds.filter((id) => !requestedSet.has(id))],
  }
})

export const validateAssistantOperations = (
  itinerary: Itinerary,
  operations: AssistantOperation[],
) => {
  const days = new Map((itinerary.days ?? []).map((day) => [day.id, day]))
  const attractions = attractionById(itinerary)
  for (const operation of operations) {
    if ('dayId' in operation && !days.has(operation.dayId)) throw new Error('Proposal references an unknown day')
    if ('attractionId' in operation && !attractions.has(operation.attractionId)) {
      throw new Error('Proposal references an unknown attraction')
    }
    if (operation.type === 'move_attraction' && !days.has(operation.targetDayId)) {
      throw new Error('Proposal references an unknown target day')
    }
    if (operation.type === 'reorder_attractions') {
      const current = days.get(operation.dayId)?.attractions.map((item) => item.id) ?? []
      if (new Set(operation.attractionIds).size !== operation.attractionIds.length ||
        current.length !== operation.attractionIds.length ||
        current.some((id) => !operation.attractionIds.includes(id))) {
        throw new Error('Reorder operation must contain every attraction exactly once')
      }
    }
    // Google lookup is best-effort. A place that is not found may still be
    // proposed with empty placeId/coordinates and can be filled in manually.
  }
}

export const shouldSummarizeMessages = (
  messages: AssistantMessage[],
  messageThreshold = DEFAULT_SUMMARY_MESSAGE_THRESHOLD,
  characterThreshold = DEFAULT_SUMMARY_CHARACTER_THRESHOLD,
) => messages.length >= messageThreshold ||
  messages.reduce((total, message) => total + message.content.length, 0) >= characterThreshold

export const recentAssistantMessages = (
  messages: AssistantMessage[],
  count = DEFAULT_RECENT_MESSAGE_COUNT,
) => messages.slice(-Math.max(count, 0))

const GraphState = Annotation.Root({
  graphVersion: Annotation<number>({ default: () => ASSISTANT_GRAPH_VERSION, reducer: (_, update) => update }),
  summary: Annotation<string>({ default: () => '', reducer: (_, update) => update }),
  messages: Annotation<AssistantMessage[]>({ default: () => [], reducer: (_, update) => update }),
  request: Annotation<AssistantTurnRequest | null>({ default: () => null, reducer: (_, update) => update }),
  assistantMessage: Annotation<AssistantMessage | null>({ default: () => null, reducer: (_, update) => update }),
  pendingProposal: Annotation<ItineraryChangeProposal | null>({ default: () => null, reducer: (_, update) => update }),
})

const defaultState = (version: number): AssistantGraphState => ({
  graphVersion: version,
  summary: '',
  messages: [],
  request: null,
  assistantMessage: null,
  pendingProposal: null,
})

const asGraphState = (value: unknown, version: number): AssistantGraphState => ({
  ...defaultState(version),
  ...(isRecord(value) ? value : {}),
}) as AssistantGraphState

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
  const graphVersion = dependencies.graphVersion ?? ASSISTANT_GRAPH_VERSION
  const summaryMessageThreshold = dependencies.summaryMessageThreshold ?? DEFAULT_SUMMARY_MESSAGE_THRESHOLD
  const summaryCharacterThreshold = dependencies.summaryCharacterThreshold ?? DEFAULT_SUMMARY_CHARACTER_THRESHOLD
  const recentMessageCount = dependencies.recentMessageCount ?? DEFAULT_RECENT_MESSAGE_COUNT
  const progressListeners = new Map<string, AssistantProgressListener>()
  const reportProgress = (threadId: string | undefined, phase: Parameters<AssistantProgressListener>[0]) => {
    if (threadId) progressListeners.get(threadId)?.(phase)
  }

  const workflow = new StateGraph(GraphState)
    .addNode('prepare_context', async (state) => {
      const request = state.request
      if (!request) throw new Error('Assistant turn request is missing')
      reportProgress(request.threadId, 'checking_context')
      const currentTurn = state.messages.filter((message) => message.turnId === request.turnId)
      const previousMessages = state.messages.filter((message) => message.turnId !== request.turnId)
      if (!shouldSummarizeMessages(previousMessages, summaryMessageThreshold, summaryCharacterThreshold)) return {}
      reportProgress(request.threadId, 'summarizing_context')
      const summary = await dependencies.model.summarize(state.summary, previousMessages)
      return {
        summary,
        messages: [...recentAssistantMessages(previousMessages, recentMessageCount), ...currentTurn],
      }
    })
    .addNode('respond', async (state) => {
      const request = state.request
      if (!request) throw new Error('Assistant turn request is missing')
      reportProgress(request.threadId, 'generating_response')
      const result = await dependencies.model.respond({
        summary: state.summary,
        messages: state.messages,
        userText: request.text,
        itinerary: request.itinerary,
      })
      const assistantMessage: AssistantMessage = {
        id: crypto.randomUUID(),
        turnId: request.turnId,
        role: 'assistant',
        content: result.reply,
        createdAt: new Date().toISOString(),
      }
      let proposal: ItineraryChangeProposal | null = null
      reportProgress(request.threadId, 'validating_response')
      if (result.proposal) {
        const operations = normalizeAssistantOperations(request.itinerary, result.proposal.operations)
        validateAssistantOperations(request.itinerary, operations)
        proposal = {
          id: crypto.randomUUID(),
          threadId: request.threadId,
          turnId: request.turnId,
          itineraryId: request.itinerary.id,
          title: result.proposal.title,
          explanation: result.proposal.explanation,
          expectedDayRevisions: request.dayRevisions,
          operations,
          status: 'pending',
          createdAt: new Date().toISOString(),
        }
      }
      return {
        assistantMessage,
        messages: [...state.messages, assistantMessage],
        pendingProposal: proposal,
      }
    })
    .addNode('persist_proposal', async (state) => {
      if (!state.pendingProposal) throw new Error('Proposal is missing')
      reportProgress(state.pendingProposal.threadId, 'saving_proposal')
      await dependencies.proposals.savePending(state.pendingProposal)
      reportProgress(state.pendingProposal.threadId, 'saving_checkpoint')
      return { pendingProposal: null }
    })
    .addNode('finish_turn', (state) => {
      reportProgress(state.request?.threadId, 'saving_checkpoint')
      return { request: null }
    })
    .addEdge(START, 'prepare_context')
    .addEdge('prepare_context', 'respond')
    .addConditionalEdges('respond', (state) => state.pendingProposal ? 'proposal' : 'answer', {
      proposal: 'persist_proposal',
      answer: 'finish_turn',
    })
    .addEdge('persist_proposal', 'finish_turn')
    .addEdge('finish_turn', END)
    .compile({ checkpointer })

  const config = (threadId: string) => ({ configurable: { thread_id: threadId }, durability: 'exit' as const })

  // A thread has one linear checkpoint head. Coalesce duplicate sends while
  // the first run is still writing it; otherwise every caller races the CAS
  // and creates a burst of failed Supabase requests.
  const inFlightTurns = new Map<string, Promise<AssistantGraphState>>()

  const sendTurn = async (request: AssistantTurnRequest, onProgress?: AssistantProgressListener) => {
    const active = inFlightTurns.get(request.threadId)
    if (active) return active
    const run = (async () => {
      if (onProgress) progressListeners.set(request.threadId, onProgress)
      try {
        const previous = await getState(request.threadId)
        if (previous && previous.graphVersion !== graphVersion) {
          throw new AssistantGraphVersionError(previous.graphVersion, graphVersion)
        }
        const completedTurn = previous?.messages.find((message) =>
          message.turnId === request.turnId && message.role === 'assistant')
        if (completedTurn && previous) {
          return { ...previous, assistantMessage: completedTurn }
        }
        const existingUserMessage = previous?.messages.find((message) =>
          message.turnId === request.turnId && message.role === 'user') ??
          request.rehydratedMessages?.find((message) => message.turnId === request.turnId && message.role === 'user')
        const userMessage: AssistantMessage = existingUserMessage ?? {
          id: crypto.randomUUID(),
          turnId: request.turnId,
          role: 'user',
          content: request.text.trim(),
          createdAt: request.createdAt ?? new Date().toISOString(),
        }
        const baseMessages = previous?.messages ?? request.rehydratedMessages ?? []
        const messages = existingUserMessage ? baseMessages : [...baseMessages, userMessage]
        const output = await workflow.invoke({
          ...(previous ?? {
            ...defaultState(graphVersion),
            summary: request.rehydratedSummary ?? '',
            messages: baseMessages,
          }),
          graphVersion,
          messages,
          request,
          assistantMessage: null,
          pendingProposal: null,
        }, config(request.threadId))
        return asGraphState(output, graphVersion)
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

  const getState = async (threadId: string) => {
    const snapshot = await workflow.getState(config(threadId))
    if (!snapshot.config.configurable?.checkpoint_id) return null
    return asGraphState(snapshot.values, graphVersion)
  }

  return {
    sendTurn,
    async summarizeThread(threadId) {
      const previous = await getState(threadId)
      if (!previous) throw new Error('Assistant thread has no checkpoint to summarize')
      if (previous.graphVersion !== graphVersion) {
        throw new AssistantGraphVersionError(previous.graphVersion, graphVersion)
      }
      const summary = await dependencies.model.summarize(previous.summary, previous.messages)
      await workflow.updateState(config(threadId), {
        summary,
        messages: recentAssistantMessages(previous.messages, recentMessageCount),
      }, 'finish_turn')
      const updated = await getState(threadId)
      if (!updated) throw new Error('Assistant summary checkpoint was not saved')
      return updated
    },
    getState,
  }
}
