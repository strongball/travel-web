import { AIMessage, SystemMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { getWriter, type LangGraphRunnableConfig } from '@langchain/langgraph/web'
import {
  buildAssistantSystemPrompt,
  invokeAssistantModel,
} from '../../services'
import type { AssistantProgressPhase } from '../../types'
import type { AssistantGraphNodeState } from '../graphState'
import { assistantProposalTools } from '../../tools'
import { buildAssistantHistoryMessage, buildHumanMessage, validateModelInputSize } from '../../utils/modelMessages'

export const MAX_ASSISTANT_TOOL_ROUNDS = 10
export const MAX_ASSISTANT_TOOL_CORRECTIONS = 2
const interactiveToolNames = new Set<string>(assistantProposalTools.map((tool) => tool.name))

type RespondNodeOptions = {
  emitProgress: (threadId: string, phase: AssistantProgressPhase, detail?: string) => void
}

export function createRespondNode(options: RespondNodeOptions) {
  return async (state: AssistantGraphNodeState, config: LangGraphRunnableConfig) => {
    const request = state.request
    if (!request) throw new Error('Assistant graph request is missing')
    let consecutiveFailures = 0
    for (let index = state.modelMessages.length - 1; index >= 0 && consecutiveFailures < state.toolRound; index--) {
      const message = state.modelMessages[index]
      if (!AIMessage.isInstance(message)) continue
      const results = state.modelMessages.slice(index + 1).filter(ToolMessage.isInstance)
        .filter((result) => message.tool_calls?.some((call) => call.id === result.tool_call_id))
      if (!results.some((result) => result.status === 'error')) break
      consecutiveFailures++
    }
    const correctionBudgetExhausted = consecutiveFailures >= MAX_ASSISTANT_TOOL_CORRECTIONS
    const latestResults = state.modelMessages
      .slice(state.modelMessages.findLastIndex(AIMessage.isInstance) + 1)
      .filter(ToolMessage.isInstance)
    const toolBudgetExhausted = state.toolRound >= MAX_ASSISTANT_TOOL_ROUNDS
    const lastError = latestResults.findLast((message) => message.status === 'error')
    if (toolBudgetExhausted && lastError) {
      throw new Error(`AI 工具處理輪數已達上限。最後遇到的問題：${String(lastError.content).slice(0, 500)} 請重試或補充需求；原訊息與已確認的結果會保留。`)
    }

    const correcting = Boolean(lastError)
    options.emitProgress(request.threadId, 'generating_response', state.toolRound > 0
      ? `${correcting ? '工具回報問題，正在修正安排' : '已取得工具結果，正在整理安排'}（第 ${state.toolRound} 輪）`
      : undefined)
    const systemPrompt = buildAssistantSystemPrompt(request.itinerary, state.summary || null)
    const initialHumanMessage = buildHumanMessage({ text: request.text, attachments: request.attachments })

    const historyMessages: BaseMessage[] = state.messages
      .filter((m) => m.turnId !== request.turnId)
      .map(buildAssistantHistoryMessage)

    const systemMessage = new SystemMessage(systemPrompt)
    const modelMessages =
      state.modelMessages.length > 0
        ? state.modelMessages
        : [systemMessage, ...historyMessages, initialHumanMessage]
    const finishWithoutTools = toolBudgetExhausted || correctionBudgetExhausted
    const invocationMessages = finishWithoutTools
      ? [new SystemMessage(`${systemPrompt}\n工具流程應在取得足夠資料後完成；目前已達工具或連續修正上限。請簡短說明工具回報的具體限制並詢問缺少的資訊，或根據已有結果完成回覆；若任務尚未完成，明確說明限制與下一步，不可宣稱未完成的操作已成功。`),
        ...modelMessages.filter((message) => !SystemMessage.isInstance(message))]
      : modelMessages
    validateModelInputSize(invocationMessages)
    const writer = getWriter(config)
    const response = await invokeAssistantModel(
      invocationMessages,
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
      { allowTools: !finishWithoutTools },
    )
    if (response.invalid_tool_calls?.length) {
      throw new Error('模型回傳了無法解析的工具參數，請重試')
    }
    if (finishWithoutTools && response.tool_calls?.length) {
      throw new Error('AI 工具處理輪數已達上限，仍未能完成回覆，請重試或補充需求。')
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
