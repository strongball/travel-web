import type { Itinerary } from '../../types/database'

export const ASSISTANT_GRAPH_VERSION = 4

export type AssistantProgressPhase =
  | 'checking_context'
  | 'summarizing_context'
  | 'generating_response'
  | 'validating_response'
  | 'saving_proposal'
  | 'applying_proposal'
  | 'saving_checkpoint'
  | 'saving_response'
  | 'syncing_conversation'

export type AssistantProgressListener = (phase: AssistantProgressPhase) => void

export type AssistantMessageRole = 'user' | 'assistant'

export type AssistantMessage = {
  id: string
  turnId: string
  role: AssistantMessageRole
  content: string
  createdAt: string
}

export type AssistantAttractionDraft = {
  id: string
  name: string
  description: string
  cost: number
  latitude: number | null
  longitude: number | null
  duration: number
  transportMode: string | null
  travelTime: number | null
  placeId: string | null
  locationName: string | null
}

export type AssistantOperation =
  | { type: 'set_day_start_time'; dayId: string; startTime: string }
  | { type: 'add_attraction'; dayId: string; attraction: AssistantAttractionDraft; index?: number }
  | { type: 'update_attraction'; attractionId: string; changes: Partial<Omit<AssistantAttractionDraft, 'id'>> }
  | { type: 'remove_attraction'; attractionId: string }
  | { type: 'move_attraction'; attractionId: string; targetDayId: string; index: number }
  | { type: 'reorder_attractions'; dayId: string; attractionIds: string[] }

export type AssistantProposalStatus =
  | 'pending'
  | 'approved'
  | 'applied'
  | 'rejected'
  | 'expired'

export type ItineraryChangeProposal = {
  id: string
  threadId: string
  turnId: string
  itineraryId: string
  title: string
  explanation: string
  expectedDayRevisions: Record<string, number>
  operations: AssistantOperation[]
  status: AssistantProposalStatus
  createdAt: string
}

export type AssistantTurnRequest = {
  threadId: string
  turnId: string
  text: string
  itinerary: Itinerary
  dayRevisions: Record<string, number>
  createdAt?: string
  rehydratedSummary?: string
  rehydratedMessages?: AssistantMessage[]
}

export type AssistantModelRequest = {
  summary: string
  messages: AssistantMessage[]
  userText: string
  itinerary: Itinerary
}

export type AssistantModelResult = {
  reply: string
  proposal?: {
    title: string
    explanation: string
    operations: AssistantOperation[]
  }
}

export type AssistantModel = {
  respond: (request: AssistantModelRequest) => Promise<AssistantModelResult>
  summarize: (currentSummary: string, messages: AssistantMessage[]) => Promise<string>
}

export type AssistantProposalPersistence = {
  savePending: (proposal: ItineraryChangeProposal) => Promise<void>
}

export type AssistantGraphDependencies = {
  model: AssistantModel
  proposals: AssistantProposalPersistence
  graphVersion?: number
  summaryMessageThreshold?: number
  summaryCharacterThreshold?: number
  recentMessageCount?: number
}

export type AssistantGraphState = {
  graphVersion: number
  summary: string
  messages: AssistantMessage[]
  request: AssistantTurnRequest | null
  assistantMessage: AssistantMessage | null
  pendingProposal: ItineraryChangeProposal | null
}

export type AssistantGraphRunner = {
  sendTurn: (request: AssistantTurnRequest, onProgress?: AssistantProgressListener) => Promise<AssistantGraphState>
  summarizeThread: (threadId: string) => Promise<AssistantGraphState>
  getState: (threadId: string) => Promise<AssistantGraphState | null>
}
