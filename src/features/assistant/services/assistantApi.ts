import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import {
  AIMessage,
  AIMessageChunk,
  HumanMessage,
  SystemMessage,
  type BaseMessage,
} from '@langchain/core/messages'
import { config } from '../../../config'
import type { Itinerary } from '../../../types/database'
import { supabase } from '../../../lib/supabase'
import type {
  AssistantAttachment,
  AssistantCodeExecution,
  AssistantGroundingMetadata,
  AssistantMessage,
} from '../types'
import {
  PROPOSAL_TOOL_NAME,
  TODO_PROPOSAL_TOOL_NAME,
  SEARCH_WEB_TOOL_NAME,
  assistantBuiltinTools,
  langchainAssistantTools,
} from '../tools'

export {
  PROPOSAL_TOOL_NAME,
  TODO_PROPOSAL_TOOL_NAME,
  SEARCH_WEB_TOOL_NAME,
  assistantBuiltinTools,
  langchainAssistantTools,
}

export class AssistantChatGoogleGenerativeAI extends ChatGoogleGenerativeAI {
  thinkingBudget?: number

  constructor(
    fields: ConstructorParameters<typeof ChatGoogleGenerativeAI>[0] & {
      thinkingBudget?: number
    },
  ) {
    super(fields)
    this.thinkingBudget = fields.thinkingBudget
  }

  override invocationParams(options?: this['ParsedCallOptions']) {
    const params = super.invocationParams(options) as Record<string, unknown>
    const modelStr = (typeof this.model === 'string' ? this.model : '').toLowerCase()
    const isLiteModel = modelStr.includes('lite')

    if (this.thinkingBudget && this.thinkingBudget > 0 && !isLiteModel) {
      const isGemini3 = modelStr.startsWith('gemini-3') || modelStr.includes('latest')
      if (isGemini3) {
        const thinkingLevel =
          this.thinkingBudget >= 8000
            ? 'HIGH'
            : this.thinkingBudget >= 2000
              ? 'MEDIUM'
              : 'LOW'
        params.generationConfig = {
          ...((params.generationConfig as Record<string, unknown>) || {}),
          thinkingConfig: {
            thinkingLevel,
          },
        }
      } else {
        params.generationConfig = {
          ...((params.generationConfig as Record<string, unknown>) || {}),
          thinkingConfig: {
            thinkingBudget: this.thinkingBudget,
          },
        }
      }
    }

    if (assistantBuiltinTools.length > 0 && params.toolConfig) {
      params.toolConfig = {
        ...((params.toolConfig as Record<string, unknown>) || {}),
        includeServerSideToolInvocations: true,
      }
    }
    return params as ReturnType<ChatGoogleGenerativeAI['invocationParams']>
  }
}

export async function createLangChainChatModel(
  modelName?: string,
  thinkingBudget?: number,
): Promise<ChatGoogleGenerativeAI> {
  const targetModel = modelName || config.gemini.model
  const supabaseUrl = config.supabase.url
  const publishableKey = config.supabase.publishableKey

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

  return new AssistantChatGoogleGenerativeAI({
    model: targetModel,
    apiKey: 'proxied-by-edge-function',
    temperature: 0,
    thinkingBudget,
    ...(baseUrl ? { baseUrl } : {}),
    ...(customHeaders ? { customHeaders } : {}),
  })
}

/** Bind the assistant tool registry using LangChain's provider adapter. */
export function bindAssistantTools(model: ChatGoogleGenerativeAI) {
  return model.bindTools(langchainAssistantTools, { tool_choice: 'auto' })
}

