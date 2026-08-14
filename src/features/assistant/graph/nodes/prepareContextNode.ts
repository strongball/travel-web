import type {
  AssistantMessage,
  AssistantProgressPhase,
} from '../../types'
import { summarizeWithGemini } from '../../api'
import type { AssistantGraphNodeState } from '../graphState'

type PrepareContextNodeOptions = {
  messageThreshold: number
  characterThreshold: number
  recentMessageCount: number
  emitProgress: (threadId: string, phase: AssistantProgressPhase) => void
  shouldSummarizeMessages: (
    messages: AssistantMessage[],
    messageThreshold: number,
    characterThreshold: number,
  ) => boolean
  recentAssistantMessages: (messages: AssistantMessage[], count: number) => AssistantMessage[]
}

export function createPrepareContextNode(options: PrepareContextNodeOptions) {
  return async (state: AssistantGraphNodeState) => {
    const request = state.request
    if (!request) throw new Error('Assistant graph request is missing')

    options.emitProgress(request.threadId, 'checking_context')
    const previousMessages = state.messages.filter((message) => message.turnId !== request.turnId)
    if (!options.shouldSummarizeMessages(
      previousMessages,
      options.messageThreshold,
      options.characterThreshold,
    )) {
      return {
        modelMessages: [],
        toolRound: 0,
        toolCallKind: null,
      }
    }

    options.emitProgress(request.threadId, 'summarizing_context')
    const currentTurnMessages = state.messages.filter((message) => message.turnId === request.turnId)
    const summary = await summarizeWithGemini(state.summary, previousMessages)
    return {
      summary,
      messages: [
        ...options.recentAssistantMessages(previousMessages, options.recentMessageCount),
        ...currentTurnMessages,
      ],
      modelMessages: [],
      toolRound: 0,
      toolCallKind: null,
    }
  }
}
