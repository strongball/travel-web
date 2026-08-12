import type { ExpenseItem } from '../../types/receipt'

export type EditableExpenseItem = ExpenseItem & { clientKey: string }

export function toEditableItems(items: readonly ExpenseItem[]): EditableExpenseItem[] {
  return items.map((item, index) => ({
    ...item,
    position: index,
    clientKey: item.id ?? `${index}-${item.sourceName}-${createClientKey()}`,
  }))
}

export function normalizePositions(items: readonly EditableExpenseItem[]): EditableExpenseItem[] {
  return items.map((item, position) => ({ ...item, position }))
}

export function parseNullableNumber(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function roundAmount(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000
}

export function formatReceiptAmount(value: number | null, currency: string): string {
  if (value === null) return '—'
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 4 }).format(value)
  } catch {
    return `${currency} ${value.toFixed(2)}`
  }
}

export function createClientKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`
}
