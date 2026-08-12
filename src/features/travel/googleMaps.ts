import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

let configured = false
export const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined

export type GoogleMapsLibraryName = 'maps' | 'marker' | 'places' | 'geocoding' | 'routes'
type GoogleMapsLibraryMap = {
  maps: google.maps.MapsLibrary
  marker: google.maps.MarkerLibrary
  places: google.maps.PlacesLibrary
  geocoding: google.maps.GeocodingLibrary
  routes: google.maps.RoutesLibrary
}

function configureGoogleMaps() {
  if (!googleMapsApiKey) {
    throw new Error('尚未設定 VITE_GOOGLE_MAPS_API_KEY')
  }

  if (!configured) {
    setOptions({
      key: googleMapsApiKey,
      language: typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'zh-TW',
      v: 'weekly',
    })
    configured = true
  }
}

export async function loadGoogleMapsLibrary<T extends GoogleMapsLibraryName>(name: T): Promise<GoogleMapsLibraryMap[T]> {
  configureGoogleMaps()
  return importLibrary(name) as Promise<GoogleMapsLibraryMap[T]>
}

export async function loadGoogleMaps() {
  configureGoogleMaps()

  const [maps, marker, places, geocoding, routes] = await Promise.all([
    loadGoogleMapsLibrary('maps'),
    loadGoogleMapsLibrary('marker'),
    loadGoogleMapsLibrary('places'),
    loadGoogleMapsLibrary('geocoding'),
    loadGoogleMapsLibrary('routes'),
  ])

  return { ...maps, ...marker, ...places, ...geocoding, ...routes }
}

export type GoogleMapLibraries = Awaited<ReturnType<typeof loadGoogleMaps>>

/**
 * Supports both the current Promise Geocoder API and older Maps JS builds
 * that only complete the callback. Some browser-loaded versions return
 * undefined when no callback is supplied.
 */
export function geocodeWithGoogle(
  Geocoder: GoogleMapLibraries['Geocoder'] | google.maps.Geocoder,
  request: google.maps.GeocoderRequest,
): Promise<google.maps.GeocoderResponse> {
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      callback()
    }
    const callback = (results: google.maps.GeocoderResult[] | null, status: google.maps.GeocoderStatusString) => {
      if (status === 'OK' || status === 'ZERO_RESULTS') {
        finish(() => resolve({ results: results ?? [] }))
      } else {
        finish(() => reject(new Error(`Geocoder 狀態：${status}`)))
      }
    }
    try {
      const geocoder = typeof Geocoder === 'function' ? new Geocoder() : Geocoder
      const response = geocoder.geocode(request, callback)
      if (response && typeof response.then === 'function') {
        response.then((value) => finish(() => resolve(value))).catch((error) => finish(() => reject(error)))
      }
    } catch (error) {
      finish(() => reject(error))
    }
  })
}

export type GoogleRouteEstimate = {
  distanceMeters: number
  durationMinutes: number
}

export type GoogleRoutePoint = {
  lat?: number | null
  lng?: number | null
  placeId?: string | null
  label?: string | null
}

type GoogleDirectionsPoint = google.maps.LatLngLiteral | string

const directionsPointValue = (point: GoogleDirectionsPoint) =>
  typeof point === 'string' ? point : `${point.lat},${point.lng}`

