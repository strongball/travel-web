import type { Expense, ExpenseDraft } from '../../types/database'
import { supabase } from '../supabase'
import { mapExpense, type DatabaseRow } from './rowMappers'

export const fetchExpenses = async (): Promise<Expense[]> => {
  const { data, error } = await supabase
    .from('expenses').select('*,expense_items(*)').order('date', { ascending: false })
  if (error) throw error
  return data.map((row) => mapExpense(row as DatabaseRow))
}

export const saveExpense = async (draft: ExpenseDraft): Promise<void> => {
  if (!draft.itineraryId) throw new Error('請選擇行程')
  const { error } = await supabase.rpc('save_expense_with_items', {
    p_id: draft.id ?? crypto.randomUUID(),
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

export const deleteExpense = async (id: string): Promise<void> => {
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
}
