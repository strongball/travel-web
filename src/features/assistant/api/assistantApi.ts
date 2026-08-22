import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from '@langchain/core/messages'
import type { Itinerary } from '../../../types/database'
import { supabase } from '../../../lib/supabase'
import type {
  AssistantMessage,
} from '../types'
import {
  PROPOSAL_TOOL_NAME,
  TODO_PROPOSAL_TOOL_NAME,
  langchainAssistantTools,
} from '../tools'

export {
  PROPOSAL_TOOL_NAME,
  TODO_PROPOSAL_TOOL_NAME,
  langchainAssistantTools,
}

const modelName = import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.7-flash'

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

/** Bind the assistant tool registry using LangChain's provider adapter. */
export function bindAssistantTools(model: ChatGoogleGenerativeAI) {
  return model.bindTools(langchainAssistantTools, { tool_choice: 'auto' })
}

export async function invokeAssistantModel(
  messages: BaseMessage[],
  onTextDelta?: (text: string) => void,
): Promise<AIMessage> {
  const model = await createLangChainChatModel()
  const assistantModel = bindAssistantTools(model)
  if (!onTextDelta) {
    const response = await assistantModel.invoke(messages)
    return response as AIMessage
  }

  let response: AIMessageChunk | null = null
  const stream = await assistantModel.stream(messages)
  for await (const chunk of stream) {
    const aiChunk = chunk as AIMessageChunk
    const text = aiChunk.text
    if (text) onTextDelta(text)
    response = response ? response.concat(aiChunk) : aiChunk
  }

  if (!response) throw new Error('模型沒有回傳可完成的訊息')
  return new AIMessage({
    content: response.content,
    id: response.id,
    name: response.name,
    additional_kwargs: response.additional_kwargs,
    response_metadata: response.response_metadata,
    tool_calls: response.tool_calls,
    invalid_tool_calls: response.invalid_tool_calls,
    usage_metadata: response.usage_metadata,
  })
}

export function buildAssistantPrompt(
  itinerary: Itinerary,
  summary: string | null,
  messages: AssistantMessage[],
  currentQuestion: string,
  todos: Array<{ title: string; category: string; isCompleted: boolean }> = [],
  todoCategories: string[] = [],
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

  promptParts.push(
    '',
    '## 目前待辦清單',
    `現有分類：${todoCategories.length > 0 ? todoCategories.join('、') : '行前準備、旅途中、其他'}`,
    ...(todos.length > 0
      ? todos.map((todo, index) => `${index + 1}. [${todo.isCompleted ? '已完成' : '未完成'}] ${todo.title}（分類：${todo.category}）`)
      : ['- （目前尚無待辦事項）']),
  )

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

export async function summarizeWithGemini(currentSummary: string, messages: AssistantMessage[]) {
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
}

