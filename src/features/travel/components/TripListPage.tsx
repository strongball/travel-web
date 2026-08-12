import AddRoundedIcon from '@mui/icons-material/AddRounded'
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded'
import FlightTakeoffRoundedIcon from '@mui/icons-material/FlightTakeoffRounded'
import { Box, Button, Card, CardActionArea, CardContent, Chip, Paper, Stack, Typography } from '@mui/material'
import type { Itinerary } from '../../../types/database'
import { formatDate } from '../travelWorkspaceUtils'

export function TripListPage({
  itineraries,
  selectedItineraryId,
  loading,
  onOpen,
  onNew,
}: {
  itineraries: Itinerary[]
  selectedItineraryId: string | null
  loading: boolean
  onOpen: (id: string) => void
  onNew: () => void
}) {
  return (
    <Stack spacing={{ xs: 2, md: 3 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 800 }}>
            我的行程
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '-0.04em' }}>
            選擇一段旅程
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            進入旅程後，再管理日程、待辦與費用。
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={onNew} sx={{ alignSelf: { xs: 'stretch', sm: 'auto' } }}>
          新增行程
        </Button>
      </Stack>

      {loading ? (
        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, p: 3 }}>
          <Typography color="text.secondary">正在載入行程…</Typography>
        </Paper>
      ) : itineraries.length === 0 ? (
        <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', borderRadius: 3, p: { xs: 3, md: 6 }, textAlign: 'center' }}>
          <FlightTakeoffRoundedIcon color="primary" sx={{ fontSize: 52 }} />
          <Typography variant="h6" sx={{ mt: 1, fontWeight: 900 }}>還沒有行程</Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5, mb: 2.5 }}>建立第一個旅程，開始安排每天的景點。</Typography>
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={onNew}>建立第一個行程</Button>
        </Paper>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
            gap: { xs: 1.5, md: 2 },
          }}
        >
          {itineraries.map((itinerary) => (
            <Card
              key={itinerary.id}
              elevation={0}
              sx={{
                border: 1,
                borderColor: itinerary.id === selectedItineraryId ? 'primary.main' : 'divider',
                borderRadius: 3,
                overflow: 'hidden',
              }}
            >
              <CardActionArea onClick={() => onOpen(itinerary.id)} sx={{ height: '100%' }}>
                <Box sx={{ height: 8, bgcolor: itinerary.id === selectedItineraryId ? 'primary.main' : 'secondary.main' }} />
                <CardContent sx={{ p: { xs: 2, md: 2.25 }, '&:last-child': { pb: { xs: 2, md: 2.25 } } }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <Typography variant="h6" noWrap sx={{ minWidth: 0, fontWeight: 900 }}>
                      {itinerary.title || '未命名行程'}
                    </Typography>
                    {itinerary.id === selectedItineraryId ? <Chip size="small" color="primary" label="目前" /> : null}
                  </Stack>
                  <Stack direction="row" spacing={0.75} sx={{ mt: 1.5, flexWrap: 'wrap' }}>
                    <Chip size="small" icon={<CalendarMonthRoundedIcon />} label={`${formatDate(itinerary.startDate)} — ${formatDate(itinerary.endDate)}`} />
                    <Chip size="small" label={itinerary.currency} />
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                    {itinerary.days?.length ?? 0} 天行程
                  </Typography>
                </CardContent>
              </CardActionArea>
            </Card>
          ))}
        </Box>
      )}
    </Stack>
  )
}


