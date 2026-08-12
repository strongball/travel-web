import type {
  Attraction,
  Expense,
  ExpenseDraft,
  Itinerary,
  TodoItem,
  TripDay,
} from '../types/database'
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
    .select('*,days(*,attractions(*))')
    .order('start_date', { ascending: false })
  if (error) throw error
  return data.map((row) => mapItinerary(row as Row))
}

const emptyLocation = { latitude: null, longitude: null }

const coordinates = (longitude: unknown, latitude: unknown) => {
  const nextLongitude = Number(longitude)
  const nextLatitude = Number(latitude)
  return Number.isFinite(nextLongitude) && Number.isFinite(nextLatitude)
    ? { longitude: nextLongitude, latitude: nextLatitude }
    : emptyLocation
}

const parseLocation = (value: unknown): { latitude: number | null; longitude: number | null } => {
  if (Array.isArray(value) && value.length >= 2) {
    return coordinates(value[0], value[1])
  }

  if (value && typeof value === 'object') {
    const record = value as Row
    if (Array.isArray(record.coordinates) && record.coordinates.length >= 2) {
      return coordinates(record.coordinates[0], record.coordinates[1])
    }
    if ('longitude' in record || 'latitude' in record || 'lng' in record || 'lat' in record) {
      return coordinates(record.longitude ?? record.lng, record.latitude ?? record.lat)
    }
    return emptyLocation
  }

  if (typeof value !== 'string') return emptyLocation
  const text = value.trim()
  const wktMatch = text.match(/POINT(?:\s+Z)?\s*\(([-\d.]+)\s+([-\d.]+)/i)
  if (wktMatch) return coordinates(wktMatch[1], wktMatch[2])

  if (/^\{/.test(text)) {
    try {
      return parseLocation(JSON.parse(text))
    } catch {
      return emptyLocation
    }
  }

  const hex = text.replace(/^0x/i, '')
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 42 || hex.length % 2 !== 0) {
    return emptyLocation
  }
  try {
    const bytes = new Uint8Array(hex.match(/.{2}/g)!.map((pair) => Number.parseInt(pair, 16)))
    const view = new DataView(bytes.buffer)
    const littleEndian = view.getUint8(0) === 1
    const geometryType = view.getUint32(1, littleEndian)
    const hasSrid = (geometryType & 0x20000000) !== 0
    const pointOffset = hasSrid ? 9 : 5
    return coordinates(
      view.getFloat64(pointOffset, littleEndian),
      view.getFloat64(pointOffset + 8, littleEndian),
    )
  } catch {
    return emptyLocation
  }
}

const mapAttraction = (row: Row): Attraction => {
  const location = parseLocation(row.location)
  return {
    id: asText(row.id),
    dayId: asText(row.day_id),
    name: asText(row.name),
    description: asText(row.description),
    startTime: typeof row.start_time === 'string' ? row.start_time : null,
    endTime: typeof row.end_time === 'string' ? row.end_time : null,
    cost: asNumber(row.cost),
    latitude:
      typeof row.latitude === 'number' ? row.latitude : location.latitude,
    longitude:
      typeof row.longitude === 'number' ? row.longitude : location.longitude,
    duration: asNumber(row.duration) || 60,
    transportMode:
      typeof row.transport_mode === 'string' ? row.transport_mode : null,
    travelTime:
      row.travel_time == null ? null : asNumber(row.travel_time),
    placeId: typeof row.place_id === 'string' ? row.place_id : null,
    locationName:
      typeof row.location_name === 'string' ? row.location_name : null,
  }
}

const mapDay = (row: Row): TripDay => ({
  id: asText(row.id),
  itineraryId: asText(row.itinerary_id),
  date: asText(row.date),
  startTime: typeof row.start_time === 'string' ? row.start_time : null,
  attractions: Array.isArray(row.attractions)
    ? row.attractions
        .map((entry) => mapAttraction(entry as Row))
        .sort((first, second) => {
          if (!first.startTime && !second.startTime) return 0
          if (!first.startTime) return 1
          if (!second.startTime) return -1
          return first.startTime.localeCompare(second.startTime)
        })
    : [],
})

const mapItinerary = (row: Row): Itinerary => ({
  id: asText(row.id),
  title: asText(row.title),
  ownerId: asText(row.owner_id),
  currency: asText(row.currency) || 'TWD',
  startDate: typeof row.start_date === 'string' ? row.start_date : undefined,
  endDate: typeof row.end_date === 'string' ? row.end_date : undefined,
  days: Array.isArray(row.days)
    ? row.days
        .map((entry) => mapDay(entry as Row))
        .sort((first, second) => first.date.slice(0, 10).localeCompare(second.date.slice(0, 10)))
    : [],
  exchangeRates:
    row.exchange_rates && typeof row.exchange_rates === 'object'
      ? Object.fromEntries(
          Object.entries(row.exchange_rates as Record<string, unknown>).map(
            ([key, value]) => [key, asNumber(value)],
          ),
        )
      : { [asText(row.currency) || 'TWD']: 1 },
  todoCategories: Array.isArray(row.todo_categories)
    ? row.todo_categories.filter(
        (category): category is string => typeof category === 'string',
      )
    : [],
})

export const fetchTodos = async (itineraryId?: string): Promise<TodoItem[]> => {
  let query = supabase
    .from('todo_items')
    .select('*')
    .order('category', { ascending: true })
    .order('content', { ascending: true })
  if (itineraryId) query = query.eq('itinerary_id', itineraryId)
  const { data, error } = await query
  if (error) throw error
  return data.map((row) => ({
    id: asText(row.id),
    itineraryId: asText(row.itinerary_id),
    title: asText(row.content) || asText(row.title),
    isCompleted: Boolean(row.is_checked ?? row.is_completed),
    category: asText(row.category) || '其他',
    imagePath: typeof row.image_path === 'string' ? row.image_path : null,
    images: Array.isArray(row.images)
      ? row.images.filter((path: unknown): path is string => typeof path === 'string')
      : [],
  }))
}

export const saveItinerary = async (itinerary: Itinerary): Promise<void> => {
  const { data: userData } = await supabase.auth.getUser()
  if (!userData.user) throw new Error('請先登入')
  const days = itinerary.days ?? []
  const startDate = itinerary.startDate ?? days[0]?.date ?? new Date().toISOString()
  const endDate = itinerary.endDate ?? days.at(-1)?.date ?? startDate

  const { error } = await supabase.from('itineraries').upsert({
    id: itinerary.id,
    owner_id: itinerary.ownerId || userData.user.id,
    title: itinerary.title.trim(),
    start_date: startDate,
    end_date: endDate,
    currency: itinerary.currency,
    exchange_rates: itinerary.exchangeRates ?? { [itinerary.currency]: 1 },
    todo_categories: itinerary.todoCategories ?? [],
  })
  if (error) throw error

  const { data: existingDays, error: existingDaysError } = await supabase
    .from('days')
    .select('id')
    .eq('itinerary_id', itinerary.id)
  if (existingDaysError) throw existingDaysError
  const currentDayIds = new Set(days.map((day) => day.id))
  const removedDayIds = existingDays
    .map((row) => row.id)
    .filter((id) => !currentDayIds.has(id))
  if (removedDayIds.length > 0) {
    const { error: deleteDaysError } = await supabase
      .from('days')
      .delete()
      .in('id', removedDayIds)
    if (deleteDaysError) throw deleteDaysError
  }

  for (const day of days) {
    const { data: existingAttractions, error: existingAttractionsError } =
      await supabase
        .from('attractions')
        .select('id')
        .eq('day_id', day.id)
    if (existingAttractionsError) throw existingAttractionsError
    const currentAttractionIds = new Set(day.attractions.map((item) => item.id))
    const removedAttractionIds = existingAttractions
      .map((row) => row.id)
      .filter((id) => !currentAttractionIds.has(id))
    if (removedAttractionIds.length > 0) {
      const { error: deleteAttractionsError } = await supabase
        .from('attractions')
        .delete()
        .in('id', removedAttractionIds)
      if (deleteAttractionsError) throw deleteAttractionsError
    }

    const dayResult = await supabase.from('days').upsert({
      id: day.id,
      itinerary_id: itinerary.id,
      date: day.date,
      start_time: day.startTime,
    })
    if (dayResult.error) throw dayResult.error

    for (const attraction of day.attractions) {
      const attractionResult = await supabase.from('attractions').upsert({
        id: attraction.id,
        day_id: day.id,
        name: attraction.name.trim(),
        description: attraction.description.trim() || null,
        start_time: attraction.startTime,
        end_time: attraction.endTime,
        cost: attraction.cost,
        location:
          attraction.longitude !== null && attraction.latitude !== null
            ? `POINT(${attraction.longitude} ${attraction.latitude})`
            : null,
        duration: attraction.duration,
        transport_mode: attraction.transportMode,
        travel_time: attraction.travelTime,
        place_id: attraction.placeId,
        location_name: attraction.locationName,
      })
      if (attractionResult.error) throw attractionResult.error
    }
  }
}

export const saveTodo = async (todo: TodoItem): Promise<void> => {
  const { error } = await supabase.from('todo_items').upsert({
    id: todo.id,
    itinerary_id: todo.itineraryId,
    content: todo.title.trim(),
    is_checked: todo.isCompleted,
    category: todo.category,
    image_path: todo.imagePath,
    images: todo.images,
  })
  if (error) throw error
}

export const deleteTodo = async (id: string): Promise<void> => {
  const { error } = await supabase.from('todo_items').delete().eq('id', id)
  if (error) throw error
}

export const deleteItinerary = async (id: string): Promise<void> => {
  const { error } = await supabase.from('itineraries').delete().eq('id', id)
  if (error) throw error
}

export const deleteExpense = async (id: string): Promise<void> => {
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
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
