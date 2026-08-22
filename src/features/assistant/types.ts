import type { Itinerary, TodoItem, TripDay } from '../../types/database'
import type { BaseMessage } from '@langchain/core/messages'

export const ASSISTANT_GRAPH_VERSION = 8

export type AssistantProgressPhase =
  | 'checking_context'
  | 'summarizing_context'
  | 'generating_response'
  | 'validating_response'
  | 'applying_proposal'
  | 'saving_checkpoint'
  | 'saving_response'
  | 'syncing_conversation'

export type AssistantProgressListener = (phase: AssistantProgressPhase) => void

export type AssistantStreamEvent = {
  type: 'assistant_text_delta'
  turnId: string
  text: string
}

export type AssistantStreamListener = (event: AssistantStreamEvent) => void

export type AssistantMessageRole = 'user' | 'assistant'

export type AssistantMessage = {
  id: string
  turnId: string
  role: AssistantMessageRole
  content: string
  createdAt: string
  /** Completed proposal result; pending proposals live on pendingToolCall. */
  proposal?: ItineraryChangeProposal | null
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

export type AssistantTodoDraft = {
  title: string
  category: string
}

export type AssistantOperation =
  | { type: 'set_day_start_time'; dayId: string; startTime: string }
  | { type: 'add_attraction'; dayId: string; attraction: AssistantAttractionDraft; index?: number }
  | { type: 'update_attraction'; attractionId: string; changes: Partial<Omit<AssistantAttractionDraft, 'id'>> }
  | { type: 'remove_attraction'; attractionId: string }
  | { type: 'move_attraction'; attractionId: string; targetDayId: string; index: number }
  | { type: 'reorder_attractions'; dayId: string; attractionIds: string[] }
  | { type: 'add_todo'; title: string; category?: string }
  | { type: 'add_todo_category'; name: string }

export type AssistantProposalStatus =
  | 'pending'
  | 'approved'
  | 'applied'
  | 'rejected'
  | 'expired'

export type BaseAssistantProposal = {
  id: string
  threadId: string
  turnId: string
  title: string
  explanation: string
  status: AssistantProposalStatus
  createdAt: string
}

export type ItineraryChangeProposal = BaseAssistantProposal & {
  itineraryId: string
  expectedDayRevisions: Record<string, number>
  operations: AssistantOperation[]
  beforeDays: TripDay[]
  afterDays: TripDay[]
  proposedTodos: Array<{ title: string; category: string }>
  proposedCategories: string[]
}

export type AssistantProposal = ItineraryChangeProposal

export type AssistantTurnRequest = {
  threadId: string
  turnId: string
  text: string
  itinerary: Itinerary
  todos?: TodoItem[]
  todoCategories?: string[]
  dayRevisions: Record<string, number>
  createdAt?: string
  rehydratedSummary?: string
  rehydratedMessages?: AssistantMessage[]
}

export type AssistantUserDecision = {
  approved: boolean
  feedback?: string
}

export type AssistantProposalReviewInterrupt = {
  type: 'proposal_review'
  toolCallId: string
  proposal: ItineraryChangeProposal
}

/**
 * A proposal tool call that is paused at an interrupt and waiting for the
 * user's decision. This is derived from the LangGraph checkpoint; it is not a
 * canonical assistant message.
 */
export type AssistantPendingToolCall = {
  id: string
  name: string
  proposal: ItineraryChangeProposal
}

export type AssistantProposalExecution = {
  apply: (proposal: ItineraryChangeProposal) => Promise<AssistantProposalStatus | void>
}

export type AssistantGraphDependencies = {
  proposals: AssistantProposalExecution
  graphVersion?: number
  summaryMessageThreshold?: number
  summaryCharacterThreshold?: number
  recentMessageCount?: number
  maxToolRounds?: number
}

export type AssistantGraphState = {
  graphVersion: number
  summary: string
  messages: AssistantMessage[]
  request: AssistantTurnRequest | null
  assistantMessage: AssistantMessage | null
  pendingToolCall: AssistantPendingToolCall | null
  modelMessages: BaseMessage[]
  toolRound: number
}

export type AssistantGraphRunner = {
  sendTurn: (
    request: AssistantTurnRequest,
    onProgress?: AssistantProgressListener,
    onStream?: AssistantStreamListener,
  ) => Promise<AssistantGraphState>
  resumeTurn: (
    threadId: string,
    decision: AssistantUserDecision,
    onProgress?: AssistantProgressListener,
    onStream?: AssistantStreamListener,
  ) => Promise<AssistantGraphState>
  summarizeThread: (threadId: string) => Promise<AssistantGraphState>
  getState: (threadId: string) => Promise<AssistantGraphState | null>
}
