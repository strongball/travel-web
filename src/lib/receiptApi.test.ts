import { describe, expect, it } from 'vitest'
import { parseReceiptResult, ReceiptScanError } from './receiptApi'

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

  it('rejects malformed Gemini output', () => {
    expect(() => parseReceiptResult({ sourceLocale: 'en', items: [{ quantity: 0 }] }, 'zh-TW'))
      .toThrow(ReceiptScanError)
  })
})
