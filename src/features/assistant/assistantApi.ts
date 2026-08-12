import { GoogleGenAI } from '@google/genai'
import type { Attraction, Itinerary } from '../../types/database'
import { supabase } from '../../lib/supabase'
import { geocodeWithGoogle, loadGoogleMaps } from '../travel/googleMaps'
import type {
  AssistantAttractionDraft,
  AssistantMessage,
  AssistantModel,
  AssistantModelRequest,
  AssistantModelResult,
  AssistantOperation,
} from './types'

const modelName = import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.5-flash-lite'

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

const userLanguage = () => typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'zh-TW'

const responseShape = `{
  "reply":"answer in the user's language",
  "proposal":null OR {
    "title":"short title",
    "explanation":"change summary",
    "operations":[
      {"type":"set_day_start_time","dayId":"uuid","startTime":"HH:mm"},
      {"type":"add_attraction","dayId":"uuid","index":0,"attraction":{"id":"uuid","name":"place","description":"","cost":0,"latitude":null,"longitude":null,"duration":60,"transportMode":"transit","travelTime":null,"placeId":null,"locationName":"place or address"}},
      {"type":"update_attraction","attractionId":"uuid","changes":{"duration":90}},
      {"type":"remove_attraction","attractionId":"uuid"},
      {"type":"move_attraction","attractionId":"uuid","targetDayId":"uuid","index":0},
      {"type":"reorder_attractions","dayId":"uuid","attractionIds":["uuid"]}
    ]
  }
}`

