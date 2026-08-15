import { describe, expect, it, vi } from 'vitest'

import {
  fetchLiveExchangeRates,
  getCurrencyInfo,
  getExchangeRate,
  missingExchangeRateCurrencies,
  normalizeExchangeRates,
  rebaseExchangeRates,
} from './currencies'


describe('exchange rates', () => {
  it('normalizes rates and always anchors the base currency at one', () => {
    expect(normalizeExchangeRates('twd', {
      usd: 32.5,
      JPY: 0,
      EUR: '34.8',
    })).toEqual({
      USD: 32.5,
      TWD: 1,
    })
  })

  it('converts a rate table when the display currency changes', () => {
    const rates = rebaseExchangeRates(
      { TWD: 1, USD: 32.5, JPY: 0.22 },
      'TWD',
      'USD',
    )

    expect(rates.USD).toBe(1)
    expect(rates.TWD).toBeCloseTo(1 / 32.5)
    expect(rates.JPY).toBeCloseTo(0.22 / 32.5)
  })

  it('reports a missing source rate instead of inventing one', () => {
    expect(getExchangeRate('JPY', 'TWD', { TWD: 1 })).toBeNull()
    expect(missingExchangeRateCurrencies(['TWD', 'JPY'], 'TWD', { TWD: 1 })).toEqual(['JPY'])
  })

  it('provides currency metadata with flags and names', () => {
    const jpy = getCurrencyInfo('JPY')
    expect(jpy.name).toBe('日圓')
    expect(jpy.flag).toBe('🇯🇵')
    expect(jpy.symbol).toBe('¥')

    const unknown = getCurrencyInfo('XYZ')
    expect(unknown.code).toBe('XYZ')
    expect(unknown.flag).toBe('🌐')
  })

  it('fetches and inverts live exchange rates correctly', async () => {
    const mockResponse = {
      result: 'success',
      base_code: 'TWD',
      time_last_update_utc: 'Sat, 15 Aug 2026 00:00:00 +0000',
      rates: {
        TWD: 1,
        USD: 0.03125, // 1 TWD = 0.03125 USD => 1 USD = 32 TWD
        JPY: 5,       // 1 TWD = 5 JPY => 1 JPY = 0.2 TWD
      },
    }

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    }) as unknown as typeof fetch

    try {
      const result = await fetchLiveExchangeRates('TWD')
      expect(result.rates.TWD).toBe(1)
      expect(result.rates.USD).toBe(32)
      expect(result.rates.JPY).toBe(0.2)
      expect(result.date).toBe('Sat, 15 Aug 2026')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

