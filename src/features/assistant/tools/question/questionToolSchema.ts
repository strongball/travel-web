import { z } from 'zod'

export const questionOptionSchema = z.object({
  id: z.string().describe('選項識別代碼，例如 "opt_1" 或簡稱'),
  label: z.string().describe('選項名稱/顯示文字，例如 "☕ 悠閒慢活（每天 1~2 個景點）"'),
  description: z.string().optional().describe('選項簡短說明或優缺點'),
})

export const askClarifyingQuestionSchema = z.object({
  question: z.string().describe('向使用者提出的具體問題或確認事項，例如「這趟東京行程，你們比較偏好哪種步調？」'),
  options: z.array(questionOptionSchema).min(2).max(5).describe('提供給使用者的選擇題選項列表（建議 2~4 個具體選項）'),
  multiple: z.boolean().optional().describe('是否允許多選，預設為 false（單選）'),
  allowCustomInput: z.boolean().optional().describe('是否允許使用者輸入自訂文字回答，預設為 true'),
})
