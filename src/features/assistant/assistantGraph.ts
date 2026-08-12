import { GoogleGenAI } from '@google/genai'
import {
  Annotation,
  END,
  START,
  StateGraph,
  type BaseCheckpointSaver,
} from '@langchain/langgraph/web'
import { supabase } from '../../lib/supabase'
import type { Attraction, Itinerary } from '../../types/database'
import type {
  AssistantAttractionDraft,
  AssistantGraphDependencies,
  AssistantGraphRunner,
  AssistantGraphState,
  AssistantInterruptPayload,
  AssistantMessage,
  AssistantModel,
  AssistantModelResult,
  AssistantOperation,
  AssistantTurnRequest,
  AssistantTurnResult,
  ItineraryChangeProposal,
} from './types'

export const ASSISTANT_GRAPH_VERSION = 1
export const DEFAULT_SUMMARY_MESSAGE_THRESHOLD = 30
export const DEFAULT_SUMMARY_CHARACTER_THRESHOLD = 24_000
export const DEFAULT_RECENT_MESSAGE_COUNT = 10

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
    transportMode: nullableText(value.transportMode ?? null, 'attraction.transportMode'),
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

const parseModelResult = (value: unknown): AssistantModelResult => {
  if (!isRecord(value)) throw new Error('Invalid assistant response')
  const reply = text(value.reply, 'reply')
  if (value.proposal === undefined || value.proposal === null) return { reply }
  if (!isRecord(value.proposal)) throw new Error('Invalid proposal')
  return {
    reply,
    proposal: {
      title: text(value.proposal.title, 'proposal.title'),
      explanation: text(value.proposal.explanation, 'proposal.explanation'),
      operations: parseAssistantOperations(value.proposal.operations),
    },
  }
}

const itineraryForPrompt = (itinerary: Itinerary) => ({
  title: itinerary.title,
  startDate: itinerary.startDate,
  endDate: itinerary.endDate,
  days: (itinerary.days ?? []).map((day, dayIndex) => ({
    id: day.id,
    dayNumber: dayIndex + 1,
    date: day.date,
    startTime: day.startTime,
    attractions: day.attractions.map((item: Attraction, attractionIndex) => ({
      order: attractionIndex + 1,
      id: item.id,
      name: item.name,
      duration: item.duration,
      startTime: item.startTime,
      endTime: item.endTime,
      transportMode: item.transportMode,
      travelTime: item.travelTime,
      locationName: item.locationName,
    })),
  })),
})

const proxyClient = async () => {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('請先登入')
  return new GoogleGenAI({
    apiKey: 'proxied-by-edge-function',
    apiVersion: 'v1beta',
    httpOptions: {
      baseUrl: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-proxy`,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      timeout: 45_000,
    },
  })
}

export const createGeminiAssistantModel = (): AssistantModel => ({
  async respond(request) {
    const ai = await proxyClient()
    const transcript = request.messages.map((message) => `${message.role}: ${message.content}`).join('\n')
    const locale = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'zh-TW'
    const prompt = [
      `You are a travel itinerary assistant. Answer in the user's language (${locale}).`,
      'Only create a proposal when the user explicitly asks to change the itinerary.',
      'Allowed operation types: set_day_start_time, add_attraction, update_attraction, remove_attraction, move_attraction, reorder_attractions.',
      'Never invent IDs. Existing IDs must come from the supplied itinerary.',
      'A reorder operation may list only the attractions being moved; omitted attractions keep their relative order.',
      'A newly added attraction may have null Google Place ID/coordinates when it cannot be found; never invent location data.',
      'Estimate travelTime as non-negative integer minutes from the itinerary context and transport mode; use null when uncertain.',
      'Return JSON only: {"reply":"...","proposal":null} or {"reply":"...","proposal":{"title":"...","explanation":"...","operations":[...]}}.',
      request.summary ? `Earlier conversation summary:\n${request.summary}` : '',
      `Recent conversation:\n${transcript}`,
      `Current complete itinerary (all days and ordered attractions; use this current state rather than only the summary):\n${JSON.stringify(itineraryForPrompt(request.itinerary))}`,
      `Current day revisions:\n${JSON.stringify(request.dayRevisions)}`,
    ].filter(Boolean).join('\n\n')
    const response = await ai.models.generateContent({
      model: import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.5-flash-lite',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { responseMimeType: 'application/json' },
    })
    if (!response.text) throw new Error('Gemini did not return a response')
    return parseModelResult(JSON.parse(response.text))
  },
  async summarize(currentSummary, messages) {
    const ai = await proxyClient()
    const response = await ai.models.generateContent({
      model: import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.5-flash-lite',
      contents: [{
        role: 'user',
        parts: [{
          text: [
            `Summarize this travel-planning conversation in the user's language (${typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'zh-TW'}).`,
            'Preserve decisions, preferences, constraints, dates, and unresolved questions. Do not include proposal JSON.',
            currentSummary ? `Existing summary:\n${currentSummary}` : '',
            messages.map((message) => `${message.role}: ${message.content}`).join('\n'),
          ].filter(Boolean).join('\n\n'),
        }],
      }],
    })
    if (!response.text) throw new Error('Gemini did not return a summary')
    return response.text.trim()
  },
})

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
  proposalStatus: Annotation<AssistantGraphState['proposalStatus']>({ default: () => null, reducer: (_, update) => update }),
  error: Annotation<string | null>({ default: () => null, reducer: (_, update) => update }),
})

