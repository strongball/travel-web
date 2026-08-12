import { useEffect, useRef, useState } from 'react'
import MyLocationRoundedIcon from '@mui/icons-material/MyLocationRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded'
import { Alert, Box, Button, ClickAwayListener, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, TextField, Typography } from '@mui/material'
import { geocodeWithGoogle, googleMapsApiKey, loadGoogleMaps } from './googleMaps'

export type MapLocation = { latitude: number; longitude: number; label: string; placeId?: string | null }

const defaultPosition = { lat: 25.033, lng: 121.5654 }

export function MapPickerDialog({
  open,
  initialLocation,
  fallbackLocation,
  onClose,
  onSelect,
}: {
  open: boolean
  initialLocation?: MapLocation
  fallbackLocation?: MapLocation
  onClose: () => void
  onSelect: (location: MapLocation) => void
}) {
  const mapElement = useRef<HTMLDivElement>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markerRef = useRef<google.maps.Marker | null>(null)
  const geocoderRef = useRef<google.maps.Geocoder | null>(null)
  const [position, setPosition] = useState(initialLocation ? { lat: initialLocation.latitude, lng: initialLocation.longitude } : defaultPosition)
  const [label, setLabel] = useState(initialLocation?.label ?? '')
  const [placeId, setPlaceId] = useState<string | null>(initialLocation?.placeId ?? null)
  const [query, setQuery] = useState(initialLocation?.label ?? '')
  const [results, setResults] = useState<google.maps.places.Place[]>([])
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [message, setMessage] = useState('在 Google 地圖上點一下即可選擇景點')
  const [error, setError] = useState<string | null>(null)
  const initialLatitude = initialLocation?.latitude
  const initialLongitude = initialLocation?.longitude
  const initialLabel = initialLocation?.label
  const initialPlaceId = initialLocation?.placeId
  const fallbackLatitude = fallbackLocation?.latitude
  const fallbackLongitude = fallbackLocation?.longitude
  const fallbackLabel = fallbackLocation?.label
  const fallbackPlaceId = fallbackLocation?.placeId

  useEffect(() => {
    if (!open) return
    const hasInitialLocation = initialLatitude !== undefined && initialLongitude !== undefined
    const nextPosition = hasInitialLocation
      ? { lat: initialLatitude, lng: initialLongitude }
      : fallbackLatitude !== undefined && fallbackLongitude !== undefined
        ? { lat: fallbackLatitude, lng: fallbackLongitude }
        : defaultPosition
    setPosition(nextPosition)
    setLabel(hasInitialLocation ? initialLabel ?? '' : fallbackLabel ?? '')
    setPlaceId(hasInitialLocation ? initialPlaceId ?? null : fallbackPlaceId ?? null)
    setQuery(hasInitialLocation ? initialLabel ?? '' : fallbackLabel ?? '')
    setResults([])
    setError(null)
    setMessage(hasInitialLocation ? '目前景點位置，可搜尋其他 Google 景點' : fallbackLocation ? '已使用當天第一個景點作為地圖起點' : '正在嘗試使用目前位置')
    if (!hasInitialLocation && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          setPosition({ lat: coords.latitude, lng: coords.longitude })
          setLabel('目前位置')
          setQuery('')
          setPlaceId(null)
          setMessage('已使用目前位置，可搜尋或點選地圖')
        },
        () => {
          if (fallbackLocation) setMessage('無法取得目前位置，已使用當天第一個景點')
          else setMessage('無法取得目前位置，請直接搜尋或點選地圖')
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 },
      )
    }
  }, [fallbackLabel, fallbackLatitude, fallbackLongitude, fallbackLocation, fallbackPlaceId, initialLabel, initialLatitude, initialLongitude, initialPlaceId, open])

  useEffect(() => {
    if (!open || !mapElement.current || mapRef.current) return
    let cancelled = false
    setLoading(true)
    void loadGoogleMaps()
      .then(({ Map: GoogleMap, Geocoder }) => {
        if (cancelled || !mapElement.current) return
        const map = new GoogleMap(mapElement.current, {
          center: position,
          zoom: 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          clickableIcons: true,
        })
        mapRef.current = map
        geocoderRef.current = new Geocoder()
        map.addListener('click', (event: google.maps.MapMouseEvent) => {
          const location = event.latLng?.toJSON()
          if (!location) return
          setPosition(location)
          setPlaceId(null)
          setMessage('已選取地圖位置，正在取得地址…')
          void reverseGeocode(location, geocoderRef.current).then((nextLabel) => {
            if (!nextLabel) return
            setLabel(nextLabel)
            setQuery(nextLabel)
            setMessage('已選取地圖位置')
          })
        })
        setMapReady(true)
      })
      .catch((loadError: unknown) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Google 地圖載入失敗')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, position])

  useEffect(() => {
    if (!mapReady || !mapRef.current) return
    mapRef.current.panTo(position)
    if (!markerRef.current) {
      markerRef.current = new google.maps.Marker({ map: mapRef.current, position, title: label || '選取的景點' })
    } else {
      markerRef.current.setPosition(position)
      markerRef.current.setTitle(label || '選取的景點')
    }
  }, [label, mapReady, position])

  const searchPlaces = async () => {
    if (!query.trim()) return
    setSearching(true)
    setError(null)
    setMessage('正在搜尋 Google 景點…')
    try {
      const { Place } = await loadGoogleMaps()
      const response = await Place.searchByText({
        textQuery: query.trim(),
        fields: ['id', 'displayName', 'formattedAddress', 'location', 'googleMapsURI'],
        language: 'zh-TW',
        maxResultCount: 5,
      })
      setResults(response.places)
      setMessage(response.places.length ? '選擇搜尋結果，或直接點地圖' : '找不到景點，請換個關鍵字')
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Google 景點搜尋失敗')
    } finally {
      setSearching(false)
    }
  }

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMessage('此瀏覽器不支援目前位置')
      return
    }
    setMessage('正在取得目前位置…')
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPosition({ lat: coords.latitude, lng: coords.longitude })
        setLabel('目前位置')
        setQuery('')
        setPlaceId(null)
        setResults([])
        setMessage('已使用目前位置，可搜尋或點選地圖')
      },
      () => setMessage('無法取得目前位置，請確認瀏覽器定位權限'),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 },
    )
  }

  const selectPlace = (place: google.maps.places.Place) => {
    const location = place.location?.toJSON()
    if (!location) return
    const nextLabel = place.displayName || place.formattedAddress || ''
    setPosition(location)
    setLabel(nextLabel)
    setQuery(nextLabel)
    setPlaceId(place.id ?? null)
    setResults([])
    setMessage('已選取 Google 景點')
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>在 Google 地圖上選擇景點</DialogTitle>
      <DialogContent sx={{ px: { xs: 1.5, sm: 3 }, pb: 1.5 }}>
        <Stack spacing={1.5}>
          {!googleMapsApiKey ? (
            <Alert severity="warning">
              尚未設定 Google Maps API Key。請在 <code>.env.local</code> 加入 <code>VITE_GOOGLE_MAPS_API_KEY</code>，並啟用 Maps JavaScript API、Places API 與 Routes API。
            </Alert>
          ) : null}
          {error ? <Alert severity="error">{error}</Alert> : null}
          <ClickAwayListener onClickAway={() => setResults([])}>
            <Box sx={{ position: 'relative', zIndex: 5 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <TextField label="搜尋 Google 景點或地址" value={query} onChange={(event) => { setQuery(event.target.value); if (!event.target.value.trim()) setResults([]) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void searchPlaces() } }} sx={{ flex: 1 }} />
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Button variant="outlined" startIcon={<SearchRoundedIcon />} disabled={searching || !query.trim() || !googleMapsApiKey} onClick={() => void searchPlaces()}>搜尋</Button>
                  <Button variant="text" size="small" startIcon={<MyLocationRoundedIcon />} onClick={useCurrentLocation}>我的位置</Button>
                </Stack>
              </Stack>
              {results.length > 0 ? <Paper elevation={8} sx={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, maxHeight: 220, overflowY: 'auto', p: 0.5, bgcolor: 'background.paper' }}>{results.map((place) => <Button key={place.id} onClick={() => selectPlace(place)} sx={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', color: 'text.primary', py: 1 }}><PlaceRoundedIcon sx={{ mr: 1, color: 'primary.main', flexShrink: 0 }} /><Box sx={{ minWidth: 0 }}><Typography variant="body2" noWrap>{place.displayName || place.formattedAddress}</Typography><Typography variant="caption" color="text.secondary" noWrap>{place.formattedAddress}</Typography></Box></Button>)}</Paper> : null}
            </Box>
          </ClickAwayListener>
          <Box sx={{ height: { xs: 300, sm: 420 }, overflow: 'hidden', borderRadius: 2, border: 1, borderColor: 'divider', position: 'relative' }}>
            <Box ref={mapElement} sx={{ height: '100%', width: '100%' }} />
            {loading ? <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(255,255,255,0.72)' }}><CircularProgress /></Box> : null}
          </Box>
          <Typography variant="body2" color="text.secondary">{message}</Typography>
          <Typography variant="caption" color="text.secondary">座標：{position.lat.toFixed(5)}, {position.lng.toFixed(5)}{label ? ` · ${label}` : ''}</Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: { xs: 2, sm: 3 }, pb: 2 }}>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" disabled={!googleMapsApiKey} onClick={() => onSelect({ latitude: position.lat, longitude: position.lng, label, placeId })}>套用地點</Button>
      </DialogActions>
    </Dialog>
  )
}

async function reverseGeocode(
  location: google.maps.LatLngLiteral,
  geocoder: google.maps.Geocoder | null,
) {
  if (!geocoder) return null
  try {
    const response = await geocodeWithGoogle(geocoder, { location })
    return response.results[0]?.formatted_address ?? null
  } catch {
    return null
  }
}

export default MapPickerDialog
