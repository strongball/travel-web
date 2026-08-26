import { describe, expect, it, vi, beforeEach } from 'vitest'
import { tavilySearchTool, SEARCH_WEB_TOOL_NAME } from './tavilySearchTool'
import { supabase } from '../../../../lib/supabase'

vi.mock('../../../../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}))

describe('tavilySearchTool', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('has correct tool name and description', () => {
    expect(tavilySearchTool.name).toBe(SEARCH_WEB_TOOL_NAME)
    expect(tavilySearchTool.description).toContain('即時資訊')
  })

  it('returns formatted results with AI answer and links', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        query: '東京晴空塔 門票',
        answer: '東京晴空塔目前成人票價約為 2100 日圓，建議提前預約。',
        results: [
          {
            title: '東京晴空塔官網',
            url: 'https://www.tokyo-skytree.jp',
            content: '營業時間為 09:00 至 21:00，網路購票可享優惠。',
          },
        ],
      },
      error: null,
    } as any)

    const result = await tavilySearchTool.invoke({ query: '東京晴空塔 門票' })
    expect(supabase.functions.invoke).toHaveBeenCalledWith('tavily-proxy', {
      body: { query: '東京晴空塔 門票' },
    })
    expect(result).toContain('【即時搜尋摘要】：\n東京晴空塔目前成人票價約為 2100 日圓，建議提前預約。')
    expect(result).toContain('1. [東京晴空塔官網](https://www.tokyo-skytree.jp)\n營業時間為 09:00 至 21:00，網路購票可享優惠。')
  })

  it('handles empty query gracefully', async () => {
    const result = await tavilySearchTool.invoke({ query: '   ' })
    expect(result).toBe('搜尋關鍵字不能為空。')
    expect(supabase.functions.invoke).not.toHaveBeenCalled()
  })

  it('handles empty or missing results gracefully', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: {
        query: '未知景點',
        answer: null,
        results: [],
      },
      error: null,
    } as any)

    const result = await tavilySearchTool.invoke({ query: '未知景點' })
    expect(result).toBe('查無相關搜尋結果。')
  })

  it('handles Supabase function invocation error', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: null,
      error: { message: 'Tavily API key not configured' },
    } as any)

    const result = await tavilySearchTool.invoke({ query: '天氣' })
    expect(result).toBe('搜尋失敗：Tavily API key not configured')
  })

  it('handles Supabase function invocation error with context json', async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: async () => ({ message: 'Tavily proxy is not configured' }),
        },
      },
    } as any)

    const result = await tavilySearchTool.invoke({ query: '天氣' })
    expect(result).toBe('搜尋失敗：Tavily proxy is not configured')
  })

  it('returns friendly message immediately when offline', async () => {
    const originalOnLine = navigator.onLine
    try {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
      const result = await tavilySearchTool.invoke({ query: '天氣' })
      expect(result).toContain('離線狀態')
      expect(supabase.functions.invoke).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(navigator, 'onLine', { value: originalOnLine, configurable: true })
    }
  })

  it('handles network or unexpected exceptions', async () => {
    vi.mocked(supabase.functions.invoke).mockRejectedValueOnce(new Error('Network offline'))

    const result = await tavilySearchTool.invoke({ query: '天氣' })
    expect(result).toBe('搜尋時發生錯誤：Network offline')
  })
})
