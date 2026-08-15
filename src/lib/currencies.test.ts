import { describe, expect, it } from 'vitest'

import {
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
})
