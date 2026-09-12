import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { AssistantProposalToolRuntime } from '../proposalToolRuntime'

export const VIEW_ITINERARY_TOOL_NAME = 'view_itinerary'

export const viewItineraryInputSchema = z.object({
  dayNumber: z
    .number()
    .optional()
    .describe('欲查看的行程第幾天（1-indexed，例如第 1 天傳 1）。若未指定則列出整趟旅程各天景點名稱概況。'),
})

export type ViewItineraryInput = z.infer<typeof viewItineraryInputSchema>

/**
 * 按需讀取行程工具：
 * 讓模型在需要檢視特定天數或整體景點規劃時調用，杜絕每一回合將全部景點 Dump 入 Prompt 的 Token 浪費。
 */
export const viewItineraryTool = tool(
  async (input: ViewItineraryInput, runtime: AssistantProposalToolRuntime) => {
    const request = runtime.state?.request
    const itinerary = request?.itinerary
    if (!itinerary) {
      return '目前無法讀取行程資訊。'
    }

    const days = itinerary.days ?? []
    if (days.length === 0) {
      return `【${itinerary.title}】目前尚無設定任何天數與景點。`
    }

    if (input.dayNumber !== undefined) {
      const dayIndex = Math.floor(input.dayNumber) - 1
      if (dayIndex < 0 || dayIndex >= days.length) {
        return `指定的第 ${input.dayNumber} 天超出範圍（本旅程共有 ${days.length} 天）。`
      }
      const day = days[dayIndex]
      const lines: string[] = [
        `【第 ${input.dayNumber} 天行程現況】`,
        `- 日期：${day.date.slice(0, 10)}（Day ID: ${day.id}，版本: rev ${day.revision}）`,
        `- 開始時間：${day.startTime?.slice(11, 16) || day.startTime || '未設定'}`,
      ]

      if (day.attractions.length === 0) {
        lines.push('- 景點：目前尚無景點安排。')
      } else {
        lines.push('- 景點清單：')
        day.attractions.forEach((attr, idx) => {
          const time = `${attr.startTime?.slice(11, 16) || '未排'}~${attr.endTime?.slice(11, 16) || '未排'}`
          const loc = attr.locationName || attr.name
          const transport = attr.transportMode ? ` | 交通: ${attr.transportMode} (${attr.travelTime ?? 0}分)` : ''
          lines.push(
            `  ${idx + 1}. [ID: ${attr.id}] ${attr.name}（地點: ${loc} | 時間: ${time} | 停留: ${attr.duration}分${transport}）`
          )
        })
      }
      return lines.join('\n')
    }

    // Full overview across all days
    const lines: string[] = [
      `【${itinerary.title} 全體行程總覽】（共 ${days.length} 天，幣別: ${itinerary.currency}）`,
    ]
    days.forEach((day, idx) => {
      const attrSummary = day.attractions.length > 0
        ? day.attractions.map((a) => a.name).join(' -> ')
        : '（尚無景點）'
      lines.push(
        `第 ${idx + 1} 天 (${day.date.slice(0, 10)}, ID: ${day.id}, rev ${day.revision}, 共 ${day.attractions.length} 個景點): ${attrSummary}`
      )
    })
    return lines.join('\n')
  },
  {
    name: VIEW_ITINERARY_TOOL_NAME,
    description: '當需要查看特定天數的詳細景點安排（包含時間、地點、停留與交通）、或查看整趟旅程的每日總覽時使用。',
    schema: viewItineraryInputSchema,
  },
)
