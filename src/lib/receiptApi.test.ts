import { describe, expect, it } from 'vitest'
import { parseReceiptResult, ReceiptScanError, receiptResponseSchema } from './receiptApi'

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
})

