import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import { supabase } from '../../../../lib/supabase'

export const SEARCH_WEB_TOOL_NAME = 'search_web_information'

export const tavilySearchInputSchema = z.object({
  query: z.string().describe('要搜尋的關鍵字或查詢語句'),
})

export type TavilySearchInput = z.infer<typeof tavilySearchInputSchema>

export interface TavilySearchResultItem {
  title: string
  url: string
  content: string
}

export interface TavilySearchResponse {
  query: string
  answer: string | null
  results: TavilySearchResultItem[]
}

export const tavilySearchTool = tool(
  async (input: TavilySearchInput) => {
    const query = input.query?.trim()
    if (!query) {
      return '搜尋關鍵字不能為空。'
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return '目前處於離線狀態，無法進行即時網路搜尋。請根據既有行程與已知資訊進行回覆。'
    }

    try {
      const { data, error } = await supabase.functions.invoke<TavilySearchResponse>('tavily-proxy', {
        body: { query },
      })

      if (error) {
        let msg = error.message || '無法連線至搜尋服務'
        if ('context' in error && error.context && typeof (error.context as { json?: unknown }).json === 'function') {
          try {
            const body = await (error.context as Response).json()
            if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') {
              msg = body.message
            }
          } catch {
            // Ignore response parsing failure
          }
        }
        return `搜尋失敗：${msg}`
      }

      if (!data) {
        return '查無相關搜尋結果。'
      }

      const parts: string[] = []
      if (data.answer) {
        parts.push(`【即時搜尋摘要】：\n${data.answer}`)
      }

      if (Array.isArray(data.results) && data.results.length > 0) {
        parts.push('【參考來源與詳細內容】：')
        data.results.forEach((item, index) => {
          const title = item.title || '無標題'
          const link = item.url ? `[${title}](${item.url})` : title
          parts.push(`${index + 1}. ${link}\n${item.content || '無內容摘要'}`)
        })
      }

      return parts.join('\n\n') || '查無相關搜尋結果。'
    } catch (error) {
      return `搜尋時發生錯誤：${error instanceof Error ? error.message : String(error)}`
    }
  },
  {
    name: SEARCH_WEB_TOOL_NAME,
    description: '當需要透過搜尋引擎檢索即時資訊、最新情報、網路資料或進行聯網查證時使用。',
    schema: tavilySearchInputSchema,
  },
)
