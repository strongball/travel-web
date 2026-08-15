export const supportedCurrencies = [
  'TWD',
  'USD',
  'JPY',
  'EUR',
  'KRW',
  'CNY',
  'HKD',
  'SGD',
  'THB',
  'VND',
  'GBP',
  'AUD',
  'CAD',
] as const

export type SupportedCurrency = (typeof supportedCurrencies)[number]

export interface CurrencyInfo {
  code: string
  name: string
  symbol: string
  flag: string
}

export const currencyInfoMap: Record<string, CurrencyInfo> = {
  TWD: { code: 'TWD', name: '新台幣', symbol: 'NT$', flag: '🇹🇼' },
  USD: { code: 'USD', name: '美元', symbol: '$', flag: '🇺🇸' },
  JPY: { code: 'JPY', name: '日圓', symbol: '¥', flag: '🇯🇵' },
  EUR: { code: 'EUR', name: '歐元', symbol: '€', flag: '🇪🇺' },
  KRW: { code: 'KRW', name: '韓元', symbol: '₩', flag: '🇰🇷' },
  CNY: { code: 'CNY', name: '人民幣', symbol: '¥', flag: '🇨🇳' },
  HKD: { code: 'HKD', name: '港幣', symbol: 'HK$', flag: '🇭🇰' },
  SGD: { code: 'SGD', name: '新加坡幣', symbol: 'S$', flag: '🇸🇬' },
  THB: { code: 'THB', name: '泰銖', symbol: '฿', flag: '🇹🇭' },
  VND: { code: 'VND', name: '越南盾', symbol: '₫', flag: '🇻🇳' },
  GBP: { code: 'GBP', name: '英鎊', symbol: '£', flag: '🇬🇧' },
  AUD: { code: 'AUD', name: '澳幣', symbol: 'A$', flag: '🇦🇺' },
  CAD: { code: 'CAD', name: '加幣', symbol: 'C$', flag: '🇨🇦' },
  MYR: { code: 'MYR', name: '馬來西亞令吉', symbol: 'RM', flag: '🇲🇾' },
  PHP: { code: 'PHP', name: '菲律賓披索', symbol: '₱', flag: '🇵🇭' },
  MOP: { code: 'MOP', name: '澳門幣', symbol: 'MOP$', flag: '🇲🇴' },
  NZD: { code: 'NZD', name: '紐西蘭幣', symbol: 'NZ$', flag: '🇳🇿' },
  CHF: { code: 'CHF', name: '瑞士法郎', symbol: 'CHF', flag: '🇨🇭' },
  SEK: { code: 'SEK', name: '瑞典克朗', symbol: 'kr', flag: '🇸🇪' },
  IDR: { code: 'IDR', name: '印尼盾', symbol: 'Rp', flag: '🇮🇩' },
}

export const getCurrencyInfo = (currency: string): CurrencyInfo => {
  const code = (currency || '').trim().toUpperCase()
  return (
    currencyInfoMap[code] ?? {
      code: code || 'UNKNOWN',
      name: code || '未知貨幣',
      symbol: code || '',
      flag: '🌐',
    }
  )
}

export const popularCurrencies = [
  'JPY',
  'KRW',
  'USD',
  'EUR',
  'THB',
  'VND',
  'CNY',
  'HKD',
  'SGD',
  'GBP',
  'AUD',
  'CAD',
] as const

export const normalizeCurrency = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const code = value.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : null
}

export type ExchangeRates = Record<string, number>

const canonicalCurrency = (value: string) =>
  normalizeCurrency(value) ?? value.trim().toUpperCase()

const isValidRate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0

/**
 * Rates are stored as: 1 unit of source currency = N units of the itinerary
 * currency. The itinerary currency is always normalized to a rate of 1.
 */
