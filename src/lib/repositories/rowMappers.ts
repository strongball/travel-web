import type { Attraction, Expense, Itinerary, TripDay } from '../../types/database'
import type { ExpenseItem } from '../../types/receipt'
import { normalizeExchangeRates } from '../currencies'
import { canonicalizeImageReference } from '../imageReference'

export type DatabaseRow = Record<string, unknown>

export const asNumber = (value: unknown) => Number(value ?? 0)
export const asText = (value: unknown) => (typeof value === 'string' ? value : '')

const mapItem = (row: DatabaseRow): ExpenseItem => ({
  id: typeof row.id === 'string' ? row.id : undefined,
  position: asNumber(row.position),
  sourceName: asText(row.source_name),
  localizedName: asText(row.localized_name),
  quantity: asNumber(row.quantity),
  unitPrice: row.unit_price == null ? null : asNumber(row.unit_price),
  lineTotal: row.line_total == null ? null : asNumber(row.line_total),
})

export const mapExpense = (row: DatabaseRow): Expense => {
  const rawPaths = Array.isArray(row.receipt_image_paths)
    ? row.receipt_image_paths.filter((path): path is string => typeof path === 'string')
    : []
  const imageUrl = typeof row.image_url === 'string' ? row.image_url : null
  const paths = rawPaths.map(canonicalizeImageReference)
  if (imageUrl && !paths.includes(canonicalizeImageReference(imageUrl))) {
    paths.unshift(canonicalizeImageReference(imageUrl))
  }

  return {
    id: asText(row.id),
    itineraryId: asText(row.itinerary_id),
    attractionId: typeof row.attraction_id === 'string' ? row.attraction_id : null,
    title: asText(row.title),
    amount: asNumber(row.amount),
    date: asText(row.date),
    currency: asText(row.currency) || 'TWD',
    note: asText(row.note),
    imageUrl: imageUrl ? canonicalizeImageReference(imageUrl) : null,
    receiptImagePaths: paths,
    receiptSourceLocale: typeof row.receipt_source_locale === 'string' ? row.receipt_source_locale : null,
    receiptTargetLocale: typeof row.receipt_target_locale === 'string' ? row.receipt_target_locale : null,
    receiptScannedAt: typeof row.receipt_scanned_at === 'string' ? row.receipt_scanned_at : null,
    items: Array.isArray(row.expense_items)
      ? row.expense_items
          .map((item) => mapItem(item as DatabaseRow))
          .sort((a, b) => a.position - b.position)
      : [],
  }
}

const emptyLocation = { latitude: null, longitude: null }

const coordinates = (longitude: unknown, latitude: unknown) => {
  const nextLongitude = Number(longitude)
  const nextLatitude = Number(latitude)
  return Number.isFinite(nextLongitude) && Number.isFinite(nextLatitude)
    ? { longitude: nextLongitude, latitude: nextLatitude }
    : emptyLocation
}

export const parseLocation = (value: unknown): { latitude: number | null; longitude: number | null } => {
  if (Array.isArray(value) && value.length >= 2) return coordinates(value[0], value[1])
  if (value && typeof value === 'object') {
    const record = value as DatabaseRow
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
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length < 42 || hex.length % 2 !== 0) return emptyLocation
  try {
    const bytes = new Uint8Array(hex.match(/.{2}/g)!.map((pair) => Number.parseInt(pair, 16)))
    const view = new DataView(bytes.buffer)
    const littleEndian = view.getUint8(0) === 1
    const geometryType = view.getUint32(1, littleEndian)
    const pointOffset = (geometryType & 0x20000000) !== 0 ? 9 : 5
    return coordinates(
      view.getFloat64(pointOffset, littleEndian),
      view.getFloat64(pointOffset + 8, littleEndian),
    )
  } catch {
    return emptyLocation
  }
}

const mapAttraction = (row: DatabaseRow): Attraction => {
  const location = parseLocation(row.location)
  return {
    id: asText(row.id),
    dayId: asText(row.day_id),
    name: asText(row.name),
    description: asText(row.description),
    startTime: typeof row.start_time === 'string' ? row.start_time : null,
    endTime: typeof row.end_time === 'string' ? row.end_time : null,
    cost: asNumber(row.cost),
    latitude: typeof row.latitude === 'number' ? row.latitude : location.latitude,
    longitude: typeof row.longitude === 'number' ? row.longitude : location.longitude,
    duration: asNumber(row.duration) || 60,
    transportMode: typeof row.transport_mode === 'string' ? row.transport_mode : null,
    travelTime: row.travel_time == null ? null : asNumber(row.travel_time),
    placeId: typeof row.place_id === 'string' ? row.place_id : null,
    locationName: typeof row.location_name === 'string' ? row.location_name : null,
  }
}

const mapDay = (row: DatabaseRow): TripDay => ({
  id: asText(row.id),
  itineraryId: asText(row.itinerary_id),
  date: asText(row.date),
  startTime: typeof row.start_time === 'string' ? row.start_time : null,
  revision: asNumber(row.revision),
  attractions: Array.isArray(row.attractions)
    ? row.attractions.map((entry) => mapAttraction(entry as DatabaseRow)).sort((first, second) => {
        if (!first.startTime && !second.startTime) return 0
        if (!first.startTime) return 1
        if (!second.startTime) return -1
        return first.startTime.localeCompare(second.startTime)
      })
    : [],
})

export const mapItinerary = (row: DatabaseRow): Itinerary => {
  const currency = asText(row.currency) || 'TWD'
  const rawExchangeRates = row.exchange_rates && typeof row.exchange_rates === 'object' && !Array.isArray(row.exchange_rates)
    ? row.exchange_rates as Record<string, unknown>
    : undefined

  return {
    id: asText(row.id),
    title: asText(row.title),
    ownerId: asText(row.owner_id),
    currency,
    startDate: typeof row.start_date === 'string' ? row.start_date : undefined,
    endDate: typeof row.end_date === 'string' ? row.end_date : undefined,
    days: Array.isArray(row.days)
      ? row.days
          .map((entry) => mapDay(entry as DatabaseRow))
          .sort((first, second) => first.date.slice(0, 10).localeCompare(second.date.slice(0, 10)))
      : [],
    exchangeRates: normalizeExchangeRates(currency, rawExchangeRates),
    todoCategories: Array.isArray(row.todo_categories)
      ? row.todo_categories.filter((category): category is string => typeof category === 'string')
      : [],
  }
}
