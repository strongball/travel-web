import type { Expense, ExpenseDraft, Itinerary } from '../types/database'
import type { ExpenseItem } from '../types/receipt'
import {
  canonicalizeImageReference,
  imageBucket,
  storageObjectPath,
  storageReference,
} from './imageReference'
import { supabase } from './supabase'

type Row = Record<string, unknown>

const asNumber = (value: unknown) => Number(value ?? 0)
const asText = (value: unknown) => (typeof value === 'string' ? value : '')

const mapItem = (row: Row): ExpenseItem => ({
  id: typeof row.id === 'string' ? row.id : undefined,
  position: asNumber(row.position),
  sourceName: asText(row.source_name),
  localizedName: asText(row.localized_name),
  quantity: asNumber(row.quantity),
  unitPrice: row.unit_price == null ? null : asNumber(row.unit_price),
  lineTotal: row.line_total == null ? null : asNumber(row.line_total),
})

const mapExpense = (row: Row): Expense => {
  const rawPaths = Array.isArray(row.receipt_image_paths)
    ? row.receipt_image_paths.filter(
        (path): path is string => typeof path === 'string',
      )
    : []
  const imageUrl = typeof row.image_url === 'string' ? row.image_url : null
  const paths = rawPaths.map(canonicalizeImageReference)
  if (imageUrl && !paths.includes(canonicalizeImageReference(imageUrl))) {
    paths.unshift(canonicalizeImageReference(imageUrl))
  }
  const items = Array.isArray(row.expense_items)
    ? row.expense_items
        .map((item) => mapItem(item as Row))
        .sort((a, b) => a.position - b.position)
    : []

  return {
    id: asText(row.id),
    itineraryId: asText(row.itinerary_id),
    attractionId:
      typeof row.attraction_id === 'string' ? row.attraction_id : null,
    title: asText(row.title),
    amount: asNumber(row.amount),
    date: asText(row.date),
    currency: asText(row.currency) || 'TWD',
    note: asText(row.note),
    imageUrl: imageUrl ? canonicalizeImageReference(imageUrl) : null,
    receiptImagePaths: paths,
    receiptSourceLocale:
      typeof row.receipt_source_locale === 'string'
        ? row.receipt_source_locale
        : null,
    receiptTargetLocale:
      typeof row.receipt_target_locale === 'string'
        ? row.receipt_target_locale
        : null,
    receiptScannedAt:
      typeof row.receipt_scanned_at === 'string'
        ? row.receipt_scanned_at
        : null,
    items,
  }
}

export const fetchItineraries = async (): Promise<Itinerary[]> => {
  const { data, error } = await supabase
    .from('itineraries')
    .select('id,title,owner_id,currency')
    .order('start_date', { ascending: false })
  if (error) throw error
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    ownerId: row.owner_id,
    currency: row.currency || 'TWD',
  }))
}

export const fetchExpenses = async (): Promise<Expense[]> => {
  const { data, error } = await supabase
    .from('expenses')
    .select('*,expense_items(*)')
    .order('date', { ascending: false })
  if (error) throw error
  return data.map((row) => mapExpense(row as Row))
}

const extensionFor = (file: File) => {
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

export const uploadReceiptImages = async (
  files: File[],
): Promise<string[]> => {
  const { data } = await supabase.auth.getUser()
  if (!data.user) throw new Error('請先登入')

  const uploaded: string[] = []
  try {
    for (const file of files) {
      const path = `${data.user.id}/${crypto.randomUUID()}.${extensionFor(file)}`
      const { error } = await supabase.storage.from(imageBucket).upload(path, file, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      })
      if (error) throw error
      uploaded.push(path)
    }
    return uploaded.map(storageReference)
  } catch (error) {
    if (uploaded.length > 0) {
      await supabase.storage.from(imageBucket).remove(uploaded)
    }
    throw error
  }
}

export const deleteReceiptImages = async (references: string[]) => {
  const paths = references
    .map(storageObjectPath)
    .filter((path): path is string => Boolean(path))
  if (paths.length === 0) return
  const { error } = await supabase.storage.from(imageBucket).remove(paths)
  if (error) throw error
}

export const signedReceiptUrl = async (reference: string) => {
  const path = storageObjectPath(reference)
  if (!path) return reference
  const { data, error } = await supabase.storage
    .from(imageBucket)
    .createSignedUrl(path, 3600)
  if (error) throw error
  return data.signedUrl
}

export const downloadReceiptFiles = async (
  references: string[],
): Promise<File[]> => {
  const files: File[] = []
  for (const [index, reference] of references.entries()) {
    const path = storageObjectPath(reference)
    if (!path) throw new Error('無法讀取舊版收據圖片，請重新選擇照片')
    const { data, error } = await supabase.storage.from(imageBucket).download(path)
    if (error) throw error
    files.push(
      new File([data], `receipt-${index + 1}`, {
        type: data.type || 'image/jpeg',
      }),
    )
  }
  return files
}

export const saveExpense = async (draft: ExpenseDraft): Promise<void> => {
  if (!draft.itineraryId) throw new Error('請選擇行程')
  const id = draft.id ?? crypto.randomUUID()
  const { error } = await supabase.rpc('save_expense_with_items', {
    p_id: id,
    p_itinerary_id: draft.itineraryId,
    p_title: draft.title.trim(),
    p_amount: draft.amount,
    p_date: new Date(`${draft.date}T12:00:00`).toISOString(),
    p_currency: draft.currency,
    p_note: draft.note.trim() || null,
    p_image_url: draft.receiptImagePaths[0] ?? null,
    p_receipt_image_paths: draft.receiptImagePaths,
    p_attraction_id: draft.attractionId,
    p_receipt_source_locale: draft.receiptSourceLocale,
    p_receipt_target_locale: draft.receiptTargetLocale,
    p_receipt_scanned_at: draft.receiptScannedAt,
    p_items: draft.items.map((item) => ({
      sourceName: item.sourceName,
      localizedName: item.localizedName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
    })),
  })
  if (error) throw error
}