export function extractAssistantToolsMetadata(
  content: unknown,
  responseMetadata?: Record<string, unknown>,
): {
  grounding?: AssistantGroundingMetadata | null
  codeExecutions?: AssistantCodeExecution[] | null
} {
  let grounding: AssistantGroundingMetadata | null = null
  const rawGrounding = responseMetadata?.groundingMetadata as {
    webSearchQueries?: string[]
    groundingChunks?: Array<{ web?: { title?: string; uri?: string } }>
  } | undefined

  if (rawGrounding) {
    const queries = Array.isArray(rawGrounding.webSearchQueries) ? rawGrounding.webSearchQueries : []
    const sources = Array.isArray(rawGrounding.groundingChunks)
      ? rawGrounding.groundingChunks
          .map((chunk) => ({ title: chunk.web?.title, uri: chunk.web?.uri }))
          .filter((s) => s.uri || s.title)
      : []
    if (queries.length > 0 || sources.length > 0) {
      grounding = { webSearchQueries: queries, sources }
    }
  }

  const rawAnnotations = responseMetadata?.annotations as
    | Array<{ type?: string; title?: string; url?: string; uri?: string }>
    | undefined
  if (Array.isArray(rawAnnotations)) {
    const extraSources = rawAnnotations
      .filter((a) => a && (a.url || a.uri || a.title))
      .map((a) => ({ title: a.title, uri: a.url || a.uri }))
    if (extraSources.length > 0) {
      if (!grounding) {
        grounding = { webSearchQueries: [], sources: extraSources }
      } else {
        const currentSources = grounding.sources || []
        const existingUris = new Set(currentSources.map((s) => s.uri))
        for (const s of extraSources) {
          if (s.uri && !existingUris.has(s.uri)) {
            currentSources.push(s)
            existingUris.add(s.uri)
          }
        }
        grounding.sources = currentSources
      }
    }
  }

  const codeExecutions: AssistantCodeExecution[] = []
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part && typeof part === 'object') {
        if ('executableCode' in part && (part as { executableCode?: { language?: string; code?: string } }).executableCode) {
          const exec = (part as { executableCode: { language?: string; code?: string } }).executableCode
          codeExecutions.push({
            language: exec.language,
            code: exec.code,
          })
        } else if ('codeExecutionResult' in part && (part as { codeExecutionResult?: { outcome?: string; output?: string } }).codeExecutionResult) {
          const res = (part as { codeExecutionResult: { outcome?: string; output?: string } }).codeExecutionResult
          const last = codeExecutions[codeExecutions.length - 1]
          if (last && !last.output) {
            last.outcome = res.outcome
            last.output = res.output
          } else {
            codeExecutions.push({
              outcome: res.outcome,
              output: res.output,
            })
          }
        }
      }
    }
  }

  return {
    grounding,
    codeExecutions: codeExecutions.length > 0 ? codeExecutions : null,
  }
}

export function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    const textParts: string[] = []
    for (const part of content) {
      if (typeof part === 'string') {
        textParts.push(part)
      } else if (part && typeof part === 'object') {
        if ('type' in part) {
          const type = (part as { type?: unknown }).type
          if (type === 'thinking' || type === 'reasoning') {
            continue
          }
          if (type === 'text' && typeof (part as { text?: unknown }).text === 'string') {
            textParts.push((part as { text: string }).text)
          }
        } else if ('thought' in part && (part as { thought?: unknown }).thought) {
          continue
        } else if ('text' in part && typeof (part as { text?: unknown }).text === 'string') {
          textParts.push((part as { text: string }).text)
        }
      }
    }
    return textParts.join('').trim()
  }
  if (
    content &&
    typeof content === 'object' &&
    'text' in content &&
    typeof (content as { text?: unknown }).text === 'string'
  ) {
    return (content as { text: string }).text.trim()
  }
  return ''
}

