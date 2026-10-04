import { describe, expect, it } from 'vitest'
import { friendlyError } from './conversationUtils'

const limited = '[GoogleGenerativeAI Error]: Error fetching from gemini-proxy: [429 ] You exceeded your current quota. Quota exceeded for metric: generate_content_free_tier_input_token_count. Please retry in 18.078853646s. [{"quotaId":"GenerateContentInputTokensPerModelPerMinute-FreeTier"}]'
describe('assistant error messages', () => {
  it('explains temporary token limits without advising payment or dumping provider data', () => {
    const message = friendlyError(new Error(limited), '失敗')
    expect(message).toContain('暫時達到流量限制')
    expect(message).toContain('稍候約 19 秒')
    expect(message).not.toContain('補充')
    expect(message).not.toContain('gemini-proxy')
  })
  it('recognizes structured quota errors and retry delays', () => {
    const message = friendlyError(JSON.stringify({ error: { code: 429, message: 'Too many requests', details: [{ retryDelay: '7s' }] } }), '失敗')
    expect(message).toContain('稍候約 7 秒')
  })
  it('does not treat unspecified or daily quotas as insufficient prepaid credits', () => {
    expect(friendlyError(JSON.stringify({ error: { code: 429, message: 'daily quota exceeded' } }), '失敗')).toContain('配額受限')
    expect(friendlyError({ code: 429, message: 'rate limited' }, '失敗')).toContain('配額受限')
  })
  it('keeps prepaid-credit and ordinary error messages distinct', () => {
    expect(friendlyError(JSON.stringify({ error: { code: 429, message: 'prepayment credits exhausted' } }), '失敗')).toContain('補充 Gemini API 額度')
    expect(friendlyError(new Error('連線中斷'), '失敗')).toBe('連線中斷')
    expect(friendlyError(null, '失敗')).toBe('失敗')
  })
})
