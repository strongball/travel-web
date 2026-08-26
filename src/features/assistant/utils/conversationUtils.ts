import type { Itinerary } from '../../../types/database'
import { AssistantGraphVersionError } from '../graph'
import type { AssistantProgressPhase } from '../types'

export const progressLabels: Record<AssistantProgressPhase, string> = {
  checking_context: '正在確認是否需要整理前文…',
  summarizing_context: '正在整理先前對話…',
  generating_response: '正在根據行程與對話產生回覆…',
  validating_response: '正在驗證回覆與時間安排…',
  applying_proposal: '正在套用行程修改…',
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
