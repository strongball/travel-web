import type { Attraction, TripDay } from '../../types/database'
import { supabase } from '../../lib/supabase'
import { geocodeWithGoogle, loadGoogleMapsLibrary } from '../travel/googleMaps'

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

/**
 * Best-effort enrichment runs only after the atomic proposal RPC succeeds.
 * A Google lookup failure never rolls back an already-applied itinerary.
 */
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