const defaultState = (version: number): AssistantGraphState => ({
  graphVersion: version,
  summary: '',
  messages: [],
  request: null,
  assistantMessage: null,
  pendingProposal: null,
  proposalStatus: null,
  error: null,
})

const asGraphState = (value: unknown, version: number): AssistantGraphState => ({
  ...defaultState(version),
  ...(isRecord(value) ? value : {}),
}) as AssistantGraphState

const interruptFrom = (value: unknown): AssistantInterruptPayload | null => {
  const state = asGraphState(value, ASSISTANT_GRAPH_VERSION)
  if (state.pendingProposal?.status === 'pending' && state.proposalStatus === 'pending') {
    return { kind: 'itinerary_proposal', proposal: state.pendingProposal }
  }
  return null
}

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

  const workflow = new StateGraph(GraphState)
    .addNode('respond', async (state) => {
      const request = state.request
      if (!request) throw new Error('Assistant turn request is missing')
      const result = await dependencies.model.respond({
        summary: state.summary,
        messages: state.messages,
        userText: request.text,
        itinerary: request.itinerary,
        dayRevisions: request.dayRevisions,
      })
      const assistantMessage: AssistantMessage = {
        id: crypto.randomUUID(),
        turnId: request.turnId,
        role: 'assistant',
        content: result.reply,
        createdAt: new Date().toISOString(),
      }
      let proposal: ItineraryChangeProposal | null = null
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
        proposalStatus: proposal?.status ?? null,
        request: null,
        error: null,
      }
    })
    .addNode('persist_proposal', async (state) => {
      if (!state.pendingProposal) throw new Error('Proposal is missing')
      await dependencies.proposals.savePending(state.pendingProposal)
      return {}
    })
    // Browser runtimes do not provide AsyncLocalStorage, so the graph uses a
    // static breakpoint before this node. resumeProposal updates state as if
    // this node completed, then continues along the matching edge.
    .addNode('approval', () => ({}))
    .addNode('apply_proposal', async (state) => {
      if (!state.pendingProposal) throw new Error('Proposal is missing')
      const status = await dependencies.proposals.apply({ ...state.pendingProposal, status: 'approved' })
      return {
        proposalStatus: status,
        pendingProposal: { ...state.pendingProposal, status },
      }
    })
    .addNode('reject_proposal', async (state) => {
      if (!state.pendingProposal) throw new Error('Proposal is missing')
      await dependencies.proposals.reject(state.pendingProposal.id)
      return {
        proposalStatus: 'rejected' as const,
        pendingProposal: { ...state.pendingProposal, status: 'rejected' as const },
      }
    })
    .addNode('summarize', async (state) => {
      if (!shouldSummarizeMessages(state.messages, summaryMessageThreshold, summaryCharacterThreshold)) return {}
      const summary = await dependencies.model.summarize(state.summary, state.messages)
      return { summary, messages: recentAssistantMessages(state.messages, recentMessageCount) }
    })
    .addEdge(START, 'respond')
    .addConditionalEdges('respond', (state) => state.pendingProposal ? 'proposal' : 'answer', {
      proposal: 'persist_proposal',
      answer: 'summarize',
    })
    .addEdge('persist_proposal', 'approval')
    .addConditionalEdges('approval', (state) => state.proposalStatus === 'approved' ? 'approved' : 'rejected', {
      approved: 'apply_proposal',
      rejected: 'reject_proposal',
    })
    .addEdge('apply_proposal', 'summarize')
    // Rejecting a proposal is a control decision, not a new model turn.
    // Finish immediately so the composer can continue the conversation
    // without triggering another summary/model action.
    .addEdge('reject_proposal', END)
    .addEdge('summarize', END)
    .compile({ checkpointer, interruptBefore: ['approval'] })

  const config = (threadId: string) => ({ configurable: { thread_id: threadId }, durability: 'exit' as const })

  const result = (value: unknown): AssistantTurnResult => ({
    state: asGraphState(value, graphVersion),
    interrupt: interruptFrom(value),
  })

  const getState = async (threadId: string) => {
    const snapshot = await workflow.getState(config(threadId))
    if (!snapshot.config.configurable?.checkpoint_id) return null
    return asGraphState(snapshot.values, graphVersion)
  }

  return {
    async sendTurn(request) {
      const previous = await getState(request.threadId)
      if (previous && previous.graphVersion !== graphVersion) {
        throw new AssistantGraphVersionError(previous.graphVersion, graphVersion)
      }
      const completedTurn = previous?.messages.find((message) =>
        message.turnId === request.turnId && message.role === 'assistant')
      if (completedTurn && previous) return result({ ...previous, assistantMessage: completedTurn })
      const existingUserMessage = previous?.messages.find((message) =>
        message.turnId === request.turnId && message.role === 'user')
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
        proposalStatus: null,
        error: null,
      }, config(request.threadId))
      return result(output)
    },
    async resumeProposal(threadId, approved) {
      const previous = await getState(threadId)
      if (!previous) throw new Error('Assistant thread has no checkpoint to resume')
      if (previous.graphVersion !== graphVersion) {
        throw new AssistantGraphVersionError(previous.graphVersion, graphVersion)
      }
      await workflow.updateState(config(threadId), {
        proposalStatus: approved ? 'approved' : 'rejected',
      }, 'approval')
      return result(await workflow.invoke(null, config(threadId)))
    },
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
      }, 'summarize')
      const updated = await getState(threadId)
      if (!updated) throw new Error('Assistant summary checkpoint was not saved')
      return updated
    },
    getState,
  }
}
