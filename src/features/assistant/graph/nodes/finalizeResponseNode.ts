import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { extractMessageText } from '../../api'
import type {
  AssistantCodeExecution,
  AssistantGroundingMetadata,
  AssistantMessage,
  AssistantProgressPhase,
  AssistantProposal,
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

    const proposalMessage = state.modelMessages
      .filter((message) => ToolMessage.isInstance(message))
      .findLast((message) => {
        const artifact = message.artifact as { proposal?: AssistantProposal } | undefined
        return artifact?.proposal?.turnId === request.turnId
      })
    const completedProposal = (
      proposalMessage?.artifact as { proposal?: AssistantProposal } | undefined
    )?.proposal ?? null

    const rawReply = extractMessageText(lastAiMessage.content)
    const reply =
      rawReply ||
      (completedProposal
        ? completedProposal.status === 'applied'
          ? '已成功套用行程調整。'
          : completedProposal.status === 'rejected'
            ? '已取消套用此行程調整。'
            : '已完成處理。'
        : '')

    if (!reply) throw new Error('模型回傳了空的文字內容')

    const allGroundingQueries: string[] = []
    const allGroundingSources: Array<{ title?: string; uri?: string }> = []
    const allCodeExecutions: AssistantCodeExecution[] = []

    for (const msg of state.modelMessages) {
      if (AIMessage.isInstance(msg) && msg.response_metadata) {
        const g = (msg.response_metadata as { assistantGrounding?: AssistantGroundingMetadata | null }).assistantGrounding
        if (g) {
          if (g.webSearchQueries) allGroundingQueries.push(...g.webSearchQueries)
          if (g.sources) allGroundingSources.push(...g.sources)
        }
        const c = (msg.response_metadata as { assistantCodeExecutions?: AssistantCodeExecution[] | null }).assistantCodeExecutions
        if (c) {
          allCodeExecutions.push(...c)
        }
      }
    }

    const uniqueSources = allGroundingSources.filter((s, idx, arr) => (
      s.uri ? arr.findIndex((x) => x.uri === s.uri) === idx : true
    ))
    const uniqueQueries = [...new Set(allGroundingQueries)]

    const grounding: AssistantGroundingMetadata | null = (uniqueQueries.length > 0 || uniqueSources.length > 0)
      ? { webSearchQueries: uniqueQueries, sources: uniqueSources }
      : null
    const codeExecutions: AssistantCodeExecution[] | null = allCodeExecutions.length > 0 ? allCodeExecutions : null

    const assistantMessage: AssistantMessage = {
      id: crypto.randomUUID(),
      turnId: request.turnId,
      role: 'assistant',
      content: reply,
      createdAt: new Date().toISOString(),
      proposal: completedProposal,
      grounding,
      codeExecutions,
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
