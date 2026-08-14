import { AIMessage, ToolMessage } from '@langchain/core/messages'
import {
  mergeAssistantToolResults,
  normalizeAssistantOperations,
  parseAssistantModelResult,
  validateAssistantOperations,
} from '../../api'
import type {
  AssistantMessage,
  AssistantModelResult,
  AssistantProgressPhase,
  ItineraryChangeProposal,
} from '../../types'
import type { AssistantGraphNodeState } from '../graphState'

type FinalizeResponseNodeOptions = {
  savePending: (proposal: ItineraryChangeProposal) => Promise<void>
  emitProgress: (threadId: string, phase: AssistantProgressPhase) => void
}

function parseToolMessage(message: ToolMessage): AssistantModelResult {
  const content = typeof message.content === 'string' ? JSON.parse(message.content) : message.content
  return parseAssistantModelResult(content)
}

export function createFinalizeResponseNode(options: FinalizeResponseNodeOptions) {
  return async (state: AssistantGraphNodeState) => {
    const request = state.request
    if (!request) throw new Error('Assistant graph request is missing')

    const lastAiIndex = state.modelMessages.findLastIndex((message) => AIMessage.isInstance(message))
    const lastAiMessage = state.modelMessages[lastAiIndex]
    if (!lastAiMessage || !AIMessage.isInstance(lastAiMessage)) {
      throw new Error('模型沒有回傳可完成的訊息')
    }

    let result: AssistantModelResult
    if (state.toolCallKind === 'terminal') {
      const toolResults = state.modelMessages
        .slice(lastAiIndex + 1)
        .filter((message): message is ToolMessage => ToolMessage.isInstance(message))
        .map(parseToolMessage)
      if (toolResults.length === 0) throw new Error('工具沒有回傳提案結果')
      result = mergeAssistantToolResults(toolResults)
    } else {
      const reply = typeof lastAiMessage.content === 'string' ? lastAiMessage.content.trim() : ''
      if (!reply) throw new Error('模型回傳了空的文字內容')
      result = { reply }
    }

    let proposal: ItineraryChangeProposal | null = null
    options.emitProgress(request.threadId, 'validating_response')
    if (result.proposal) {
      const operations = normalizeAssistantOperations(result.proposal.operations)
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

      options.emitProgress(request.threadId, 'saving_proposal')
      await options.savePending(proposal)
    }

    const assistantMessage: AssistantMessage = {
      id: crypto.randomUUID(),
      turnId: request.turnId,
      role: 'assistant',
      content: result.reply,
      createdAt: new Date().toISOString(),
      proposal,
    }

    options.emitProgress(request.threadId, 'saving_checkpoint')
    return {
      assistantMessage,
      messages: [...state.messages, assistantMessage],
      request: null,
      modelMessages: [],
      toolRound: 0,
      toolCallKind: null,
    }
  }
}
