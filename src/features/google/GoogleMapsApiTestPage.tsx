import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded'
import MapRoundedIcon from '@mui/icons-material/MapRounded'
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded'
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { PageHeader } from '../../components/PageHeader'
import {
  geocodeWithGoogle,
  googleMapsApiKey,
  loadGoogleMapsLibrary,
  type GoogleMapLibraries,
} from '../travel/googleMaps'

type TestId = 'maps' | 'marker' | 'places' | 'geocoding' | 'routes' | 'directions'
type TestStatus = 'idle' | 'running' | 'passed' | 'failed'
type TestResult = { status: TestStatus; detail: string }

const testCases: Array<{ id: TestId; title: string; api: string; description: string }> = [
  { id: 'maps', title: '地圖載入', api: 'Maps JavaScript API', description: '確認瀏覽器 API Key 能載入 Maps JavaScript library。' },
  { id: 'marker', title: '地圖標記', api: 'Maps JavaScript Marker library', description: '確認行程地圖使用的 marker library 能載入。' },
  { id: 'places', title: '景點搜尋', api: 'Places API (New)', description: '搜尋「道頓堀，大阪，日本」，確認 Places Text Search 權限。' },
  { id: 'geocoding', title: '地址轉座標', api: 'Geocoding API', description: '將「道頓堀，大阪，日本」轉成 Place ID 與座標。' },
  { id: 'routes', title: '路線估算', api: 'Routes API', description: '計算道頓堀到大阪城的駕車距離與時間。' },
  { id: 'directions', title: 'Directions 路線', api: 'Directions API', description: '用目前行程交通估算使用的 DirectionsService 測試駕車路線。' },
]

const initialResults = (): Record<TestId, TestResult> => Object.fromEntries(
  testCases.map(({ id }) => [id, { status: 'idle', detail: '尚未測試' }]),
) as Record<TestId, TestResult>

const errorText = (value: unknown) => {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const candidate = value as { message?: unknown; status?: unknown }
    if (typeof candidate.message === 'string') return candidate.status ? `${candidate.status}: ${candidate.message}` : candidate.message
    if (typeof candidate.status === 'string') return candidate.status
  }
  return '未知錯誤'
}

const location = {
  dotonbori: { lat: 34.6687, lng: 135.5013 },
  osakaCastle: { lat: 34.6873, lng: 135.5262 },
}

const withTimeout = async <T,>(promise: Promise<T>, message: string, timeoutMs = 15_000): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

const executeTest = async (id: TestId) => {
  if (id === 'maps') {
    await loadGoogleMapsLibrary('maps')
    return 'Maps JavaScript library 載入成功。'
  }
  if (id === 'marker') {
    await loadGoogleMapsLibrary('marker')
    return 'Marker library 載入成功。'
  }
  if (id === 'places') {
    const { Place } = await loadGoogleMapsLibrary('places') as Pick<GoogleMapLibraries, 'Place'>
    const response = await Place.searchByText({
      textQuery: '道頓堀 大阪 日本',
      fields: ['id', 'displayName', 'formattedAddress', 'location'],
      language: 'zh-TW',
      maxResultCount: 1,
    })
    const place = response.places[0]
    if (!place?.id) throw new Error('Places API 回傳空結果')
    return `成功：${place.displayName ?? place.formattedAddress ?? place.id}`
  }
  if (id === 'geocoding') {
    const { Geocoder } = await loadGoogleMapsLibrary('geocoding') as Pick<GoogleMapLibraries, 'Geocoder'>
    const response = await geocodeWithGoogle(Geocoder, { address: '道頓堀 大阪 日本', language: 'zh-TW' })
    const result = response.results?.[0]
    const point = result?.geometry?.location?.toJSON()
    if (!result?.place_id || !point) throw new Error('Geocoding API 回傳空結果')
    return `成功：${result.formatted_address ?? result.place_id} (${point.lat.toFixed(5)}, ${point.lng.toFixed(5)})`
  }
  if (id === 'routes') {
    const { Route } = await loadGoogleMapsLibrary('routes') as Pick<GoogleMapLibraries, 'Route'>
    const response = await Route.computeRoutes({
      origin: location.dotonbori,
      destination: location.osakaCastle,
      travelMode: 'DRIVING',
      fields: ['distanceMeters', 'durationMillis'],
      language: 'zh-TW',
    })
    const route = response.routes?.[0]
    if (!route || typeof route.distanceMeters !== 'number' || typeof route.durationMillis !== 'number') {
      throw new Error('Routes API 回傳空結果')
    }
    return `成功：約 ${(route.distanceMeters / 1000).toFixed(1)} 公里，${Math.round(route.durationMillis / 60000)} 分鐘`
  }
  const { DirectionsService } = await loadGoogleMapsLibrary('routes') as Pick<GoogleMapLibraries, 'DirectionsService'>
  const response = await new Promise<google.maps.DirectionsResult>((resolve, reject) => {
    new DirectionsService().route({
      origin: location.dotonbori,
      destination: location.osakaCastle,
      travelMode: 'DRIVING',
    }, (route, status) => status === 'OK' && route ? resolve(route) : reject(new Error(`DirectionsService 狀態：${status}`)))
  })
  const leg = response.routes?.[0]?.legs?.[0]
  if (!leg?.distance?.text || !leg.duration?.text) throw new Error('Directions API 回傳空結果')
  return `成功：${leg.distance.text}，${leg.duration.text}`
}

