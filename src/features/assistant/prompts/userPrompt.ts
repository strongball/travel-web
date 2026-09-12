import type { AssistantAttachment } from '../types'

/**
 * 建構傳給模型的使用者問題提示詞純文字（不向 Prompt 注入大塊行程/待辦，依按需工具原則維持輕量）
 */
export function buildAssistantUserPrompt(
  currentQuestion: string,
  attachments: AssistantAttachment[] = [],
): string {
  const parts: string[] = []

  if (attachments.length > 0) {
    const textAttachments = attachments.filter((att) => att.textContent)
    for (const att of textAttachments) {
      parts.push(`### 檔案【${att.name}】內容：\n${att.textContent}`)
    }
  }

  parts.push(currentQuestion || '（使用者提供了附件並請求分析）')
  return parts.join('\n\n')
}
