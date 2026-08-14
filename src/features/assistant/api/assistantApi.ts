import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { Itinerary } from '../../../types/database'
import { supabase } from '../../../lib/supabase'
import type {
  AssistantMessage,
  AssistantModel,
  AssistantModelRequest,
  AssistantModelResult,
} from '../types'
import {
  PROPOSAL_TOOL_NAME,
  TODO_PROPOSAL_TOOL_NAME,
  langchainAssistantTools,
  executeAssistantToolCall,
  parseAssistantModelResult,
} from '../tools'

export {
  PROPOSAL_TOOL_NAME,
  TODO_PROPOSAL_TOOL_NAME,
  langchainAssistantTools,
  executeAssistantToolCall,
  parseAssistantModelResult,
}

const modelName = import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.5-flash-lite'

export async function createLangChainChatModel(): Promise<ChatGoogleGenerativeAI> {
  const apiKey = (import.meta.env.VITE_GEMINI_API_KEY || '').trim() || 'proxy-mode'
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

  let baseUrl: string | undefined
  let customHeaders: Record<string, string> | undefined

  if (supabaseUrl) {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token || ''
    baseUrl = `${supabaseUrl}/functions/v1/gemini-proxy`
    customHeaders = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(publishableKey ? { apikey: publishableKey } : {}),
    }
  }

  return new ChatGoogleGenerativeAI({
    model: modelName,
    apiKey,
    temperature: 0.2,
    ...(baseUrl ? { baseUrl } : {}),
    ...(customHeaders ? { customHeaders } : {}),
  })
}

/**
 * Bind the proposal tool contract using the provider-supported option.
 * Gemini may still return parallel calls, so the response path applies one
 * deterministic merge before invoking the graph proposal persistence.
 */
export function bindAssistantTools(model: ChatGoogleGenerativeAI) {
  return model.bindTools(langchainAssistantTools, { tool_choice: 'auto' })
}

export function buildAssistantPrompt(
  itinerary: Itinerary,
  summary: string | null,
  messages: AssistantMessage[],
  currentQuestion: string,
) {
  const promptParts = [
    '你是一位專業、條理分明的旅遊行程規劃助理。',
    '請一律使用與使用者發問時相同的語言進行回覆（使用者用繁體中文就用繁體中文回覆，使用者用英文就用英文回覆，使用者用日文就用日文回覆等）。',
    '請根據以下行程目前狀態與對話脈絡提供協助。',
    '',
    '## 核心原則',
    '1. 一般問答、提供旅遊建議、景點介紹、交通方式、或是詢問/釐清細節時，直接回覆自然文字即可，**不要**呼叫任何 Tool。',
    '2. 只有在使用者明確要求、同意或接受「修改行程景點」時，才呼叫 `propose_itinerary_edit` 工具提出具體操作（ operations ）。',
    '3. 當使用者要求「規劃、整理、建議或新增待辦清單」（如行前準備、打包清單、預約提醒等）時，呼叫 `propose_todo_list` 工具。',
    '4. 當你呼叫工具提出提案時，該提案會由使用者介面長出專屬畫面讓使用者確認後才儲存與套用。',
    '',
    '## 當前行程摘要',
    `標題：${itinerary.title}`,
    `貨幣：${itinerary.currency}`,
    `出發日期：${itinerary.startDate || '未設定'}`,
    `天數：${itinerary.days?.length ?? 0}`,
    '',
    '## 每日景點現況',
    ...(itinerary.days ?? []).flatMap((day, dayIndex) => [
      `### 第 ${dayIndex + 1} 天（ID: ${day.id}，日期：${day.date.slice(0, 10)}，開始時間：${day.startTime?.slice(11, 16) || '未設定'}）`,
      ...(day.attractions.length === 0
        ? ['- （尚無景點）']
        : day.attractions.map((attraction, attractionIndex) =>
          `${attractionIndex + 1}. ID: ${attraction.id} | 名稱: ${attraction.name} | 地點: ${attraction.locationName || attraction.name} | 時間: ${attraction.startTime?.slice(11, 16) || '未排'}~${attraction.endTime?.slice(11, 16) || '未排'} | 停留: ${attraction.duration}分 | 交通: ${attraction.transportMode} (${attraction.travelTime ?? 0}分)`,
        )),
    ]),
  ]

  if (summary) {
    promptParts.push('', '## 先前對話摘要', summary)
  }

  if (messages.length > 0) {
    promptParts.push(
      '',
      '## 近期對話紀錄',
      ...messages.map((message) => `${message.role === 'user' ? '使用者' : '助理'}：${message.content}`),
    )
  }

  promptParts.push('', '## 使用者最新訊息', currentQuestion)

  return promptParts.join('\n')
}

