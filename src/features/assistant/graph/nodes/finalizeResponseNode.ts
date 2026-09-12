import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { extractMessageText } from '../../services'
import { formatToolCallLabel } from '../../utils/conversationUtils'
import type {
  AssistantCodeExecution,
  AssistantGroundingMetadata,
  AssistantMessage,
  AssistantProgressPhase,
  AssistantProposal,
  AssistantToolCallRecord,
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

    // Generically collect all tool artifacts produced during this turn
    const toolArtifacts: Record<string, unknown> = {}
    for (const msg of state.modelMessages) {
      if (ToolMessage.isInstance(msg) && msg.artifact && typeof msg.artifact === 'object') {
        Object.assign(toolArtifacts, msg.artifact)
      }
    }

    const completedProposal = (toolArtifacts.proposal as AssistantProposal) ?? null
    const completedQuestion = (toolArtifacts.questionResult as AssistantMessage['clarifyingQuestion']) ?? null

    const reply = extractMessageText(lastAiMessage.content)
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

    const allToolCalls: AssistantToolCallRecord[] = []
    for (const msg of state.modelMessages) {
      if (AIMessage.isInstance(msg) && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls) {
          allToolCalls.push({
            id: tc.id,
            name: tc.name,
            label: formatToolCallLabel(tc.name, tc.args as Record<string, unknown>),
            args: (tc.args as Record<string, unknown>) ?? {},
          })
        }
      }
    }
    const toolCalls: AssistantToolCallRecord[] | null = allToolCalls.length > 0 ? allToolCalls : null

    const assistantMessage: AssistantMessage = {
      id: crypto.randomUUID(),
      turnId: request.turnId,
      role: 'assistant',
      content: reply,
      createdAt: new Date().toISOString(),
      proposal: completedProposal,
      clarifyingQuestion: completedQuestion,
      grounding,
      codeExecutions,
      toolCalls,
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
