import { Annotation } from '@langchain/langgraph/web'
import type { BaseMessage } from '@langchain/core/messages'
import type {
  AssistantMessage,
  AssistantPendingToolCall,
  AssistantTurnRequest,
} from '../types'
import { ASSISTANT_GRAPH_VERSION } from '../types'

export const assistantGraphState = Annotation.Root({
  graphVersion: Annotation<number>({ default: () => ASSISTANT_GRAPH_VERSION, reducer: (_, update) => update }),
  summary: Annotation<string>({ default: () => '', reducer: (_, update) => update }),
  messages: Annotation<AssistantMessage[]>({ default: () => [], reducer: (_, update) => update }),
  request: Annotation<AssistantTurnRequest | null>({ default: () => null, reducer: (_, update) => update }),
  assistantMessage: Annotation<AssistantMessage | null>({ default: () => null, reducer: (_, update) => update }),
  pendingToolCall: Annotation<AssistantPendingToolCall | null>({ default: () => null, reducer: (_, update) => update }),
  modelMessages: Annotation<BaseMessage[]>({ default: () => [], reducer: (_, update) => update }),
  toolRound: Annotation<number>({ default: () => 0, reducer: (_, update) => update }),
})

export type AssistantGraphNodeState = {
  graphVersion: number
  summary: string
  messages: AssistantMessage[]
  request: AssistantTurnRequest | null
  assistantMessage: AssistantMessage | null
  pendingToolCall?: AssistantPendingToolCall | null
  modelMessages: BaseMessage[]
  toolRound: number
}
