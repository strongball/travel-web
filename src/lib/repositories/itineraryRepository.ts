import type { Itinerary } from '../../types/database'
import { normalizeExchangeRates } from '../currencies'
import { supabase } from '../supabase'
import { mapItinerary, type DatabaseRow } from './rowMappers'

export const fetchItineraries = async (): Promise<Itinerary[]> => {
  const { data, error } = await supabase
    .from('itineraries')
    .select('*,days(*,attractions(*))')
    .order('start_date', { ascending: false })
  if (error) throw error
  return data.map((row) => mapItinerary(row as DatabaseRow))
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
    exchange_rates: normalizeExchangeRates(itinerary.currency, itinerary.exchangeRates),
    todo_categories: itinerary.todoCategories ?? [],
  })
  if (error) throw error

  const { data: existingDays, error: existingDaysError } = await supabase
    .from('days').select('id').eq('itinerary_id', itinerary.id)
  if (existingDaysError) throw existingDaysError
  const currentDayIds = new Set(days.map((day) => day.id))
  const removedDayIds = existingDays.map((row) => row.id).filter((id) => !currentDayIds.has(id))
  if (removedDayIds.length > 0) {
    const { error: deleteDaysError } = await supabase.from('days').delete().in('id', removedDayIds)
    if (deleteDaysError) throw deleteDaysError
  }

  await Promise.all(days.map(async (day) => {
    const [{ data: existingAttractions, error: attractionsError }, dayResult] = await Promise.all([
      supabase.from('attractions').select('id').eq('day_id', day.id),
      supabase.from('days').upsert({
        id: day.id,
        itinerary_id: itinerary.id,
        date: day.date,
        start_time: day.startTime,
      }),
    ])
    if (attractionsError) throw attractionsError
    if (dayResult.error) throw dayResult.error

    const currentIds = new Set(day.attractions.map((item) => item.id))
    const removedIds = existingAttractions.map((row) => row.id).filter((id) => !currentIds.has(id))
    const rows = day.attractions.map((attraction) => ({
      id: attraction.id,
      day_id: day.id,
      name: attraction.name.trim(),
      description: attraction.description.trim() || null,
      start_time: attraction.startTime,
      end_time: attraction.endTime,
      cost: attraction.cost,
      location: attraction.longitude !== null && attraction.latitude !== null
        ? `POINT(${attraction.longitude} ${attraction.latitude})`
        : null,
      duration: attraction.duration,
      transport_mode: attraction.transportMode,
      travel_time: attraction.travelTime,
      place_id: attraction.placeId,
      location_name: attraction.locationName,
    }))
    const operations: PromiseLike<unknown>[] = []
    if (removedIds.length > 0) {
      operations.push(supabase.from('attractions').delete().in('id', removedIds).then(({ error }) => {
        if (error) throw error
      }))
    }
    if (rows.length > 0) {
      operations.push(supabase.from('attractions').upsert(rows).then(({ error }) => {
        if (error) throw error
      }))
    }
    await Promise.all(operations)
  }))
}

export const deleteItinerary = async (id: string): Promise<void> => {
  const { error } = await supabase.from('itineraries').delete().eq('id', id)
  if (error) throw error
}
