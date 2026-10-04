import { AIMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages'
import { getWriter, type LangGraphRunnableConfig } from '@langchain/langgraph/web'
import {
  buildAssistantSystemPrompt,
  invokeAssistantModel,
} from '../../services'
import type { AssistantProgressPhase } from '../../types'
import type { AssistantGraphNodeState } from '../graphState'
import { buildHumanMessage, validateModelInputSize } from '../../utils/modelMessages'

type RespondNodeOptions = {
  emitProgress: (threadId: string, phase: AssistantProgressPhase) => void
}

export function createRespondNode(options: RespondNodeOptions) {
  return async (state: AssistantGraphNodeState, config: LangGraphRunnableConfig) => {
    const request = state.request
    if (!request) throw new Error('Assistant graph request is missing')

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
    const toolCalls = (response.tool_calls ?? []).map((call, index) => ({
      ...call,
      id: typeof call.id === 'string' && call.id ? call.id : `assistant-tool-${state.toolRound}-${index}`,
    }))
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

    return {
      modelMessages: [...modelMessages, normalizedResponse],
      toolRound: toolCalls.length > 0 ? state.toolRound + 1 : state.toolRound,
    }
  }
}
