export type ReceiptImageInput = {
  mimeType: 'image/jpeg'
  data: string
}

export type ExpenseItem = {
  id?: string
  position: number
  sourceName: string
  localizedName: string
  quantity: number
  unitPrice: number | null
  lineTotal: number | null
}

export type ReceiptScanResult = {
  schemaVersion: 1
  sourceLocale: string
  targetLocale: string
  items: ExpenseItem[]
  receiptTotal: number | null
  itemsTotal: number
  difference: number | null
}

export type ReceiptScanRequest = {
  targetLocale: string
  currencyHint: string
  images: ReceiptImageInput[]
}