export async function invokeAssistantModel(
  messages: BaseMessage[],
  onTextDelta?: (text: string) => void,
  modelName?: string,
  thinkingBudget?: number,
): Promise<AIMessage> {
  const model = await createLangChainChatModel(modelName, thinkingBudget)
  const assistantModel = bindAssistantTools(model)
  if (!onTextDelta) {
    const response = await assistantModel.invoke(messages)
    const aiResp = response as AIMessage
    const extracted = extractAssistantToolsMetadata(aiResp.content, aiResp.response_metadata)
    return new AIMessage({
      content: aiResp.content,
      id: aiResp.id,
      name: aiResp.name,
      additional_kwargs: aiResp.additional_kwargs,
      response_metadata: {
        ...aiResp.response_metadata,
        assistantGrounding: extracted.grounding,
        assistantCodeExecutions: extracted.codeExecutions,
      },
      tool_calls: aiResp.tool_calls,
      invalid_tool_calls: aiResp.invalid_tool_calls,
      usage_metadata: aiResp.usage_metadata,
    })
  }

  let response: AIMessageChunk | null = null
  let mergedResponseMetadata: Record<string, unknown> = {}
  const accumulatedParts: unknown[] = []

  const stream = await assistantModel.stream(messages)
  for await (const chunk of stream) {
    const aiChunk = chunk as AIMessageChunk
    const text =
      typeof aiChunk.text === 'string' && aiChunk.text
        ? aiChunk.text
        : extractMessageText(aiChunk.content)
    if (text) onTextDelta(text)
    if (aiChunk.response_metadata) {
      mergedResponseMetadata = { ...mergedResponseMetadata, ...aiChunk.response_metadata }
    }
    if (Array.isArray(aiChunk.content)) {
      accumulatedParts.push(...aiChunk.content)
    }
    response = response ? response.concat(aiChunk) : aiChunk
  }

  if (!response) throw new Error('模型沒有回傳可完成的訊息')

  const finalContent = accumulatedParts.length > 0 ? accumulatedParts : response.content
  const finalMetadata = { ...response.response_metadata, ...mergedResponseMetadata }
  const extracted = extractAssistantToolsMetadata(finalContent, finalMetadata)

  return new AIMessage({
    content: response.content,
    id: response.id,
    name: response.name,
    additional_kwargs: response.additional_kwargs,
    response_metadata: {
      ...finalMetadata,
      assistantGrounding: extracted.grounding,
      assistantCodeExecutions: extracted.codeExecutions,
    },
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
  attachments: AssistantAttachment[] = [],
) {
  const promptParts = [
    '你是一位專業、條理分明的旅遊行程規劃助理。',
    '請一律使用與使用者發問時相同的語言進行回覆（使用者用繁體中文就用繁體中文回覆，使用者用英文就用英文回覆，使用者用日文就用日文回覆等）。',
    '請根據以下行程目前狀態與對話脈絡提供協助。',
    '',
    '## 核心原則',
    '1. 一般問答、提供旅遊建議、景點介紹、交通方式、或是詢問/釐清細節時，直接回覆自然文字即可。當需要查詢即時資訊、最新情報或需要連網查證資料時，可呼叫 `search_web_information` 搜尋。',
    '2. 只有在使用者明確要求、同意或接受「修改行程景點」時，才呼叫 `propose_itinerary_edit` 工具提出具體操作（ operations ）。',
    '3. 當使用者要求「規劃、整理、建議或新增待辦清單」（如行前準備、打包清單、預約提醒等）時，呼叫 `propose_todo_list` 工具。',
    '4. 當你呼叫提案工具（`propose_itinerary_edit` 或 `propose_todo_list`）提出提案時，該提案會由使用者介面長出專屬畫面讓使用者確認後才儲存與套用。',
    '',
    '## 格式與資料來源連結規範',
    '- **超連結與資料來源**：當你使用搜尋工具或提及任何官方網站、售票網址、交通資訊、景點網址或參考資料時，**務必使用 Markdown 超連結語法**（例如 `[景點或網站名稱](URL)`）將連結直接放入回覆中，方便使用者點擊。',
    '- **具體連結文字**：連結文字請使用具有描述性的名稱（如 `[東京晴空塔官方預約網站](https://...)` 或 `[JR東日本路線圖](https://...)`），切勿使用「點這裡」、「網址」等空泛字詞。',
    '- **文末來源彙整**：若有透過搜尋取得參考資料，可以在回覆結尾加上「🔗 參考資料 / 相關連結」清單供使用者進一步查閱。',
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

  if (attachments.length > 0) {
    promptParts.push('', '## 使用者附加檔案')
    for (const att of attachments) {
      if (att.textContent) {
        promptParts.push(`### 檔案【${att.name}】內容：\n${att.textContent}`)
      } else {
        promptParts.push(`- 附加檔案：${att.name}（類型：${att.mimeType}）`)
      }
    }
  }

  promptParts.push('', '## 使用者最新訊息', currentQuestion || '（使用者提供了附件並請求分析）')

  return promptParts.join('\n')
}

export async function summarizeWithGemini(
  currentSummary: string,
  messages: AssistantMessage[],
  modelName?: string,
  thinkingBudget?: number,
) {
  const model = await createLangChainChatModel(modelName, thinkingBudget)
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
  return extractMessageText(response.content)
}
