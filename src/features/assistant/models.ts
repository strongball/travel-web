export interface GeminiModelOption {
  id: string
  name: string
  label: string
  shortLabel: string
  description: string
  badge?: string
}

export const GEMINI_MODELS: GeminiModelOption[] = [
  {
    id: 'gemini-3.5-flash-lite',
    name: 'Gemini 3.5 Flash Lite',
    label: 'Gemini 3.5 Lite (快速)',
    shortLabel: '3.5 Lite',
    description: '快速、低延遲，適合日常查詢與打包清單整理',
    badge: '預設推薦',
  },
  {
    id: 'gemini-3.7-flash',
    name: 'Gemini 3.7 Flash',
    label: 'Gemini 3.7 (均衡)',
    shortLabel: '3.7 Flash',
    description: '速度與推理均衡，適合多步驟行程規劃',
  },
  {
    id: 'gemini-3.1-pro-preview',
    name: 'Gemini 3.1 Pro',
    label: 'Gemini 3.1 Pro (深度推理)',
    shortLabel: '3.1 Pro',
    description: '深度推理與高品質分析，適合複雜行程',
  },
  {
    id: 'gemini-pro-latest',
    name: 'Gemini Pro Latest (永遠最新)',
    label: 'Gemini 最新旗艦 (自動更新)',
    shortLabel: '最新旗艦',
    description: '自動指向 Google 官方釋出的最新 Pro 旗艦版本',
    badge: '永遠最新',
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
    label: '關閉思考 (0 token / 最快)',
    shortLabel: '關閉',
    budget: 0,
    description: '不消耗思考 token，回應最為即時',
  },
  {
    id: 'low',
    label: '輕度思考 (~1k tokens)',
    shortLabel: '輕度',
    budget: 1024,
    description: '使用少量思考 tokens 進行快速邏輯推導',
  },
  {
    id: 'medium',
    label: '中度思考 (~4k tokens)',
    shortLabel: '中度',
    budget: 4096,
    description: '速度與推理品質均衡，推薦一般行程使用',
  },
  {
    id: 'high',
    label: '深度思考 (~16k tokens)',
    shortLabel: '深度',
    budget: 16384,
    description: '使用高思考預算進行複雜多天行程與動線排程',
  },
]

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'low'

export function getThinkingBudget(effort: ReasoningEffort = DEFAULT_REASONING_EFFORT): number {
  const match = REASONING_EFFORTS.find((e) => e.id === effort)
  return match?.budget ?? 0
}
