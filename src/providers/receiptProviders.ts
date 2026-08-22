import { promiseProviderFamily, stateProvider } from '@stball/react-river'

import { signedReceiptUrl } from '../lib/repositories'
import type { ReceiptScanResult } from '../types/receipt'

export const signedReceiptUrlsFamily = promiseProviderFamily<string[], string[]>(
  async (_ref, references) => {
    if (!references || references.length === 0) return []
    return Promise.all(
      references.map((reference) => signedReceiptUrl(reference).catch(() => '')),
    )
  },
  { name: 'signedReceiptUrls' },
)

export const receiptResultProvider = stateProvider<ReceiptScanResult | null>(
  () => null,
  { name: 'receiptResult' },
)
