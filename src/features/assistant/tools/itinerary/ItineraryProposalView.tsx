import { Box, Chip, Stack, Typography } from '@mui/material'
import type { TripDay } from '../../../../types/database'

const dateLabel = (day: TripDay) => {
  const value = day.date.slice(0, 10)
  return new Intl.DateTimeFormat('zh-TW', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${value}T00:00:00Z`))
}

const itineraryItemLabel = (item: TripDay['attractions'][number]) => {
  const start = item.startTime?.slice(11, 16)
  const end = item.endTime?.slice(11, 16)
  const time = start && end ? `${start}–${end} ` : ''
  const travel = item.travelTime === null ? '' : `（車程約 ${item.travelTime} 分）`
  return `${time}${item.name}${travel}`
}

export function ItineraryProposalView({
  afterDays,
  beforeDays,
}: {
  afterDays: TripDay[]
  beforeDays: TripDay[]
}) {
  if (afterDays.length === 0) return null

  return (
    <Stack spacing={1.5}>
      {afterDays.map((after) => {
        const before = beforeDays.find((day) => day.id === after.id)
        return (
          <Box
            key={after.id}
            sx={{
              p: 1.5,
              bgcolor: '#f8faf9',
              borderRadius: 2.5,
              border: '1px solid rgba(13, 118, 110, 0.08)',
            }}
          >
            <Chip
              size="small"
              label={dateLabel(after)}
              sx={{
                fontWeight: 850,
                bgcolor: 'rgba(13, 118, 110, 0.08)',
                color: 'primary.main',
                mb: 1,
              }}
            />
            <Stack spacing={0.75}>
              <Box sx={{ p: 1, borderRadius: 2, bgcolor: '#f1f5f4' }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', fontWeight: 800, mb: 0.2 }}
                >
                  原本：
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.84rem' }}>
                  {before?.attractions.map(itineraryItemLabel).join(' → ') || '（沒有景點）'}
                </Typography>
              </Box>
              <Box
                sx={{
                  p: 1,
                  borderRadius: 2,
                  bgcolor: 'rgba(13, 118, 110, 0.08)',
                  border: '1px solid rgba(13, 118, 110, 0.15)',
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ display: 'block', fontWeight: 900, color: '#0d766e', mb: 0.2 }}
                >
                  建議新安排：
                </Typography>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: 650, color: '#075c57', fontSize: '0.86rem' }}
                >
                  {after.attractions.map(itineraryItemLabel).join(' → ') || '（沒有景點）'}
                </Typography>
              </Box>
            </Stack>
          </Box>
        )
      })}
    </Stack>
  )
}