export const normalizeExchangeRates = (
  baseCurrency: string,
  exchangeRates?: Record<string, unknown>,
): ExchangeRates => {
  const base = canonicalCurrency(baseCurrency) || 'TWD'
  const normalized: ExchangeRates = {}

  Object.entries(exchangeRates ?? {}).forEach(([currency, rate]) => {
    const code = normalizeCurrency(currency)
    if (code && isValidRate(rate)) normalized[code] = rate
  })

  normalized[base] = 1
  return normalized
}

export const getExchangeRate = (
  sourceCurrency: string,
  baseCurrency: string,
  exchangeRates?: Record<string, unknown>,
): number | null => {
  const source = canonicalCurrency(sourceCurrency)
  const base = canonicalCurrency(baseCurrency)
  if (!source || !base || source === base) return 1

  const rate = normalizeExchangeRates(base, exchangeRates)[source]
  return isValidRate(rate) ? rate : null
}

export const isExchangeRateConfigured = (
  sourceCurrency: string,
  baseCurrency: string,
  exchangeRates?: Record<string, unknown>,
) => getExchangeRate(sourceCurrency, baseCurrency, exchangeRates) !== null

export const missingExchangeRateCurrencies = (
  currencies: readonly string[],
  baseCurrency: string,
  exchangeRates?: Record<string, unknown>,
) => Array.from(new Set(
  currencies
    .map((currency) => normalizeCurrency(currency))
    .filter((currency): currency is string => Boolean(currency)),
)).filter((currency) => !isExchangeRateConfigured(currency, baseCurrency, exchangeRates))

/** Re-express an existing rate table against a different base currency. */
export const rebaseExchangeRates = (
  exchangeRates: Record<string, unknown> | undefined,
  previousBaseCurrency: string,
  nextBaseCurrency: string,
): ExchangeRates => {
  const previousBase = canonicalCurrency(previousBaseCurrency) || 'TWD'
  const nextBase = canonicalCurrency(nextBaseCurrency) || previousBase
  const current = normalizeExchangeRates(previousBase, exchangeRates)
  if (previousBase === nextBase) return current

  const nextBaseRate = current[nextBase]
  if (!isValidRate(nextBaseRate)) {
    // There is no mathematically safe conversion without a rate for the new
    // base. Start a clean table and let the editor ask for the missing rates.
    return { [nextBase]: 1 }
  }

  const rebased = Object.fromEntries(
    Object.entries(current).map(([currency, rate]) => [currency, rate / nextBaseRate]),
  )
  rebased[nextBase] = 1
  return rebased
}

/**
 * Fetch live exchange rates relative to a base currency from open exchangerate API.
 * Returns a map of `currency -> rate`, where `rate` is:
 * 1 unit of source currency = `rate` units of `baseCurrency`.
 */
export const fetchLiveExchangeRates = async (
  baseCurrency: string,
): Promise<{ rates: ExchangeRates; date?: string }> => {
  const base = normalizeCurrency(baseCurrency) ?? 'TWD'
  const response = await fetch(`https://open.er-api.com/v6/latest/${base}`)
  if (!response.ok) {
    throw new Error(`匯率 API 請求失敗 (${response.status})`)
  }
  const data = await response.json()
  if (data.result !== 'success' || !data.rates || typeof data.rates !== 'object') {
    throw new Error('匯率 API 回傳格式錯誤')
  }

  const rates: ExchangeRates = { [base]: 1 }
  for (const [curr, rawRate] of Object.entries(data.rates)) {
    const code = normalizeCurrency(curr)
    if (code && typeof rawRate === 'number' && rawRate > 0) {
      // open.er-api.com returns: 1 base = rawRate target
      // We store: 1 target = (1 / rawRate) base
      const convertedRate = 1 / rawRate
      // Format cleanly with up to 6 significant digits to avoid float precision artifacts
      rates[code] = Number(convertedRate.toPrecision(6))
    }
  }

  const date = typeof data.time_last_update_utc === 'string'
    ? data.time_last_update_utc.slice(0, 16)
    : new Date().toISOString().slice(0, 10)

  return { rates, date }
}

