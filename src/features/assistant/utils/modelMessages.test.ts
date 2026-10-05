import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { describe, expect, it } from 'vitest'
import { buildHumanMessage, reviewedModelMessages, validateModelInputSize } from './modelMessages'

const image = { id: 'image', name: '地圖.png', size: 3, mimeType: 'image/png', dataUrl: 'data:image/png;base64,YWJj' }
const pdf = { id: 'pdf', name: '訂位.pdf', size: 3, mimeType: 'application/pdf', dataUrl: 'data:application/pdf;base64,YWJj' }

describe('multimodal conversation input', () => {
  it('keeps reviewed decisions but drops failed proposals and stale reads on retry', () => {
    const call = (id: string) => new AIMessage({ content: '', tool_calls: [{ id, name: 'tool', args: {}, type: 'tool_call' }] })
    const messages = reviewedModelMessages([
      buildHumanMessage({ text: '晚餐', attachments: [image] }),
      call('question'), new ToolMessage({ tool_call_id: 'question', content: '使用者偏好', artifact: { questionResult: { answer: '步調放慢' } } }),
      call('applied'), new ToolMessage({ tool_call_id: 'applied', content: '已套用', artifact: { proposal: { status: 'applied' } } }),
      call('read'), new ToolMessage({ tool_call_id: 'read', content: '舊行程' }),
      call('failed'), new ToolMessage({ tool_call_id: 'failed', content: '缺少 00:00', status: 'error' }),
    ])
    expect(messages.filter(AIMessage.isInstance).flatMap((message) => message.tool_calls?.map((call) => call.id))).toEqual(['question', 'applied'])
    expect(messages.filter(ToolMessage.isInstance).map((message) => message.content)).toEqual(['使用者偏好', '已套用'])
    expect(JSON.stringify(messages[0].content)).toContain(image.dataUrl)
  })
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
