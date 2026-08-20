import { AIMessage, ToolMessage } from '@langchain/core/messages'
import type {
  AssistantMessage,
  AssistantProgressPhase,
  ItineraryChangeProposal,
} from '../../types'
import type { AssistantGraphNodeState } from '../graphState'

type FinalizeResponseNodeOptions = {
  emitProgress?: (threadId: string, phase: AssistantProgressPhase) => void
}

export function createFinalizeResponseNode(options: FinalizeResponseNodeOptions = {}) {
  return async (state: AssistantGraphNodeState) => {
    const request = state.request
    if (!request) throw new Error('Assistant graph request is missing')

    const lastAiIndex = state.modelMessages.findLastIndex((message) => AIMessage.isInstance(message))
    const lastAiMessage = state.modelMessages[lastAiIndex]
    if (!lastAiMessage || !AIMessage.isInstance(lastAiMessage)) {
      throw new Error('模型沒有回傳可完成的訊息')
    }

    const reply = typeof lastAiMessage.content === 'string' ? lastAiMessage.content.trim() : ''
    if (!reply) throw new Error('模型回傳了空的文字內容')

    const proposalMessage = state.modelMessages
      .filter((message) => ToolMessage.isInstance(message))
      .findLast((message) => {
        const artifact = message.artifact as { proposal?: ItineraryChangeProposal } | undefined
        return artifact?.proposal?.turnId === request.turnId
      })
    const completedProposal = (
      proposalMessage?.artifact as { proposal?: ItineraryChangeProposal } | undefined
    )?.proposal ?? null

    const assistantMessage: AssistantMessage = {
      id: crypto.randomUUID(),
      turnId: request.turnId,
      role: 'assistant',
      content: reply,
      createdAt: new Date().toISOString(),
      proposal: completedProposal,
    }

    if (request.threadId) options.emitProgress?.(request.threadId, 'saving_checkpoint')
    return {
      assistantMessage,
      messages: [...state.messages, assistantMessage],
      request: null,
      modelMessages: [],
      toolRound: 0,
    }
  }
}