function prompt(request: AssistantModelRequest) {
  const history = request.messages.slice(-10).map((message) => `${message.role}: ${message.content}`).join('\n')
  return [
    '你是旅遊行程助理。回答使用者問題，也能在使用者明確要求時提出每日行程修改。',
    '只能修改現有日期的開始時間與景點；不可修改旅程日期、幣別、費用或待辦。',
    '一般推薦或詢問只回答，不要產生 proposal。只有「加入、刪除、移動、調整、幫我排」等明確操作要求才產生 proposal。',
    '所有既有 dayId/attractionId 必須逐字使用提供資料。新增景點 id 必須使用 UUID。',
    `請使用使用者語言（${userLanguage()}）回答。新增景點的 locationName 請包含城市與國家（例如「道頓堀，大阪，日本」）；可先將座標和 placeId 設 null，系統會用 Google Places 查證，找不到時會保留空值。不要虛構地址或價格；交通時間請依景點距離、transportMode 與行程脈絡估算整數分鐘，無法合理估算時填 null。`,
    'update_attraction 的 changes 只放需要變動的欄位。',
    `只回傳合法 JSON，格式：${responseShape}`,
    request.summary ? `先前摘要：${request.summary}` : '',
    history ? `近期對話：\n${history}` : '',
    `目前完整行程（以下是最新現況，包含所有日期與景點順序；請以此為準，不要只依賴對話摘要）：${JSON.stringify(itineraryForPrompt(request.itinerary))}`,
    `使用者：${request.userText}`,
  ].filter(Boolean).join('\n\n')
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function parseAttraction(value: unknown): AssistantAttractionDraft {
  if (!isRecord(value) || typeof value.name !== 'string' || !value.name.trim()) {
    throw new Error('助理回傳的景點資料不完整')
  }
  return {
    id: typeof value.id === 'string' && value.id ? value.id : crypto.randomUUID(),
    name: value.name.trim(),
    description: typeof value.description === 'string' ? value.description : '',
    cost: typeof value.cost === 'number' && value.cost >= 0 ? value.cost : 0,
    latitude: typeof value.latitude === 'number' ? value.latitude : null,
    longitude: typeof value.longitude === 'number' ? value.longitude : null,
    duration: typeof value.duration === 'number' && value.duration >= 0 ? Math.round(value.duration) : 60,
    transportMode: typeof value.transportMode === 'string' ? value.transportMode : 'transit',
    travelTime: typeof value.travelTime === 'number' && Number.isFinite(value.travelTime) && value.travelTime >= 0
      ? Math.round(value.travelTime)
      : null,
    placeId: typeof value.placeId === 'string' ? value.placeId : null,
    locationName: typeof value.locationName === 'string' ? value.locationName : value.name.trim(),
  }
}

function parseOperations(value: unknown): AssistantOperation[] {
  if (!Array.isArray(value)) throw new Error('助理回傳的修改格式錯誤')
  return value.map((raw): AssistantOperation => {
    if (!isRecord(raw) || typeof raw.type !== 'string') throw new Error('助理回傳的修改格式錯誤')
    if (raw.type === 'set_day_start_time' && typeof raw.dayId === 'string' && typeof raw.startTime === 'string') {
      return { type: raw.type, dayId: raw.dayId, startTime: raw.startTime }
    }
    if (raw.type === 'add_attraction' && typeof raw.dayId === 'string') {
      return { type: raw.type, dayId: raw.dayId, attraction: parseAttraction(raw.attraction), index: typeof raw.index === 'number' ? Math.round(raw.index) : undefined }
    }
    if (raw.type === 'update_attraction' && typeof raw.attractionId === 'string' && isRecord(raw.changes)) {
      const changes = { ...raw.changes } as Partial<AssistantAttractionDraft>
      delete changes.id
      if ('travelTime' in changes) {
        changes.travelTime = typeof changes.travelTime === 'number' && Number.isFinite(changes.travelTime) && changes.travelTime >= 0
          ? Math.round(changes.travelTime)
          : null
      }
      return { type: raw.type, attractionId: raw.attractionId, changes }
    }
    if (raw.type === 'remove_attraction' && typeof raw.attractionId === 'string') {
      return { type: raw.type, attractionId: raw.attractionId }
    }
    if (raw.type === 'move_attraction' && typeof raw.attractionId === 'string' && typeof raw.targetDayId === 'string' && typeof raw.index === 'number') {
      return { type: raw.type, attractionId: raw.attractionId, targetDayId: raw.targetDayId, index: Math.round(raw.index) }
    }
    if (raw.type === 'reorder_attractions' && typeof raw.dayId === 'string' && Array.isArray(raw.attractionIds) && raw.attractionIds.every((id) => typeof id === 'string')) {
      return { type: raw.type, dayId: raw.dayId, attractionIds: raw.attractionIds }
    }
    throw new Error(`不支援的行程修改：${raw.type}`)
  })
}

export function parseAssistantModelResult(value: unknown): AssistantModelResult {
  if (!isRecord(value) || typeof value.reply !== 'string' || !value.reply.trim()) {
    throw new Error('助理未回傳有效內容')
  }
  if (value.proposal == null) return { reply: value.reply.trim() }
  if (!isRecord(value.proposal) || typeof value.proposal.title !== 'string' || typeof value.proposal.explanation !== 'string') {
    throw new Error('助理回傳的提案格式錯誤')
  }
  return {
    reply: value.reply.trim(),
    proposal: {
      title: value.proposal.title.trim() || '行程修改提案',
      explanation: value.proposal.explanation.trim(),
      operations: parseOperations(value.proposal.operations),
    },
  }
}

const itineraryLocationContext = (itinerary: Itinerary) => [
  itinerary.title,
  ...(itinerary.days ?? []).flatMap((day) => day.attractions.slice(0, 2).flatMap((attraction) => [attraction.name, attraction.locationName ?? ''])),
].filter(Boolean).join(' ').slice(0, 160)

async function verifyPlaces(result: AssistantModelResult, itinerary: Itinerary, language = userLanguage()): Promise<AssistantModelResult> {
  if (!result.proposal) return result
  const addOperations = result.proposal.operations.filter((operation) => operation.type === 'add_attraction')
  if (addOperations.length === 0) return result
  const verified = new Map<string, AssistantAttractionDraft>()
  const context = itineraryLocationContext(itinerary)
  for (const operation of addOperations) {
    const place = await verifyGooglePlace(operation.attraction.locationName || operation.attraction.name, loadGoogleMaps, context, language)
    verified.set(operation.attraction.id, {
      ...operation.attraction,
      name: place?.name || operation.attraction.name,
      locationName: place?.address || place?.name || operation.attraction.locationName,
      placeId: place?.placeId ?? null,
      latitude: place?.latitude ?? null,
      longitude: place?.longitude ?? null,
    })
  }
  return {
    ...result,
    proposal: {
      ...result.proposal,
      operations: result.proposal.operations.map((operation) => operation.type === 'add_attraction'
        ? { ...operation, attraction: verified.get(operation.attraction.id)! }
        : operation),
    },
  }
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

async function generateJson(contents: string) {
  const ai = await gemini()
  const response = await ai.models.generateContent({
    model: modelName,
    contents,
    config: { responseMimeType: 'application/json' },
  })
  if (!response.text) throw new Error('Gemini 未回傳內容')
  return JSON.parse(response.text) as unknown
}

export const browserAssistantModel: AssistantModel = {
  async respond(request) {
    const language = userLanguage()
    const verified = await verifyPlaces(parseAssistantModelResult(await generateJson(prompt(request))), request.itinerary, language)
    return verified
  },
  async summarize(currentSummary: string, messages: AssistantMessage[]) {
    const value = await generateJson([
      `請以使用者語言（${userLanguage()}）整理旅遊規劃對話，保留使用者偏好、已決定事項、未解問題；不要包含待確認的行程修改。`,
      '只回傳 {"summary":"..."}。',
      currentSummary ? `既有摘要：${currentSummary}` : '',
      `新增對話：${JSON.stringify(messages.map(({ role, content }) => ({ role, content })))}`,
    ].filter(Boolean).join('\n'))
    if (!isRecord(value) || typeof value.summary !== 'string') throw new Error('無法整理對話')
    return value.summary.trim()
  },
}

export const attractionForAssistant = (attraction: Attraction) => ({
  id: attraction.id,
  name: attraction.name,
})