export const browserAssistantModel: AssistantModel = {
  summarize: async (currentSummary: string, messages: AssistantMessage[]) => {
    const model = await createLangChainChatModel()
    const response = await model.invoke([
      new SystemMessage('請將以下旅遊規劃對話整理成精簡摘要。重點保留：使用者偏好、已討論的景點與尚未決定的事項。請使用對話中最主要的語言進行摘要。'),
      new HumanMessage(
        [
          currentSummary ? `目前的摘要：${currentSummary}` : '',
          '對話紀錄：',
          ...messages.map((m) => `${m.role === 'user' ? '使用者' : '助理'}：${m.content}`),
        ]
          .filter(Boolean)
          .join('\n\n'),
      ),
    ])
    return typeof response.content === 'string' ? response.content.trim() : ''
  },
  respond: async (modelRequest: AssistantModelRequest): Promise<AssistantModelResult> => {
    const model = await createLangChainChatModel()
    const modelWithTools = bindAssistantTools(model)

    const prompt = buildAssistantPrompt(
      modelRequest.itinerary,
      modelRequest.summary || null,
      modelRequest.messages,
      modelRequest.userText,
    )

    const response = await modelWithTools.invoke([new HumanMessage(prompt)])

    // 1. Tool Call invocation via LangChain
    if (response.tool_calls && response.tool_calls.length > 0) {
      return await executeAssistantToolCalls(response.tool_calls)
    }

    // 2. Direct plain text response (No tool called)
    const reply = typeof response.content === 'string' ? response.content.trim() : ''
    if (!reply) {
      throw new Error('模型回傳了空的文字內容')
    }

    return { reply }
  },
}

type AssistantToolCallLike = {
  name?: unknown
  args?: unknown
}

/**
 * Gemini supports parallel function calling. Merge all validated tool results
 * into one proposal so a parallel response cannot leave a half-applied turn.
 */
export async function executeAssistantToolCalls(
  toolCalls: readonly AssistantToolCallLike[],
): Promise<AssistantModelResult> {
  if (toolCalls.length === 0) throw new Error('模型沒有回傳工具呼叫')

  const calls = toolCalls.map((call) => {
    if (!call || typeof call.name !== 'string' || !call.name) {
      throw new Error('工具名稱遺失')
    }
    const args = call.args && typeof call.args === 'object' && !Array.isArray(call.args)
      ? call.args as Record<string, unknown>
      : {}
    return { name: call.name, args }
  })

  const results = await Promise.all(calls.map((call) => executeAssistantToolCall(call.name, call.args)))
  if (results.length === 1) return results[0]

  const proposals = results.flatMap((result) => result.proposal ? [result.proposal] : [])
  const reply = results.map((result) => result.reply.trim()).filter(Boolean).join('\n\n')
  if (proposals.length === 0) return { reply }

  return {
    reply,
    proposal: {
      title: proposals.length === 1 ? proposals[0].title : '綜合旅程與待辦提案',
      explanation: proposals.map((proposal) => proposal.explanation).filter(Boolean).join('\n\n'),
      operations: proposals.flatMap((proposal) => proposal.operations),
    },
  }
}
