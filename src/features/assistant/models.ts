export interface GeminiModelOption {
  id: string
  name: string
  label: string
  shortLabel: string
  description: string
  badge?: string
  supportsThinking: boolean
}

export const GEMINI_MODELS: GeminiModelOption[] = [
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Lite',
    label: 'Gemini 3.5 Lite',
    shortLabel: '3.5 Lite',
    description: '極速回應，適合日常查詢與打包清單',
    badge: '推薦',
    supportsThinking: false,
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    label: 'Gemini 3.7 Flash',
    shortLabel: '3.7 Flash',
    description: '速度與推理均衡，支援思考設定',
    supportsThinking: true,
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    label: 'Gemini 3.1 Pro',
    shortLabel: '3.1 Pro',
    description: '深度推理，適合複雜行程排程',
    supportsThinking: true,
  },
  {
    id: 'gemini-pro-latest',
    name: 'Gemini 最新旗艦',
    label: 'Gemini 最新旗艦',
    shortLabel: '最新旗艦',
    description: '自動使用 Google 最新旗艦 Pro 版本',
    badge: '最新',
    supportsThinking: true,
  },
]

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'

export type ReasoningEffort = 'off' | 'low' | 'medium' | 'high'

export interface ReasoningEffortOption {
  id: ReasoningEffort
  label: string
  shortLabel: string
  budget: number
  description: string
}

export const REASONING_EFFORTS: ReasoningEffortOption[] = [
  {
    id: 'off',
    label: '關閉思考',
    shortLabel: '關閉',
    budget: 0,
    description: '不消耗思考 token，回應最快',
  },
  {
    id: 'low',
    label: '輕度思考',
    shortLabel: '輕度',
    budget: 1024,
    description: '快速邏輯推導 (~1k tokens)',
  },
  {
    id: 'medium',
    label: '中度思考',
    shortLabel: '中度',
    budget: 4096,
    description: '速度與推理品質均衡 (~4k tokens)',
  },
  {
    id: 'high',
    label: '深度思考',
    shortLabel: '深度',
    budget: 16384,
    description: '複雜多天動線排程 (~16k tokens)',
  },
]

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'low'

export function getThinkingBudget(effort: ReasoningEffort = DEFAULT_REASONING_EFFORT): number {
  const match = REASONING_EFFORTS.find((e) => e.id === effort)
  return match?.budget ?? 0
}
