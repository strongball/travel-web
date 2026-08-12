import { GoogleGenAI } from '@google/genai'
import { supabase } from './supabase'
import type {
  ExpenseItem,
  ReceiptScanRequest,
  ReceiptScanResult,
} from '../types/receipt'

export class ReceiptScanError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

const receiptSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sourceLocale: { type: 'string' },
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 250,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          sourceName: { type: 'string' },
          localizedName: { type: 'string' },
          quantity: { type: 'number', exclusiveMinimum: 0 },
          unitPrice: { type: ['number', 'null'], minimum: 0 },
          lineTotal: { type: ['number', 'null'], minimum: 0 },
        },
        required: [
          'sourceName',
          'localizedName',
          'quantity',
          'unitPrice',
          'lineTotal',
        ],
      },
    },
    receiptTotal: { type: ['number', 'null'], minimum: 0 },
  },
  required: ['sourceLocale', 'items', 'receiptTotal'],
} as const

const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const parseItem = (value: unknown, position: number): ExpenseItem => {
  if (!value || typeof value !== 'object') {
    throw new ReceiptScanError('INVALID_RESPONSE', '收據品項格式錯誤')
  }
  const item = value as Record<string, unknown>
  if (
    typeof item.sourceName !== 'string' ||
    typeof item.localizedName !== 'string' ||
    typeof item.quantity !== 'number' ||
    item.quantity <= 0
  ) {
    throw new ReceiptScanError('INVALID_RESPONSE', '收據品項資料不完整')
  }
  return {
    position,
    sourceName: item.sourceName,
    localizedName: item.localizedName,
    quantity: item.quantity,
    unitPrice: numberOrNull(item.unitPrice),
    lineTotal: numberOrNull(item.lineTotal),
  }
}

export const parseReceiptResult = (
  value: unknown,
  targetLocale: string,
): ReceiptScanResult => {
  if (!value || typeof value !== 'object') {
    throw new ReceiptScanError('INVALID_RESPONSE', 'Gemini 回傳格式錯誤')
  }
  const result = value as Record<string, unknown>
  if (
    typeof result.sourceLocale !== 'string' ||
    !Array.isArray(result.items)
  ) {
    throw new ReceiptScanError('INVALID_RESPONSE', 'Gemini 回傳格式錯誤')
  }
  const items = result.items.map(parseItem)
  const receiptTotal = numberOrNull(result.receiptTotal)
  const itemsTotal = Math.round(
    items.reduce((sum, item) => sum + (item.lineTotal ?? 0), 0) * 10_000,
  ) / 10_000
  return {
    schemaVersion: 1,
    sourceLocale: result.sourceLocale,
    targetLocale,
    items,
    receiptTotal,
    itemsTotal,
    difference: receiptTotal === null
      ? null
      : Math.round((receiptTotal - itemsTotal) * 10_000) / 10_000,
  }
}

const promptFor = ({ targetLocale, currencyHint }: ReceiptScanRequest) => [
  'Treat the images in their supplied order as consecutive sections of one long receipt.',
  'Extract every purchased product as a separate item row.',
  'sourceName must preserve the exact visible receipt wording. Do not translate, normalize, expand, or correct it.',
  `localizedName must translate the product name into ${targetLocale}.`,
  'When no quantity is printed for an item, return quantity 1.',
  'Return unitPrice only when printed or derived unambiguously; otherwise return null.',
  'Return lineTotal and receiptTotal only when reliably readable; otherwise return null.',
  'Never invent unreadable text or numeric values.',
  'Exclude subtotal, tax, discount, coupon, service fee, tip, payment method, tendered cash, and change.',
  `The form currency is ${currencyHint}; use it only as a reading hint and do not convert currencies.`,
].join('\n')

export const scanReceipt = async (
  request: ReceiptScanRequest,
): Promise<ReceiptScanResult> => {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) {
    throw new ReceiptScanError('UNAUTHENTICATED', '請先登入')
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  const ai = new GoogleGenAI({
    apiKey: 'proxied-by-edge-function',
    apiVersion: 'v1beta',
    httpOptions: {
      baseUrl: `${supabaseUrl}/functions/v1/gemini-proxy`,
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: publishableKey,
      },
      timeout: 45_000,
      retryOptions: { attempts: 1 },
    },
  })

  try {
    const response = await ai.models.generateContent({
      model: import.meta.env.VITE_GEMINI_MODEL || 'gemini-3.5-flash-lite',
      contents: [{
        role: 'user',
        parts: [
          { text: promptFor(request) },
          ...request.images.map((image) => ({
            inlineData: { data: image.data, mimeType: image.mimeType },
          })),
        ],
      }],
      config: {
        responseMimeType: 'application/json',
        responseJsonSchema: receiptSchema,
      },
    })
    if (!response.text) {
      throw new ReceiptScanError('UNREADABLE_RECEIPT', 'Gemini 未回傳收據資料')
    }
    return parseReceiptResult(JSON.parse(response.text), request.targetLocale)
  } catch (error) {
    if (error instanceof ReceiptScanError) throw error
    const message = error instanceof Error ? error.message : 'Gemini request failed'
    throw new ReceiptScanError('SCAN_FAILED', message)
  }
}
