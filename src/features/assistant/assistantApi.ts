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
    '你是旅遊行程助理。回答使用者問題，也能在使用者明確要求時提出每日行程修改。',
    '回覆前必須先綜合先前摘要、近期對話與目前完整行程。近期對話中較新的偏好、否定或修正優先於較舊內容。',
    '推薦必須對應使用者正在討論的城市、日期、步調與偏好，避開目前行程已有的景點，並利用既有行程的空檔與鄰近區域；不可像全新對話一樣忽略前文。',
    `若使用者指的日期、地區或修改方向不明確，先用 ${ANSWER_TOOL_NAME} 提問澄清，不要建立提案。修改時只動使用者要求的部分，保留其他日期與景點。`,
    '只能修改現有日期的開始時間與景點；不可修改旅程日期、幣別、費用或待辦。',
    '一般推薦或詢問只回答，不要產生 proposal。只有「加入、刪除、移動、調整、幫我排」等明確操作要求才產生 proposal。',
    '所有既有 dayId/attractionId 必須逐字使用提供資料。新增景點不要回傳 id，系統會自動產生。',
    'reorder_attractions 可以只列出要移動的景點，未列出的景點會維持原本相對順序。',
    `請使用使用者語言（${userLanguage(request.userText)}）回答，景點名稱與地點名稱也要使用這個語言；不要把日文或中文轉成英文羅馬拼音。新增景點的 attraction 只回傳 name、duration、transportMode、travelTime，以及必要時的 locationName；不要回傳 id、description、cost、Place ID、座標或地址，Google 地點資料會在使用者套用後另行補齊。`,
    '排程必須同時考慮日期、每日開始時間、每個景點現有 startTime/endTime、停留 duration、前往該景點的 transportMode/travelTime 與相鄰地點距離，不能只調整景點順序。',
    '系統會依「每日開始時間 + 每站前的 travelTime + 該站 duration」重算 startTime/endTime；因此提案要用 set_day_start_time、順序、duration 與 travelTime 表達可執行時間表。交通時間以合理整數分鐘估算，無法合理估算才填 null。',
    '將一般營業時段與合理遊玩時段納入安排（例如餐廳在用餐時段、夜景在傍晚後），避免抵達時可能已關門或單日行程過晚。你沒有即時營業資料，不得宣稱已查證；若營業時間不確定且會影響可行性，先在 reply 詢問並不要建立提案。',
    '建立提案前，逐日從 day.startTime 順推每一段 travelTime 與 duration，確認沒有時間重疊、跨日或不合理空檔；需要修正既有景點的 duration/travelTime 時使用 update_attraction。',
    'update_attraction 的 changes 只放需要變動的欄位。',
    `必須只呼叫一個工具：一般回答或需要澄清時呼叫 ${ANSWER_TOOL_NAME}；使用者明確要求修改且已能形成可執行提案時呼叫 ${PROPOSAL_TOOL_NAME}。編輯工具只需提供簡短 reply 與 operations，title/explanation 可省略；不要在工具外另寫回答。`,
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
      description: '在使用者明確要求修改行程且資訊足夠時，提出一組可套用、包含合理時間安排的行程操作。',
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
