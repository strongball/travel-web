import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Box, CircularProgress, Dialog, DialogContent, DialogTitle, Typography } from '@mui/material'
import type { Attraction, TripDay } from '../../types/database'
import { googleMapsApiKey, loadGoogleMaps } from './googleMaps'

type MappedAttraction = {
  attraction: Attraction
  position: google.maps.LatLngLiteral
}

const directPosition = (attraction: Attraction): google.maps.LatLngLiteral | null =>
  attraction.latitude !== null && attraction.longitude !== null
    ? { lat: attraction.latitude, lng: attraction.longitude }
    : null

const attractionSearchText = (attraction: Attraction) =>
  attraction.locationName?.trim() || attraction.name.trim()

export function GoogleItineraryMapDialog({ open, day, onClose }: { open: boolean; day: TripDay; onClose: () => void }) {
  const [mapElement, setMapElement] = useState<HTMLDivElement | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markerRefs = useRef<google.maps.Marker[]>([])
  const [mapReady, setMapReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [mappedAttractions, setMappedAttractions] = useState<MappedAttraction[]>([])
  const [error, setError] = useState<string | null>(null)

  const dayAttractions = useMemo(
    () => day.attractions,
    [day.attractions],
  )

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const directAttractions = dayAttractions.flatMap((attraction) => {
      const position = directPosition(attraction)
      return position ? [{ attraction, position }] : []
    })
    const missingAttractions = dayAttractions.filter((attraction) => !directPosition(attraction))
    setMappedAttractions(directAttractions)
    setError(null)
    if (missingAttractions.length === 0 || !googleMapsApiKey) return

    void loadGoogleMaps()
      .then(({ Place }) => {
        return Promise.all(missingAttractions.map(async (attraction) => {
          try {
            let location: google.maps.LatLng | null | undefined
            if (attraction.placeId) {
              const place = new Place({ id: attraction.placeId })
              await place.fetchFields({ fields: ['location'] })
              location = place.location
            }
            if (!location) {
              const response = await Place.searchByText({
                textQuery: attractionSearchText(attraction),
                fields: ['location'],
                maxResultCount: 1,
              })
              location = response.places[0]?.location
            }
            return location
              ? { attraction, position: { lat: location.lat(), lng: location.lng() } }
              : null
          } catch {
            return null
          }
        }))
      })
      .then((geocoded) => {
        if (!cancelled) setMappedAttractions([...directAttractions, ...geocoded.filter((item): item is MappedAttraction => item !== null)])
      })
      .catch(() => undefined)

    return () => { cancelled = true }
  }, [dayAttractions, open])

  useEffect(() => {
    if (!open || !mapElement || mapRef.current) return
    let cancelled = false
    setLoading(true)
    void loadGoogleMaps()
      .then(({ Map: GoogleMap }) => {
        if (cancelled || !mapElement) return
        mapRef.current = new GoogleMap(mapElement, {
          center: { lat: 25.033, lng: 121.5654 },
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        })
        setMapReady(true)
      })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Google 地圖載入失敗'))
      .finally(() => setLoading(false))
    return () => { cancelled = true }
  }, [mapElement, open])

  useEffect(() => {
    if (!open || !mapReady || !mapRef.current) return
    void loadGoogleMaps().then(({ Marker }) => {
      if (!mapRef.current) return
      markerRefs.current.forEach((marker) => marker.setMap(null))
      markerRefs.current = []
      const bounds = new google.maps.LatLngBounds()
      mappedAttractions.forEach(({ attraction, position }, index) => {
        bounds.extend(position)
        markerRefs.current.push(new Marker({
          map: mapRef.current,
          position,
          title: `${index + 1}. ${attraction.name || attraction.locationName || '景點'}`,
          label: `${index + 1}`,
        }))
      })
      if (!bounds.isEmpty()) mapRef.current.fitBounds(bounds, 56)
    })
  }, [mappedAttractions, mapReady, open])

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>{day.date.slice(5, 10).replace('-', '/')} 景點地圖</DialogTitle>
      <DialogContent sx={{ px: { xs: 1.5, sm: 3 }, pb: 2 }}>
        {!googleMapsApiKey ? <Alert severity="warning" sx={{ mb: 1.5 }}>請先設定 <code>VITE_GOOGLE_MAPS_API_KEY</code> 才能顯示 Google 地圖。</Alert> : null}
        {error ? <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert> : null}
        <Box sx={{ height: { xs: 360, sm: 520 }, position: 'relative', overflow: 'hidden', borderRadius: 2, border: 1, borderColor: 'divider' }}>
          <Box ref={setMapElement} sx={{ height: '100%', width: '100%' }} />
          {loading ? <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(255,255,255,0.72)' }}><CircularProgress /></Box> : null}
        </Box>
        {dayAttractions.length === 0 ? <Typography color="text.secondary" sx={{ mt: 1.5 }}>這天還沒有景點。</Typography> : null}
        {dayAttractions.length > 0 && mappedAttractions.length < dayAttractions.length ? <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>部分景點沒有座標，請在景點編輯中從 Google 地圖選擇位置。</Typography> : null}
      </DialogContent>
    </Dialog>
  )
}

export default GoogleItineraryMapDialog
