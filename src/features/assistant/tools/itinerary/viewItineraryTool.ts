import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import type { TripDay } from '../../../../types/database'
import type { AssistantProposalToolRuntime } from '../proposalToolRuntime'

export const VIEW_ITINERARY_TOOL_NAME = 'view_itinerary'

export const viewItineraryInputSchema = z.object({
  dayNumbers: z
    .array(z.number())
    .optional()
    .describe('欲查看的行程天數清單（1-indexed，例如 [1, 2]）。若未指定則回傳整趟旅程所有天數的完整景點、時間與交通排程。'),
})

export type ViewItineraryInput = z.infer<typeof viewItineraryInputSchema>

function formatDayDetails(day: TripDay, dayNumber: number): string[] {
  const lines: string[] = [
    `【第 ${dayNumber} 天行程現況】`,
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
  return lines
}

/**
 * 按需讀取行程工具：
 * 讓模型在需要檢視行程細節或整體規劃時調用。
 * 未傳參數時預設一次取得整趟所有天數的詳細排程，避免逐天重複呼叫。
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

    if (input.dayNumbers && input.dayNumbers.length > 0) {
      const lines: string[] = []
      for (const num of input.dayNumbers) {
        const dayIndex = Math.floor(num) - 1
        if (dayIndex < 0 || dayIndex >= days.length) {
          lines.push(`指定的第 ${num} 天超出範圍（本旅程共有 ${days.length} 天）。`)
          continue
        }
        lines.push(...formatDayDetails(days[dayIndex], dayIndex + 1))
      }
      return lines.join('\n')
    }

    // Default: Full overview + detailed breakdown of all days
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

    lines.push('', '【全體每日詳細排程】')
    days.forEach((day, idx) => {
      lines.push(...formatDayDetails(day, idx + 1))
    })

    return lines.join('\n')
  },
  {
    name: VIEW_ITINERARY_TOOL_NAME,
    description: '當需要查看行程景點安排（包含時間、地點、停留與交通）或每日總覽時使用。未傳參數時直接回傳整趟旅程所有天數的詳細排程；若僅需查詢特定天數可傳入 dayNumbers。切勿逐天分次呼叫。',
    schema: viewItineraryInputSchema,
  },
)
