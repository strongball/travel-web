import type { Session } from '@supabase/supabase-js'
import { atom } from 'jotai'

import type { Expense, ExpenseDraft, Itinerary } from '../types/database'
import type { ReceiptScanResult } from '../types/receipt'

export const sessionAtom = atom<Session | null>(null)
export const authReadyAtom = atom(false)
export const itinerariesAtom = atom<Itinerary[]>([])
export const expensesAtom = atom<Expense[]>([])
export const expenseDraftAtom = atom<ExpenseDraft | null>(null)
export const receiptResultAtom = atom<ReceiptScanResult | null>(null)
export const appLoadingAtom = atom(false)
export const appErrorAtom = atom<string | null>(null)
