import type { Itinerary } from '../../../types/database'
import { AssistantGraphVersionError } from '../graph'
import type { AssistantProgressPhase } from '../types'

export const progressLabels: Record<AssistantProgressPhase, string> = {
  checking_context: '正在確認是否需要整理前文…',
  summarizing_context: '正在整理先前對話…',
  generating_response: '正在思考並產生回覆…',
  executing_tools: '正在調用工具查詢資訊…',
  validating_response: '正在驗證回覆內容…',
  applying_proposal: '正在套用調整…',
  saving_checkpoint: '正在儲存對話進度…',
  saving_response: '正在儲存助理回覆…',
  syncing_conversation: '正在更新對話畫面…',
}

const hiddenProgressPhases = new Set<AssistantProgressPhase>([
  'checking_context',
  'saving_checkpoint',
  'saving_response',
  'syncing_conversation',
])

export const visibleProgressLabel = (phase: AssistantProgressPhase) =>
  hiddenProgressPhases.has(phase) ? null : progressLabels[phase]

export const friendlyError = (value: unknown, fallback: string) => {
  const errorRecord = value && typeof value === 'object'
    ? value as { code?: unknown; message?: unknown }
    : null
  if (errorRecord?.code === '40001') return '行程已被其他分頁或裝置修改，請重新載入後再產生提案。'
  if (errorRecord?.code === 'P0002') return '這個行程提案已不存在，請重新產生提案。'
  if (errorRecord?.code === '22023') return '行程提案包含不合法的景點資料，請重新描述要調整的景點。'

  const raw = value instanceof Error
    ? value.message
    : typeof value === 'string'
      ? value
      : typeof errorRecord?.message === 'string'
        ? errorRecord.message
        : fallback
  try {
    const parsed = JSON.parse(raw) as { error?: { code?: number; message?: string } }
    if (parsed.error?.code === 429) return 'AI 服務額度已用完，請補充 Gemini API 額度後再重試。這則訊息已保留，不會重複送出。'
    if (parsed.error?.message) return parsed.error.message
  } catch {
    // The error is already plain text.
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('prepayment credits')) {
    return 'AI 服務額度已用完，請補充 Gemini API 額度後再重試。這則訊息已保留，不會重複送出。'
  }
  return raw || fallback
}

export const isRecoverableGraphStateError = (value: unknown) =>
  value instanceof AssistantGraphVersionError ||
  (value instanceof Error && value.message.includes('Assistant turn request is missing'))

export const rememberedThread = (key: string) => {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

export const rememberThread = (key: string, threadId: string | null) => {
  try {
    if (threadId) sessionStorage.setItem(key, threadId)
    else sessionStorage.removeItem(key)
  } catch {
    // Session persistence is only a convenience; private browsing may deny it.
  }
}

export const dayRevisions = (itinerary: Itinerary) => Object.fromEntries(
  (itinerary.days ?? []).map((day) => [day.id, day.revision]),
)

/**
 * 將工具名稱與參數轉為適合在 UI 呈現的友善繁體中文標籤
 */
export function formatToolCallLabel(name: string, args?: Record<string, unknown>): string {
  switch (name) {
    case 'view_itinerary': {
      const day = args?.dayNumber
      return typeof day === 'number' ? `檢視第 ${day} 天行程` : '檢視全體行程總覽'
    }
    case 'view_todo_categories':
      return '查詢待辦分類清單'
    case 'view_todo_list': {
      const cat = typeof args?.category === 'string' ? args.category.trim() : ''
      return cat ? `讀取【${cat}】待辦清單` : '讀取待辦事項清單'
    }
    case 'search_web_information': {
      const q = typeof args?.query === 'string' ? args.query.trim() : ''
      return q ? `搜尋「${q}」` : '聯網搜尋即時資訊'
    }
    case 'propose_itinerary_edit': {
      const title = typeof args?.title === 'string' ? args.title.trim() : ''
      return title ? `行程修改提案：${title}` : '規劃行程修改提案'
    }
    case 'propose_todo_list': {
      const title = typeof args?.title === 'string' ? args.title.trim() : ''
      return title ? `待辦清單提案：${title}` : '規劃待辦清單提案'
    }
    case 'ask_clarifying_question':
      return '向使用者確認偏好'
    default:
      return name
  }
}

