import { describe, expect, it } from 'vitest'
import {
  extractJsonFromText,
  parseReceiptResult,
  ReceiptScanError,
  receiptResponseSchema,
} from './receiptApi'

describe('extractJsonFromText', () => {
  it('extracts plain json directly', () => {
    const raw = '{"sourceLocale":"ja","items":[]}'
    expect(extractJsonFromText(raw)).toBe(raw)
  })

  it('extracts json from markdown code block', () => {
    const raw = '```json\n{"sourceLocale":"ja","items":[]}\n```'
    expect(extractJsonFromText(raw)).toBe('{"sourceLocale":"ja","items":[]}')
  })

  it('extracts json from markdown with surrounding commentary', () => {
    const raw = 'Here is the result:\n```json\n{"sourceLocale":"ja","items":[]}\n```\nHope it helps!'
    expect(extractJsonFromText(raw)).toBe('{"sourceLocale":"ja","items":[]}')
  })
})

describe('parseReceiptResult', () => {
  it('validates items and calculates totals in the browser', () => {
    expect(parseReceiptResult({
      sourceLocale: 'ja',
      detectedCurrency: 'JPY',
      items: [{ sourceName: 'お茶', localizedName: '茶', quantity: 2, unitPrice: 10, lineTotal: 20 }],
      receiptTotal: 25,
    }, 'zh-TW')).toMatchObject({
      schemaVersion: 1,
      targetLocale: 'zh-TW',
      itemsTotal: 20,
      difference: 5,
      detectedCurrency: 'JPY',
    })
  })

  it('fallbacks localizedName to sourceName when missing or null', () => {
    const result = parseReceiptResult({
      sourceLocale: 'en',
      items: [{ sourceName: 'Espresso', localizedName: null, quantity: 1, unitPrice: 4.5, lineTotal: 4.5 }],
    }, 'zh-TW')

    expect(result.items[0]?.localizedName).toBe('Espresso')
    expect(result.itemsTotal).toBe(4.5)
  })

  it('rejects malformed Gemini output', () => {
    expect(() => parseReceiptResult({ sourceLocale: 'en', items: [{ quantity: 0 }] }, 'zh-TW'))
      .toThrow(ReceiptScanError)
  })

  it('exports structured outputs schema for Gemini', () => {
    expect(receiptResponseSchema).toBeDefined()
    expect(receiptResponseSchema.type).toBe('OBJECT')
    expect(receiptResponseSchema.properties).toHaveProperty('items')
    expect(receiptResponseSchema.properties).toHaveProperty('sourceLocale')
  })

  it('ReceiptScanError correctly inherits from Error', () => {
    const err = new ReceiptScanError('SCAN_FAILED', '測試錯誤')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(ReceiptScanError)
    expect(err.message).toBe('測試錯誤')
    expect(err.code).toBe('SCAN_FAILED')
  })
})


