import { AIMessage, HumanMessage } from '@langchain/core/messages'
import { buildAssistantPrompt, invokeAssistantModel } from '../../api'
import type { AssistantProgressPhase } from '../../types'
import { classifyAssistantToolCalls } from '../routing'
import type { AssistantGraphNodeState } from '../graphState'

type RespondNodeOptions = {
  emitProgress: (threadId: string, phase: AssistantProgressPhase) => void
}

export function createRespondNode(options: RespondNodeOptions) {
  return async (state: AssistantGraphNodeState) => {
    const request = state.request
    if (!request) throw new Error('Assistant graph request is missing')

    options.emitProgress(request.threadId, 'generating_response')
    const modelMessages = state.modelMessages.length > 0
      ? state.modelMessages
      : [new HumanMessage(buildAssistantPrompt(
        request.itinerary,
        state.summary || null,
        state.messages,
        request.text,
        request.todos ?? [],
        request.todoCategories ?? [],
    ))]
    const response = await invokeAssistantModel(modelMessages)
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
      toolCallKind: classifyAssistantToolCalls(toolCalls),
    }
  }
}
