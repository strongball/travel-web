import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import type { AssistantAttachment, AssistantMessage, AssistantProposal } from '../types'
import { buildAssistantUserPrompt } from '../prompts/userPrompt'

/** Keep reviewed changes visible to the model without repeating persistence metadata. */
export function proposalModelContext(proposal: AssistantProposal) {
  const days = (items: AssistantProposal['afterDays']) => items.map((day) => ({
    id: day.id,
    date: day.date,
    startTime: day.startTime,
    attractions: day.attractions.map(({ id, name, description, startTime, endTime, duration, travelTime, transportMode, cost, locationName }) => ({
      id, name, description, startTime, endTime, duration, travelTime, transportMode, cost, locationName,
    })),
  }))
  return {
    title: proposal.title,
    explanation: proposal.explanation,
    status: proposal.status,
    beforeDays: days(proposal.beforeDays),
    afterDays: days(proposal.afterDays),
    timeChecks: proposal.timeChecks,
    proposedTodos: proposal.proposedTodos,
    proposedCategories: proposal.proposedCategories,
  }
}

export function buildAssistantHistoryMessage(message: AssistantMessage) {
  if (message.role === 'user') return buildHumanMessage({ text: message.content, attachments: message.attachments })
  return new AIMessage(message.proposal
    ? `${message.content}\n提案紀錄（歷史內容，未套用的提案不代表目前資料）：${JSON.stringify(proposalModelContext(message.proposal))}`
    : message.content)
}

/** Retain user decisions, discard failed attempts and stale reads on manual retry. */
export function reviewedModelMessages(messages: BaseMessage[]) {
  const reviewed = messages.filter(ToolMessage.isInstance).filter((message) => message.artifact && message.status !== 'error')
  const ids = new Set(reviewed.map((message) => message.tool_call_id))
  return messages.flatMap((message): BaseMessage[] => {
    if (ToolMessage.isInstance(message)) return ids.has(message.tool_call_id) ? [message] : []
    if (!AIMessage.isInstance(message) || !message.tool_calls?.length) return [message]
    const calls = message.tool_calls.filter((call) => call.id && ids.has(call.id))
    return calls.length ? [new AIMessage({
      content: message.content, id: message.id, additional_kwargs: message.additional_kwargs,
      response_metadata: message.response_metadata, tool_calls: calls,
    })] : []
  })
}

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
