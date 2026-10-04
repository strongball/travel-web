import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import type { BaseMessage } from '@langchain/core/messages'
import { describe, expect, it } from 'vitest'
import { buildHumanMessage, validateModelInputSize } from './modelMessages'

const image = { id: 'image', name: '地圖.png', size: 3, mimeType: 'image/png', dataUrl: 'data:image/png;base64,YWJj' }
const pdf = { id: 'pdf', name: '訂位.pdf', size: 3, mimeType: 'application/pdf', dataUrl: 'data:application/pdf;base64,YWJj' }

describe('multimodal conversation input', () => {
  it('keeps text-only messages compatible and includes text-file contents', () => {
    expect(buildHumanMessage({ text: 'hello' }).content).toBe('hello')
    expect(buildHumanMessage({ text: '分析', attachments: [{ id: 'text', name: 'note', size: 1, mimeType: 'text/plain', textContent: '預約時間' }] }).content).toContain('預約時間')
  })

  it('converts PDF and image attachments into actual Gemini request parts without network access', () => {
    const model = new ChatGoogleGenerativeAI({ model: 'gemini-2.0-flash', apiKey: 'test' })
    const adapter = model as unknown as { _buildGenerateContentRequest: (messages: BaseMessage[], options: object) => { contents: Array<{ parts: unknown[] }> } }
    const request = adapter._buildGenerateContentRequest([buildHumanMessage({ text: '幫我看訂位', attachments: [image, pdf] })], {})
    expect(request.contents[0].parts).toContainEqual({ inlineData: { mimeType: 'application/pdf', data: 'YWJj' } })
    expect(request.contents[0].parts).toContainEqual({ inlineData: { mimeType: 'image/png', data: 'YWJj' } })
  })

  it('rejects invalid or unsupported binary attachments instead of silently ignoring them', () => {
    expect(() => buildHumanMessage({ text: '', attachments: [{ ...pdf, dataUrl: 'not-a-pdf' }] })).toThrow('重新上傳')
    expect(() => buildHumanMessage({ text: '', attachments: [{ ...pdf, mimeType: 'application/zip' }] })).toThrow('無法分析')
  })

  it('reports an oversized context before the proxy request', () => {
    expect(() => validateModelInputSize([buildHumanMessage({ text: 'x'.repeat(16 * 1024 * 1024) })])).toThrow('總量過大')
  })
})
