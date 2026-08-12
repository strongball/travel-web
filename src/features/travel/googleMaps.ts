import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

let configured = false

export const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined

export async function loadGoogleMaps() {
  if (!googleMapsApiKey) {
    throw new Error('尚未設定 VITE_GOOGLE_MAPS_API_KEY')
  }

  if (!configured) {
    setOptions({
      key: googleMapsApiKey,
      language: 'zh-TW',
      region: 'TW',
      v: 'weekly',
    })
    configured = true
  }

  const [maps, marker, places, geocoding, routes] = await Promise.all([
    importLibrary('maps'),
    importLibrary('marker'),
    importLibrary('places'),
    importLibrary('geocoding'),
    importLibrary('routes'),
  ])

  return { ...maps, ...marker, ...places, ...geocoding, ...routes }
}

export type GoogleMapLibraries = Awaited<ReturnType<typeof loadGoogleMaps>>

export type GoogleRouteEstimate = {
  distanceMeters: number
  durationMinutes: number
}

export type GoogleRoutePoint =
  | google.maps.LatLngLiteral
  | { placeId: string }

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
  const travelmode = mode === 'walking' || mode === 'transit' || mode === 'bicycling'
    ? mode
    : 'driving'
  const params = new URLSearchParams({ api: '1', destination: directionsPointValue(destination), travelmode, dir_action: 'navigate' })
  if (origin) params.set('origin', directionsPointValue(origin))
  if (originPlaceId) params.set('origin_place_id', originPlaceId)
  if (destinationPlaceId) params.set('destination_place_id', destinationPlaceId)
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export const googlePlaceUrl = (
  destination: GoogleDirectionsPoint,
  placeId?: string | null,
) => {
  const params = new URLSearchParams({
    api: '1',
    query: directionsPointValue(destination),
  })
  if (placeId) params.set('query_place_id', placeId)
  return `https://www.google.com/maps/search/?${params.toString()}`
}

const googleTravelMode = (mode: string | null): google.maps.TravelModeString => {
  switch (mode) {
    case 'walking':
      return 'WALKING'
    case 'transit':
      return 'TRANSIT'
    case 'bicycling':
      return 'BICYCLING'
    default:
      return 'DRIVING'
  }
}

const transitDepartureTime = () => new Date(Date.now() + 60_000)

const directionsPoint = (point: GoogleRoutePoint): google.maps.LatLngLiteral | google.maps.Place =>
  'placeId' in point ? { placeId: point.placeId } : point

const estimateWithDirectionsService = async (
  DirectionsService: GoogleMapLibraries['DirectionsService'],
  origin: GoogleRoutePoint,
  destination: GoogleRoutePoint,
  mode: string | null,
): Promise<GoogleRouteEstimate> => {
  const response = await new DirectionsService().route({
    origin: directionsPoint(origin),
    destination: directionsPoint(destination),
    travelMode: googleTravelMode(mode),
    transitOptions: mode === 'transit'
      ? { departureTime: transitDepartureTime() }
      : undefined,
    region: 'TW',
  })
  const leg = response.routes?.[0]?.legs?.[0]
  const distanceMeters = leg?.distance?.value
  const durationSeconds = leg?.duration?.value
  if (typeof distanceMeters !== 'number' || typeof durationSeconds !== 'number') {
    throw new Error('Google Maps 找不到可用路線')
  }
  return {
    distanceMeters,
    durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
  }
}

export async function estimateGoogleRoute(
  origin: GoogleRoutePoint,
  destination: GoogleRoutePoint,
  mode: string | null,
): Promise<GoogleRouteEstimate> {
  const { Route, Place, DirectionsService } = await loadGoogleMaps()
  try {
    const resolveRoutePoint = (point: GoogleRoutePoint) =>
      'placeId' in point ? new Place({ id: point.placeId }) : point
    const response = await Route.computeRoutes({
      origin: resolveRoutePoint(origin),
      destination: resolveRoutePoint(destination),
      travelMode: googleTravelMode(mode),
      fields: ['distanceMeters', 'durationMillis', 'path', 'viewport'],
      routingPreference: mode === 'driving' ? 'TRAFFIC_AWARE' : undefined,
      departureTime: mode === 'transit' ? transitDepartureTime() : undefined,
      language: 'zh-TW',
      region: 'TW',
    })
    const route = response.routes?.[0]
    if (typeof route?.distanceMeters !== 'number' || typeof route.durationMillis !== 'number') {
      throw new Error('Google Maps 找不到可用路線')
    }
    return {
      distanceMeters: route.distanceMeters,
      durationMinutes: Math.max(1, Math.round(route.durationMillis / 60000)),
    }
  } catch (error) {
    if (mode !== 'transit') throw error

    try {
      return await estimateWithDirectionsService(DirectionsService, origin, destination, mode)
    } catch {
      throw new Error('Google Maps 找不到可用的大眾運輸路線，請確認兩個景點都有座標或景點 ID')
    }
  }
}
