import { HumanMessage, type BaseMessage } from '@langchain/core/messages'
import type { AssistantAttachment } from '../types'
import { buildAssistantUserPrompt } from '../prompts/userPrompt'

/** Use the same multimodal input for new turns and attachment follow-up questions. */
export function buildHumanMessage({ text, attachments = [] }: {
  text: string
  attachments?: AssistantAttachment[] | null
}) {
  const files = attachments ?? []
  const content: Array<{ type: string; [key: string]: unknown }> = [
    { type: 'text', text: buildAssistantUserPrompt(text, files) },
  ]
  for (const attachment of files) {
    if (!attachment.dataUrl) continue
    if (attachment.mimeType.startsWith('image/')) {
      content.push({ type: 'image_url', image_url: { url: attachment.dataUrl } })
    } else if (attachment.mimeType === 'application/pdf') {
      const match = attachment.dataUrl.match(/^data:application\/pdf;base64,(.+)$/s)
      if (!match) throw new Error(`PDF「${attachment.name}」的檔案內容無效，請重新上傳`)
      content.push({ type: 'text', text: `PDF 檔案：${attachment.name}` })
      content.push({ type: 'media', mimeType: 'application/pdf', data: match[1] })
    } else {
      throw new Error(`無法分析附件「${attachment.name}」，請使用圖片、PDF 或文字檔`)
    }
  }
  return content.length === 1
    ? new HumanMessage(buildAssistantUserPrompt(text, files))
    : new HumanMessage({ content })
}

/** Leave room for tool declarations within the proxy's 18 MiB request limit. */
export function validateModelInputSize(messages: BaseMessage[]) {
  const bytes = new TextEncoder().encode(JSON.stringify(messages.map((message) => message.content))).byteLength
  if (bytes > 16 * 1024 * 1024) {
    throw new Error('這次對話的附件與文字總量過大，請減少附件或另開對話後重新上傳。原訊息會保留。')
  }
}
