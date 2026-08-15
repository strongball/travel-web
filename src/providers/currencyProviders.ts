import { promiseProviderFamily } from '@stball/react-river'
import { fetchLiveExchangeRates, type ExchangeRates } from '../lib/currencies'

export interface LiveExchangeRatesResult {
  rates: ExchangeRates
  date?: string
}

/**
 * Promise provider family to fetch and cache live exchange rates against a base currency.
 * Cached for 5 minutes per base currency.
 */
export const liveExchangeRatesFamily = promiseProviderFamily<
  LiveExchangeRatesResult,
  string
>(
  async (_ref, baseCurrency) => {
    return fetchLiveExchangeRates(baseCurrency)
  },
  { name: 'liveExchangeRates', cacheTime: 300_000 },
)