export function GoogleMapsApiTestPage({ onBack }: { onBack: () => void }) {
  const [results, setResults] = useState<Record<TestId, TestResult>>(initialResults)
  const [runningAll, setRunningAll] = useState(false)

  const runTest = async (id: TestId) => {
    setResults((current) => ({ ...current, [id]: { status: 'running', detail: '測試中…' } }))
    try {
      const test = testCases.find((item) => item.id === id)
      const detail = await withTimeout(executeTest(id), `${test?.api ?? 'Google Maps'} 測試逾時（15 秒）`)
      setResults((current) => ({ ...current, [id]: { status: 'passed', detail } }))
    } catch (error) {
      setResults((current) => ({ ...current, [id]: { status: 'failed', detail: errorText(error) } }))
    }
  }

  const runAll = async () => {
    setRunningAll(true)
    try {
      await Promise.all(testCases.map(({ id }) => runTest(id)))
    } finally {
      setRunningAll(false)
    }
  }

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default' }}>
      <PageHeader title="Google Maps API 測試" onBack={onBack} backLabel="返回旅程" />
      <Box component="main" sx={{ maxWidth: 900, mx: 'auto', p: { xs: 2, md: 4 } }}>
        <Stack spacing={2.5}>
          <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <MapRoundedIcon color="primary" sx={{ fontSize: 34 }} />
              <Box sx={{ flex: 1 }}>
                <Typography variant="h5" sx={{ fontWeight: 900 }}>逐項確認 Google Maps 權限</Typography>
                <Typography color="text.secondary">每個測試都會直接使用目前網站的瀏覽器 API Key。</Typography>
              </Box>
              <Button variant="contained" startIcon={<PlayArrowRoundedIcon />} disabled={!googleMapsApiKey || runningAll} onClick={() => void runAll()}>{runningAll ? '全部測試中…' : '全部測試'}</Button>
            </Stack>
            <Divider sx={{ my: 2 }} />
            <Stack spacing={0.5}>
              <Typography variant="body2"><strong>目前來源：</strong><code>{window.location.origin}</code></Typography>
              <Typography variant="body2"><strong>API Key：</strong>{googleMapsApiKey ? '已設定（不顯示內容）' : '未設定 VITE_GOOGLE_MAPS_API_KEY'}</Typography>
            </Stack>
          </Paper>

          {!googleMapsApiKey ? <Alert severity="warning">請先設定 <code>VITE_GOOGLE_MAPS_API_KEY</code>，再執行測試。</Alert> : null}
          <Stack spacing={1.25}>
            {testCases.map((test) => {
              const result = results[test.id]
              return <Paper key={test.id} variant="outlined" sx={{ p: { xs: 1.5, md: 2 }, borderRadius: 2.5 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
                  <Box sx={{ flex: 1 }}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.25 }}>
                      <Typography sx={{ fontWeight: 900 }}>{test.title}</Typography>
                      <Chip size="small" label={test.api} />
                      {result.status === 'passed' ? <CheckCircleRoundedIcon color="success" fontSize="small" /> : null}
                      {result.status === 'failed' ? <ErrorOutlineRoundedIcon color="error" fontSize="small" /> : null}
                    </Stack>
                    <Typography variant="body2" color="text.secondary">{test.description}</Typography>
                    <Typography variant="caption" color={result.status === 'failed' ? 'error' : 'text.secondary'} sx={{ display: 'block', mt: 0.75, wordBreak: 'break-word' }}>{result.detail}</Typography>
                  </Box>
                  <Button variant={result.status === 'passed' ? 'outlined' : 'contained'} disabled={!googleMapsApiKey || result.status === 'running' || runningAll} onClick={() => void runTest(test.id)}>{result.status === 'running' ? '測試中…' : '測試'}</Button>
                </Stack>
              </Paper>
            })}
          </Stack>
          <Alert severity="info">
            首次載入 Maps library 或呼叫路線服務可能需要幾秒；單項超過 15 秒會自動標記為逾時，不會一直卡住。若只有 Places 失敗，請確認 Google Cloud 已啟用 <strong>Places API (New)</strong>，且 API Key 的網站來源限制包含上方來源。若 Routes 或 Directions 失敗，請另外啟用對應 API；這些權限彼此分開。
          </Alert>
        </Stack>
      </Box>
    </Box>
  )
}

export default GoogleMapsApiTestPage
