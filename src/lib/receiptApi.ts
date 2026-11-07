import { GoogleGenAI, Type, type Schema } from '@google/genai'
import { z } from 'zod'
import { config } from '../config'
import { supabase } from './supabase'
import type {
  ExpenseItem,
  ReceiptScanRequest,
  ReceiptScanResult,
} from '../types/receipt'
import { normalizeCurrency } from './currencies'

export class ReceiptScanError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ReceiptScanError'
    this.code = code
    Object.setPrototypeOf(this, ReceiptScanError.prototype)
  }
}

export const rawReceiptItemSchema = z.object({
  sourceName: z.string().min(1, '收據品項原文不可為空'),
  localizedName: z.string().nullish().transform((val) => val ?? ''),
  quantity: z.number().positive('數量必須為正數'),
  unitPrice: z.number().nullish().transform((val) => (val !== undefined && val !== null && Number.isFinite(val) ? val : null)),
  lineTotal: z.number().nullish().transform((val) => (val !== undefined && val !== null && Number.isFinite(val) ? val : null)),
})

export const rawReceiptResultSchema = z.object({
  sourceLocale: z.string().min(1, '缺少來源語言代碼'),
  detectedCurrency: z.string().nullish().transform((val) => val ?? null),
  items: z.array(rawReceiptItemSchema),
  receiptTotal: z.number().nullish().transform((val) => (val !== undefined && val !== null && Number.isFinite(val) ? val : null)),
})

export const receiptResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    sourceLocale: {
      type: Type.STRING,
      description: 'The language detected on the receipt, e.g. ja, en, zh-TW, fr',
    },
    detectedCurrency: {
      type: Type.STRING,
      description: 'ISO 4217 three-letter currency code printed on the receipt (e.g. JPY, TWD, USD, EUR), or null',
      nullable: true,
    },
    items: {
      type: Type.ARRAY,
      description: 'List of purchased items on the receipt',
      items: {
        type: Type.OBJECT,
        properties: {
          sourceName: {
            type: Type.STRING,
            description: 'Exact visible receipt wording for this item. Do not translate or change.',
          },
          localizedName: {
            type: Type.STRING,
            description: 'Translated item name into the target language.',
          },
          quantity: {
            type: Type.NUMBER,
            description: 'Quantity of items purchased. Return 1 when not printed.',
          },
          unitPrice: {
            type: Type.NUMBER,
            description: 'Unit price if printed, otherwise null.',
            nullable: true,
          },
          lineTotal: {
            type: Type.NUMBER,
            description: 'Total price for this line item if printed, otherwise null.',
            nullable: true,
          },
        },
        required: ['sourceName', 'quantity'],
      },
    },
    receiptTotal: {
      type: Type.NUMBER,
      description: 'The final total amount printed on the receipt, or null if unreadable.',
      nullable: true,
    },
  },
  required: ['sourceLocale', 'items'],
}

export const parseReceiptResult = (
  value: unknown,
  targetLocale: string,
): ReceiptScanResult => {
  const parseResult = rawReceiptResultSchema.safeParse(value)
  if (!parseResult.success) {
    throw new ReceiptScanError(
      'INVALID_RESPONSE',
      parseResult.error.issues[0]?.message || 'Gemini 回傳格式錯誤',
    )
  }
  const result = parseResult.data
  const items: ExpenseItem[] = result.items.map((item, position) => ({
    position,
    sourceName: item.sourceName,
    localizedName: item.localizedName || item.sourceName,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    lineTotal: item.lineTotal,
  }))
  const detectedCurrency = normalizeCurrency(result.detectedCurrency)
  const receiptTotal = result.receiptTotal
  const itemsTotal = Math.round(
    items.reduce((sum, item) => sum + (item.lineTotal ?? 0), 0) * 10_000,
  ) / 10_000
  return {
    schemaVersion: 1,
    sourceLocale: result.sourceLocale,
    targetLocale,
    detectedCurrency,
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
  'Detect the currency actually printed on the receipt. Return its three-letter ISO 4217 code in detectedCurrency, such as TWD, JPY, USD, EUR, KRW, or CNY. Return null when it cannot be determined.',
  'Return only valid JSON with this exact shape: {"sourceLocale":"string","detectedCurrency":null,"items":[{"sourceName":"string","localizedName":"string","quantity":1,"unitPrice":null,"lineTotal":null}],"receiptTotal":null}.',
  'Do not wrap the JSON in markdown or add explanatory text.',
].join('\n')

export const extractJsonFromText = (text: string): string => {
  const trimmed = text.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed
  }
  const match = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  if (match) {
    return match[1].trim()
  }
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }
  return trimmed
}

export const scanReceipt = async (
  request: ReceiptScanRequest,
): Promise<ReceiptScanResult> => {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) {
    throw new ReceiptScanError('UNAUTHENTICATED', '請先登入')
  }

  const supabaseUrl = config.supabase.url
  const publishableKey = config.supabase.publishableKey
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
    },
  })

  try {
    const response = await ai.models.generateContent({
      model: config.gemini.model,
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
        temperature: 0,
      },
    })
    if (!response.text) {
      throw new ReceiptScanError('UNREADABLE_RECEIPT', 'Gemini 未回傳收據資料')
    }
    const cleanJson = extractJsonFromText(response.text)
    return parseReceiptResult(JSON.parse(cleanJson), request.targetLocale)
  } catch (error) {
    if (error instanceof ReceiptScanError) throw error
    let message = '收據辨識連線失敗，請稍後再試'
    if (error instanceof Error) {
      try {
        const parsed = JSON.parse(error.message)
        message = parsed?.error?.message || parsed?.message || error.message
      } catch {
        message = error.message
      }
    }
    throw new ReceiptScanError('SCAN_FAILED', message)
  }
}
