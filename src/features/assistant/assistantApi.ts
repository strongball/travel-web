import { FunctionCallingConfigMode, GoogleGenAI } from '@google/genai'
import type { Attraction, Itinerary } from '../../types/database'
import { supabase } from '../../lib/supabase'
import i18n from '../../i18n'
import { geocodeWithGoogle, loadGoogleMaps } from '../travel/googleMaps'
import type {
  AssistantMessage,
  AssistantModel,
  AssistantModelRequest,
  AssistantModelResult,
} from './types'
import {
  answerToolArgumentsSchema,
  assistantFunctionCallSchema,
  assistantModelResultSchema,
  assistantSummarySchema,
  formatAssistantSchemaError,
  jsonSchemaFor,
  proposalToolArgumentsSchema,
} from './assistantSchemas'

const modelName = import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.5-flash-lite'
const ANSWER_TOOL_NAME = 'answer_travel_question'
const PROPOSAL_TOOL_NAME = 'propose_itinerary_edit'

async function gemini() {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('請先登入')
  return new GoogleGenAI({
    apiKey: 'proxied-by-edge-function',
    apiVersion: 'v1beta',
    httpOptions: {
      baseUrl: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-proxy`,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      timeout: 45_000,
    },
  })
}

const itineraryForPrompt = (itinerary: Itinerary) => ({
  title: itinerary.title,
  startDate: itinerary.startDate,
  endDate: itinerary.endDate,
  days: (itinerary.days ?? []).map((day, index) => ({
    id: day.id,
    dayNumber: index + 1,
    date: day.date.slice(0, 10),
    startTime: day.startTime,
    attractions: day.attractions.map((attraction, attractionIndex) => ({
      order: attractionIndex + 1,
      id: attraction.id,
      name: attraction.name,
      locationName: attraction.locationName,
      startTime: attraction.startTime,
      endTime: attraction.endTime,
      duration: attraction.duration,
      transportMode: attraction.transportMode,
      travelTime: attraction.travelTime,
    })),
  })),
})

const userLanguage = (sample = '') => {
  // The app can be opened with an English browser locale while the user is
  // clearly writing Traditional Chinese. Prefer the language of this turn.
  if (/[㐀-鿿]/.test(sample)) return 'zh-TW'
  return i18n.resolvedLanguage || i18n.language || 'zh-TW'
}

export function buildAssistantPrompt(request: AssistantModelRequest) {
  const recentMessages = request.messages.slice(-10)
  const lastMessage = recentMessages.at(-1)
  const historyMessages = lastMessage?.role === 'user' && lastMessage.content.trim() === request.userText.trim()
    ? recentMessages.slice(0, -1)
    : recentMessages
  const history = historyMessages.map((message) => `${message.role}: ${message.content}`).join('\n')
  return [
    '你是旅遊行程助理。依序以目前完整行程、較新的對話、摘要為準；回答須延續城市、日期、步調與偏好，推薦要避開重複景點並利用順路空檔。',
    '預設使用者需要你協助釐清需求與做決定。只要目標和限制足夠，就主動給出一個具體安排與簡短理由；非關鍵細節採合理預設，不要反覆把規劃工作丟回使用者。',
    `依語意與上下文判斷意圖，不依賴特定關鍵字。純詢問只回答；若使用者接受、選擇或要求執行前文建議（包括「好」、「就這樣」、「都要」、「幫我決定」等省略語），資訊足夠就呼叫 ${PROPOSAL_TOOL_NAME}，不要要求重述。只有多種合理解讀會明顯改變結果時，才用 ${ANSWER_TOOL_NAME} 問一個必要問題。`,
    '修改只限現有日期的開始時間與景點，且只動要求的部分；不可改旅程日期、幣別、費用或待辦。既有 dayId/attractionId 必須原樣使用；新增景點不給 id；reorder_attractions 可只列移動項目；update_attraction.changes 只放變動欄位。',
    `使用使用者語言（${userLanguage(request.userText)}），景點也不轉成英文羅馬拼音。新增景點只給 name、duration、transportMode、travelTime 與必要的 locationName；不要給 description、cost、Place ID、座標或地址。`,
    '新增或重排景點時，主動為每一段安排 transportMode 與 travelTime；預設採一般觀光客容易使用的步行或公共運輸，僅在明顯不適合時選計程車或其他方式。提案須依 day.startTime、每段交通時間與 duration 順推可執行時間，並考慮相鄰距離與一般營業／遊玩時段；不得重疊、跨日或過晚。沒有即時路線資料時做保守的整數分鐘估算，不必為此追問；無法合理估算才填 null，且不得宣稱已查證。',
    `只呼叫一個工具且不要在工具外回答：一般回答／必要澄清用 ${ANSWER_TOOL_NAME}；可執行修改用 ${PROPOSAL_TOOL_NAME}，提供簡短 reply 與 operations，title/explanation 可省略。`,
    request.summary ? `先前摘要：${request.summary}` : '',
    history ? `近期對話：\n${history}` : '',
    `目前完整行程（以下是最新現況，包含所有日期與景點順序；請以此為準，不要只依賴對話摘要）：${JSON.stringify(itineraryForPrompt(request.itinerary))}`,
    `使用者：${request.userText}`,
  ].filter(Boolean).join('\n\n')
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const supportedOperations = new Set([
  'set_day_start_time',
  'add_attraction',
  'update_attraction',
  'remove_attraction',
  'move_attraction',
  'reorder_attractions',
])

function assertSupportedOperations(value: unknown) {
  if (!isRecord(value) || !isRecord(value.proposal) || !Array.isArray(value.proposal.operations)) return
  for (const operation of value.proposal.operations) {
    if (isRecord(operation) && typeof operation.type === 'string' && !supportedOperations.has(operation.type)) {
      throw new Error(`不支援的行程修改：${operation.type}`)
    }
  }
}

export function parseAssistantModelResult(value: unknown): AssistantModelResult {
  assertSupportedOperations(value)
  const parsed = assistantModelResultSchema.safeParse(value)
  if (!parsed.success) {
    throw new Error(`助理回傳格式錯誤：${formatAssistantSchemaError(parsed.error)}`)
  }
  if (!parsed.data.proposal) return { reply: parsed.data.reply }
  return {
    reply: parsed.data.reply,
    proposal: {
      title: parsed.data.proposal.title,
      explanation: parsed.data.proposal.explanation,
      operations: parsed.data.proposal.operations,
    },
  }
}

export function parseAssistantFunctionCalls(value: unknown): AssistantModelResult {
  if (!Array.isArray(value) || value.length !== 1) {
    throw new Error('Gemini 必須且只能呼叫一個旅程助理工具')
  }
  const call = assistantFunctionCallSchema.safeParse(value[0])
  if (!call.success) {
    throw new Error(`Gemini 工具呼叫格式錯誤：${formatAssistantSchemaError(call.error)}`)
  }
  const args = call.data.args ?? {}
  if (call.data.name === ANSWER_TOOL_NAME) {
    const answer = answerToolArgumentsSchema.safeParse(args)
    if (!answer.success) {
      throw new Error(`Gemini 回答工具格式錯誤：${formatAssistantSchemaError(answer.error)}`)
    }
    return { reply: answer.data.reply }
  }
  if (call.data.name === PROPOSAL_TOOL_NAME) {
    const proposal = proposalToolArgumentsSchema.safeParse(args)
    if (!proposal.success) {
      throw new Error(`Gemini 提案工具格式錯誤：${formatAssistantSchemaError(proposal.error)}`)
    }
    return parseAssistantModelResult({
      reply: proposal.data.reply,
      proposal: {
        title: proposal.data.title,
        explanation: proposal.data.explanation,
        operations: proposal.data.operations,
      },
    })
  }
  throw new Error(`不支援的 Gemini 工具：${call.data.name}`)
}

const hasHanCharacters = (value: string) => /[\u3400-\u9fff]/.test(value)

export const localizedPlaceText = (
  modelText: string | null,
  googleText: string | null,
  language: string,
) => {
  const modelValue = modelText?.trim() || null
  const googleValue = googleText?.trim() || null
  if (language.toLowerCase().startsWith('zh')) {
    // Places sometimes returns a romanized label even for a zh-TW request.
    // Prefer whichever source actually contains Han characters.
    if (modelValue && hasHanCharacters(modelValue)) return modelValue
    if (googleValue && hasHanCharacters(googleValue)) return googleValue
    return modelValue ?? googleValue
  }
  return googleValue ?? modelValue
}

export type VerifiedGooglePlace = {
  name: string | null
  address: string | null
  placeId: string | null
  latitude: number | null
  longitude: number | null
}

export async function verifyGooglePlace(
  query: string,
  loadMaps: typeof loadGoogleMaps = loadGoogleMaps,
  locationContext = '',
  language = userLanguage(),
): Promise<VerifiedGooglePlace | null> {
  const { Place, Geocoder } = await loadMaps()
  let placesError: unknown = null
  let geocoderError: unknown = null
  const queries = [...new Set([query.trim(), locationContext ? `${query.trim()}, ${locationContext}` : ''].filter(Boolean))]
  for (const textQuery of queries) {
    try {
      const response = await Place.searchByText({
        textQuery,
        fields: ['id', 'displayName', 'formattedAddress', 'location'],
        language,
        maxResultCount: 1,
      })
      const place = response.places[0]
      const location = place?.location?.toJSON()
      if (place?.id && location) {
        return {
          name: place.displayName || null,
          address: place.formattedAddress || null,
          placeId: place.id,
          latitude: location.lat,
          longitude: location.lng,
        }
      }
    } catch (error) {
      placesError = error
    }
  }

  // Text Search (New) requires Places API (New). Existing Maps JavaScript
  // projects may only authorize the browser Geocoder, which still returns a
  // Google Place ID and canonical coordinates suitable for proposal validation.
  for (const address of queries) {
    try {
      const response = await geocodeWithGoogle(Geocoder, { address, language })
      const result = response.results[0]
      const location = result?.geometry?.location?.toJSON()
      if (result?.place_id && location) {
        return {
          name: null,
          address: result.formatted_address || null,
          placeId: result.place_id,
          latitude: location.lat,
          longitude: location.lng,
        }
      }
    } catch (error) {
      geocoderError = error
    }
  }

  const failure = `${placesError ?? ''} ${geocoderError ?? ''}`
  if (failure.includes('PERMISSION_DENIED') || failure.includes('REQUEST_DENIED')) {
    throw new Error('Google 地點服務沒有權限。請在 Google Cloud 啟用 Places API (New) 與 Maps JavaScript API，並允許目前網站來源使用這把瀏覽器 API Key。')
  }

  return null
}

const assistantTools = [{
  functionDeclarations: [
    {
      name: ANSWER_TOOL_NAME,
      description: '回答一般旅遊問題，或在資訊不足時提出澄清問題。不得包含行程修改操作。',
      parametersJsonSchema: jsonSchemaFor(answerToolArgumentsSchema),
    },
    {
      name: PROPOSAL_TOOL_NAME,
      description: '當本次語意與近期對話合併後表示使用者要執行、接受或調整行程，且資訊足夠時，提出一組可套用的行程操作；不要求特定關鍵字。',
      parametersJsonSchema: jsonSchemaFor(proposalToolArgumentsSchema),
    },
  ],
}]

async function generateAssistantResult(contents: string): Promise<AssistantModelResult> {
  const ai = await gemini()
  const response = await ai.models.generateContent({
    model: modelName,
    contents,
    config: {
      tools: assistantTools,
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.ANY,
          allowedFunctionNames: [ANSWER_TOOL_NAME, PROPOSAL_TOOL_NAME],
        },
      },
      temperature: 0.2,
    },
  })
  if (response.functionCalls?.length) return parseAssistantFunctionCalls(response.functionCalls)

  // A schema-validated JSON response keeps older model revisions usable if
  // they ignore an otherwise supported function-calling request.
  if (response.text) {
    try {
      return parseAssistantModelResult(JSON.parse(response.text) as unknown)
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error
      throw new Error('Gemini 未回傳有效的工具呼叫或 JSON')
    }
  }
  throw new Error('Gemini 未回傳工具呼叫')
}

async function generateJson(contents: string, responseJsonSchema: Record<string, unknown>) {
  const ai = await gemini()
  const response = await ai.models.generateContent({
    model: modelName,
    contents,
    config: { responseMimeType: 'application/json', responseJsonSchema },
  })
  if (!response.text) throw new Error('Gemini 未回傳內容')
  try {
    return JSON.parse(response.text) as unknown
  } catch {
    throw new Error('Gemini 回傳的 JSON 格式錯誤')
  }
}

export const browserAssistantModel: AssistantModel = {
  async respond(request) {
    return generateAssistantResult(buildAssistantPrompt(request))
  },
  async summarize(currentSummary: string, messages: AssistantMessage[]) {
    const value = await generateJson([
      `請以使用者語言（${userLanguage()}）整理旅遊規劃對話，保留使用者偏好、已決定事項、未解問題；不要包含待確認的行程修改。`,
      '只回傳 {"summary":"..."}。',
      currentSummary ? `既有摘要：${currentSummary}` : '',
      `新增對話：${JSON.stringify(messages.map(({ role, content }) => ({ role, content })))}`,
    ].filter(Boolean).join('\n'), jsonSchemaFor(assistantSummarySchema))
    const summary = assistantSummarySchema.safeParse(value)
    if (!summary.success) {
      throw new Error(`無法整理對話：${formatAssistantSchemaError(summary.error)}`)
    }
    return summary.data.summary
  },
}

export const attractionForAssistant = (attraction: Attraction) => ({
  id: attraction.id,
  name: attraction.name,
})