export const googleDirectionsUrl = (
  origin: GoogleDirectionsPoint | null,
  destination: GoogleDirectionsPoint,
  mode: string | null,
  originPlaceId?: string | null,
  destinationPlaceId?: string | null,
) => {
  const travelmode = mode === 'walking' || mode === 'transit' || mode === 'bicycling' ? mode : 'driving'
  const params = new URLSearchParams({
    api: '1',
    destination: directionsPointValue(destination),
    travelmode,
    dir_action: 'navigate',
  })
  if (origin) params.set('origin', directionsPointValue(origin))
  if (originPlaceId) params.set('origin_place_id', originPlaceId)
  if (destinationPlaceId) params.set('destination_place_id', destinationPlaceId)
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export const googlePlaceUrl = (destination: GoogleDirectionsPoint, placeId?: string | null) => {
  const params = new URLSearchParams({ api: '1', query: directionsPointValue(destination) })
  if (placeId) params.set('query_place_id', placeId)
  return `https://www.google.com/maps/search/?${params.toString()}`
}

const googleTravelMode = (mode: string | null): google.maps.TravelModeString => {
  switch (mode) {
    case 'walking': return 'WALKING'
    case 'transit': return 'TRANSIT'
    case 'bicycling': return 'BICYCLING'
    default: return 'DRIVING'
  }
}

const getPointRepresentations = (
  point: GoogleRoutePoint,
): Array<google.maps.LatLngLiteral | google.maps.Place | string> => {
  const reps: Array<google.maps.LatLngLiteral | google.maps.Place | string> = []
  if (point.placeId) reps.push({ placeId: point.placeId })
  if (typeof point.lat === 'number' && typeof point.lng === 'number') reps.push({ lat: point.lat, lng: point.lng })
  if (point.label?.trim()) reps.push(point.label.trim())
  return reps
}

const isStepTransit = (s: google.maps.DirectionsStep) => {
  const travelMode = String(s.travel_mode || '').toUpperCase()
  return (
    travelMode === 'TRANSIT' ||
    Boolean((s as unknown as { transit?: unknown }).transit) ||
    Boolean((s as unknown as { transit_details?: unknown }).transit_details)
  )
}

const estimateWithDirectionsService = async (
  DirectionsService: GoogleMapLibraries['DirectionsService'],
  origin: GoogleRoutePoint,
  destination: GoogleRoutePoint,
  mode: string | null,
): Promise<GoogleRouteEstimate> => {
  const service = new DirectionsService()
  const originReps = getPointRepresentations(origin)
  const destReps = getPointRepresentations(destination)

  if (originReps.length === 0 || destReps.length === 0) {
    throw new Error('景點缺少有效的座標、名稱或 Place ID')
  }

  let lastError: Error | null = null

  for (const originPt of originReps) {
    for (const destPt of destReps) {
      try {
        const response = await new Promise<google.maps.DirectionsResult>((resolve, reject) => {
          service.route(
            {
              origin: originPt,
              destination: destPt,
              travelMode: googleTravelMode(mode),
              transitOptions: mode === 'transit'
                ? { departureTime: new Date(), routingPreference: 'LESS_WALKING' as google.maps.TransitRoutePreference }
                : undefined,
            },
            (result, status) => (status === 'OK' && result ? resolve(result) : reject(new Error(`Directions API 狀態 [${status}]`))),
          )
        })

        const routes = response.routes ?? []
        const transitRoutes = mode === 'transit' ? routes.filter((r) => r.legs?.[0]?.steps?.some(isStepTransit)) : routes
        if (mode === 'transit' && transitRoutes.length === 0) continue

        const bestRoute = [...transitRoutes].sort(
          (a, b) => (a.legs?.[0]?.duration?.value ?? Infinity) - (b.legs?.[0]?.duration?.value ?? Infinity),
        )[0]

        const leg = bestRoute?.legs?.[0]
        if (typeof leg?.distance?.value === 'number' && typeof leg?.duration?.value === 'number') {
          return {
            distanceMeters: leg.distance.value,
            durationMinutes: Math.max(1, Math.round(leg.duration.value / 60)),
          }
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
      }
    }
  }

  throw lastError ?? new Error('Google Maps 找不到可用路線')
}

function estimateFallbackRoute(
  origin: GoogleRoutePoint,
  destination: GoogleRoutePoint,
  mode: string | null,
): GoogleRouteEstimate | null {
  if (
    typeof origin.lat !== 'number' ||
    typeof origin.lng !== 'number' ||
    typeof destination.lat !== 'number' ||
    typeof destination.lng !== 'number'
  ) {
    return null
  }
  const R = 6371000
  const dLat = ((destination.lat - origin.lat) * Math.PI) / 180
  const dLng = ((destination.lng - origin.lng) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((origin.lat * Math.PI) / 180) *
      Math.cos((destination.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)

  const distanceMeters = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.3)
  const speedMetersPerMin = mode === 'walking' ? 80 : mode === 'bicycling' ? 250 : mode === 'transit' ? 416 : 333
  const addedWaitMinutes = mode === 'transit' ? 5 : 0

  return {
    distanceMeters,
    durationMinutes: Math.max(1, Math.round(distanceMeters / speedMetersPerMin + addedWaitMinutes)),
  }
}

async function ensurePointCoords(
  point: GoogleRoutePoint,
  Place: GoogleMapLibraries['Place'],
  Geocoder: GoogleMapLibraries['Geocoder'],
): Promise<GoogleRoutePoint> {
  if (typeof point.lat === 'number' && typeof point.lng === 'number') return point
  if (!point.placeId) return point

  try {
    const place = new Place({ id: point.placeId })
    await place.fetchFields({ fields: ['location'] })
    if (place.location) return { ...point, lat: place.location.lat(), lng: place.location.lng() }
  } catch {
    try {
      const res = await geocodeWithGoogle(Geocoder, { placeId: point.placeId })
      const loc = res.results?.[0]?.geometry?.location
      if (loc) return { ...point, lat: loc.lat(), lng: loc.lng() }
    } catch {
      // ignore
    }
  }
  return point
}

export async function estimateGoogleRoute(
  origin: GoogleRoutePoint,
  destination: GoogleRoutePoint,
  mode: string | null,
): Promise<GoogleRouteEstimate> {
  const { Route, Place, DirectionsService, Geocoder } = await loadGoogleMaps()

  const [enrichedOrigin, enrichedDestination] = await Promise.all([
    ensurePointCoords(origin, Place, Geocoder),
    ensurePointCoords(destination, Place, Geocoder),
  ])

  if (mode === 'transit') {
    try {
      return await estimateWithDirectionsService(DirectionsService, enrichedOrigin, enrichedDestination, mode)
    } catch (error) {
      const fallback = estimateFallbackRoute(enrichedOrigin, enrichedDestination, mode)
      if (fallback) return fallback
      throw error instanceof Error ? error : new Error('Google Maps 大眾運輸路線估算失敗')
    }
  }

  try {
    const resolveRoutePoint = (point: GoogleRoutePoint) =>
      point.placeId ? new Place({ id: point.placeId }) : (point.lat != null && point.lng != null ? { lat: point.lat, lng: point.lng } : null)

    const response = await Route.computeRoutes({
      origin: resolveRoutePoint(enrichedOrigin)!,
      destination: resolveRoutePoint(enrichedDestination)!,
      travelMode: googleTravelMode(mode),
      fields: ['distanceMeters', 'durationMillis'],
      routingPreference: mode === 'driving' ? 'TRAFFIC_AWARE' : undefined,
      language: typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'zh-TW',
    })
    const route = response.routes?.[0]
    if (typeof route?.distanceMeters === 'number' && typeof route?.durationMillis === 'number') {
      return {
        distanceMeters: route.distanceMeters,
        durationMinutes: Math.max(1, Math.round(route.durationMillis / 60000)),
      }
    }
    throw new Error('Google Maps 找不到可用路線')
  } catch {
    try {
      return await estimateWithDirectionsService(DirectionsService, enrichedOrigin, enrichedDestination, mode)
    } catch {
      const fallback = estimateFallbackRoute(enrichedOrigin, enrichedDestination, mode)
      if (fallback) return fallback
      throw new Error('Google Maps 路線估算失敗')
    }
  }
}
