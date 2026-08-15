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
