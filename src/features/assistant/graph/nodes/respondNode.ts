import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages'
import { getWriter, type LangGraphRunnableConfig } from '@langchain/langgraph/web'
import {
  buildAssistantSystemPrompt,
  buildAssistantUserPrompt,
  invokeAssistantModel,
} from '../../services'
import type { AssistantProgressPhase } from '../../types'
import type { AssistantGraphNodeState } from '../graphState'

type RespondNodeOptions = {
  emitProgress: (threadId: string, phase: AssistantProgressPhase) => void
}

export function createRespondNode(options: RespondNodeOptions) {
  return async (state: AssistantGraphNodeState, config: LangGraphRunnableConfig) => {
    const request = state.request
    if (!request) throw new Error('Assistant graph request is missing')

    options.emitProgress(request.threadId, 'generating_response')
    const systemPrompt = buildAssistantSystemPrompt(request.itinerary, state.summary || null)
    const promptText = buildAssistantUserPrompt(
      request.text,
      request.attachments ?? [],
    )

    const imageAttachments = (request.attachments ?? []).filter(
      (att) => att.mimeType.startsWith('image/') && att.dataUrl,
    )

    const initialHumanMessage =
      imageAttachments.length > 0
        ? new HumanMessage({
            content: [
              { type: 'text', text: promptText },
              ...imageAttachments.map((att) => ({
                type: 'image_url',
                image_url: { url: att.dataUrl },
              })),
            ],
          })
        : new HumanMessage(promptText)

    const historyMessages: BaseMessage[] = state.messages
      .filter((m) => m.turnId !== request.turnId)
      .map((m) =>
        m.role === 'user'
          ? new HumanMessage(m.content)
          : new AIMessage(m.content),
      )

    const systemMessage = new SystemMessage(systemPrompt)
    const modelMessages =
      state.modelMessages.length > 0
        ? state.modelMessages
        : [systemMessage, ...historyMessages, initialHumanMessage]
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
    )
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
