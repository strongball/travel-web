import type { Attraction, Itinerary, TripDay } from '../../../../types/database'
import { recalculateDayTimes } from '../../../travel/travelWorkspaceUtils'
import { supabase } from '../../../../lib/supabase'
import { geocodeWithGoogle, loadGoogleMapsLibrary } from '../../../travel/googleMaps'
import type { AssistantOperation } from '../../types'

const normalizeTime = (day: TripDay, value: string) =>
  value.includes('T') ? value : `${day.date.slice(0, 10)}T${value}:00`

export function applyItineraryOperations(
  itinerary: Itinerary,
  operations: AssistantOperation[],
): TripDay[] {
  let days = (itinerary.days ?? []).map((day) => ({
    ...day,
    attractions: day.attractions.map((attraction) => ({ ...attraction })),
  }))
  const originalDayByAttraction = new Map(
    days.flatMap((day) => day.attractions.map((attraction) => [attraction.id, day.id] as const)),
  )

  const findAttraction = (id: string) => {
    for (const day of days) {
      const index = day.attractions.findIndex((item) => item.id === id)
      if (index >= 0) return { day, index, attraction: day.attractions[index] }
    }
    throw new Error(`找不到景點 ${id}`)
  }

  for (const operation of operations) {
    if (operation.type === 'set_day_start_time') {
      const day = days.find((item) => item.id === operation.dayId)
      if (!day) throw new Error('找不到指定日期')
      day.startTime = normalizeTime(day, operation.startTime)
      continue
    }
    if (operation.type === 'add_attraction') {
      const day = days.find((item) => item.id === operation.dayId)
      if (!day) throw new Error('找不到指定日期')
      if (!operation.attraction.name.trim()) throw new Error('景點名稱不可空白')
      const attraction: Attraction = {
        ...operation.attraction,
        dayId: day.id,
        name: operation.attraction.name.trim(),
        startTime: null,
        endTime: null,
      }
      const index = Math.max(0, Math.min(operation.index ?? day.attractions.length, day.attractions.length))
      day.attractions.splice(index, 0, attraction)
      continue
    }
    if (operation.type === 'update_attraction') {
      const target = findAttraction(operation.attractionId)
      target.day.attractions[target.index] = {
        ...target.attraction,
        ...operation.changes,
        id: target.attraction.id,
        dayId: target.day.id,
      }
      continue
    }
    if (operation.type === 'remove_attraction') {
      const target = findAttraction(operation.attractionId)
      target.day.attractions.splice(target.index, 1)
      continue
    }
    if (operation.type === 'move_attraction') {
      const target = findAttraction(operation.attractionId)
      const destination = days.find((item) => item.id === operation.targetDayId)
      if (!destination) throw new Error('找不到移動目的日期')
      target.day.attractions.splice(target.index, 1)
      const index = Math.max(0, Math.min(operation.index, destination.attractions.length))
      destination.attractions.splice(index, 0, { ...target.attraction, dayId: destination.id, travelTime: null })
      continue
    }
    if (operation.type === 'reorder_attractions') {
      const day = days.find((item) => item.id === operation.dayId)
      if (!day) throw new Error('找不到指定日期')
      if (new Set(operation.attractionIds).size !== day.attractions.length ||
        operation.attractionIds.some((id) => !day.attractions.some((item) => item.id === id))) {
        throw new Error('景點排序資料不完整')
      }
      const byId = new Map(day.attractions.map((item) => [item.id, item]))
      day.attractions = operation.attractionIds.map((id) => byId.get(id)!)
    }
  }

  const affected = new Set<string>()
  for (const operation of operations) {
    if ('dayId' in operation) affected.add(operation.dayId)
    if (operation.type === 'move_attraction') affected.add(operation.targetDayId)
    if ('attractionId' in operation) {
      const originalDayId = originalDayByAttraction.get(operation.attractionId)
      if (originalDayId) affected.add(originalDayId)
    }
  }
  days = days.map((day) => affected.has(day.id) ? recalculateDayTimes(day, day.attractions) : day)
  return days
}

export function changedDays(before: TripDay[], after: TripDay[]) {
  const beforeById = new Map(before.map((day) => [day.id, day]))
  return after.filter((day) => JSON.stringify(beforeById.get(day.id)) !== JSON.stringify(day))
}

type ProposalSnapshots = {
  beforeDays: TripDay[]
  afterDays: TripDay[]
}

const locationChanged = (before: Attraction | undefined, after: Attraction) =>
  !before || before.name !== after.name || before.locationName !== after.locationName

export const placeEnrichmentCandidates = ({ beforeDays, afterDays }: ProposalSnapshots) => {
  const beforeById = new Map(beforeDays.flatMap((day) => day.attractions).map((item) => [item.id, item]))
  return afterDays.flatMap((day) => day.attractions).filter((attraction) =>
    locationChanged(beforeById.get(attraction.id), attraction) &&
    (!attraction.placeId || attraction.latitude === null || attraction.longitude === null))
}

export async function enrichAppliedProposalPlaces(snapshots: ProposalSnapshots) {
  const candidates = placeEnrichmentCandidates(snapshots)
  if (candidates.length === 0) return { enriched: 0, failed: 0 }

  let enriched = 0
  let failed = 0
  try {
    const { Geocoder } = await loadGoogleMapsLibrary('geocoding')
    for (const attraction of candidates) {
      try {
        const request: google.maps.GeocoderRequest = attraction.placeId
          ? { placeId: attraction.placeId }
          : { address: [attraction.name, attraction.locationName].filter(Boolean).join(', ') }
        const response = await geocodeWithGoogle(Geocoder, request)
        const match = response.results[0]
        const point = match?.geometry.location
        if (!match || !point) {
          failed += 1
          continue
        }
        const latitude = point.lat()
        const longitude = point.lng()
        const { error } = await supabase.from('attractions').update({
          location: `POINT(${longitude} ${latitude})`,
          place_id: match.place_id || attraction.placeId,
          location_name: attraction.locationName || match.formatted_address || attraction.name,
        }).eq('id', attraction.id)
        if (error) throw error
        enriched += 1
      } catch {
        failed += 1
      }
    }
  } catch {
    failed = candidates.length
  }
  return { enriched, failed }
}
