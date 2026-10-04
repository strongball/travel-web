import { AIMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { getWriter, type LangGraphRunnableConfig } from '@langchain/langgraph/web'
import {
  buildAssistantSystemPrompt,
  invokeAssistantModel,
} from '../../services'
import type { AssistantProgressPhase } from '../../types'
import type { AssistantGraphNodeState } from '../graphState'
import { assistantProposalTools } from '../../tools'
import { buildHumanMessage, validateModelInputSize } from '../../utils/modelMessages'

export const MAX_ASSISTANT_TOOL_ROUNDS = 10
const interactiveToolNames = new Set<string>(assistantProposalTools.map((tool) => tool.name))

type RespondNodeOptions = {
  emitProgress: (threadId: string, phase: AssistantProgressPhase) => void
}

export function createRespondNode(options: RespondNodeOptions) {
  return async (state: AssistantGraphNodeState, config: LangGraphRunnableConfig) => {
    const request = state.request
    if (!request) throw new Error('Assistant graph request is missing')
    if (state.toolRound >= MAX_ASSISTANT_TOOL_ROUNDS) {
      throw new Error('AI 工具修正次數已達上限，請重試或補充需求；原訊息與已確認的結果會保留。')
    }

    options.emitProgress(request.threadId, 'generating_response')
    const systemPrompt = buildAssistantSystemPrompt(request.itinerary, state.summary || null)
    const initialHumanMessage = buildHumanMessage({ text: request.text, attachments: request.attachments })

    const historyMessages: BaseMessage[] = state.messages
      .filter((m) => m.turnId !== request.turnId)
      .map((m) =>
        m.role === 'user'
          ? buildHumanMessage({ text: m.content, attachments: m.attachments })
          : new AIMessage(m.content),
      )

    const systemMessage = new SystemMessage(systemPrompt)
    const modelMessages =
      state.modelMessages.length > 0
        ? state.modelMessages
        : [systemMessage, ...historyMessages, initialHumanMessage]
    validateModelInputSize(modelMessages)
    const writer = getWriter(config)
    const response = await invokeAssistantModel(
      modelMessages,
      (text) => {
        writer?.({
          type: 'assistant_text_delta',
          turnId: request.turnId,
          text,
        })
      },
      request.selectedModel,
      request.thinkingBudget,
      config?.signal,
    )
    if (response.invalid_tool_calls?.length) {
      throw new Error('模型回傳了無法解析的工具參數，請重試')
    }
    const usedIds = new Set(state.modelMessages.flatMap((message) => AIMessage.isInstance(message)
      ? (message.tool_calls ?? []).map((call) => call.id) : []))
    const toolCalls = (response.tool_calls ?? []).map((call, index) => {
      let id = typeof call.id === 'string' && call.id ? call.id : `assistant-tool-${state.toolRound}-${index}`
      if (usedIds.has(id)) id = `assistant-tool-${state.toolRound}-${index}`
      while (usedIds.has(id)) id += '-new'
      usedIds.add(id)
      return { ...call, id }
    })
    const normalizedResponse = toolCalls.length > 0
      ? new AIMessage({
        content: response.content,
        id: response.id,
        name: response.name,
        additional_kwargs: response.additional_kwargs,
        response_metadata: response.response_metadata,
        tool_calls: toolCalls,
      })
      : response

    // A single resume decision must never approve other unseen interactive calls.
    const feedback = toolCalls.length > 1 && toolCalls.some((call) => interactiveToolNames.has(call.name))
      ? toolCalls.map((call) => new ToolMessage({
        tool_call_id: call.id, name: call.name, status: 'error',
        content: '每次只能提出一個需要使用者確認或回答的工具呼叫。請先完成查詢，再單獨提出提案或問題；本批工具尚未執行。',
      })) : []
    return {
      modelMessages: [...modelMessages, normalizedResponse, ...feedback],
      toolRound: toolCalls.length > 0 ? state.toolRound + 1 : state.toolRound,
    }
  }
}
