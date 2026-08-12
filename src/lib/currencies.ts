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
