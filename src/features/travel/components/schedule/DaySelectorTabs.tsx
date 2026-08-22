import { Box, Paper, Stack, Typography } from '@mui/material'
import type { TripDay } from '../../../../types/database'

interface DaySelectorTabsProps {
  days: TripDay[]
  activeDayIndex: number
  onSelectDay: (index: number) => void
}

export function DaySelectorTabs({
  days,
  activeDayIndex,
  onSelectDay,
}: DaySelectorTabsProps) {
  return (
    <Box
      sx={{
        pb: 0.5,
        overflowX: 'auto',
        '::-webkit-scrollbar': { display: 'none' },
        scrollbarWidth: 'none',
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ minWidth: 'max-content', py: 0.5 }}>
        {days.map((day, index) => {
          const isSelected = index === activeDayIndex
          return (
            <Paper
              key={day.id}
              elevation={0}
              onClick={() => onSelectDay(index)}
              sx={{
                cursor: 'pointer',
                py: 1,
                px: 2,
                borderRadius: 3,
                border: isSelected
                  ? '1.5px solid #0d766e'
                  : '1px solid rgba(13, 118, 110, 0.12)',
                bgcolor: isSelected ? 'rgba(13, 118, 110, 0.08)' : '#ffffff',
                boxShadow: isSelected
                  ? '0 4px 14px rgba(13, 118, 110, 0.12)'
                  : '0 2px 6px rgba(0, 0, 0, 0.02)',
                textAlign: 'center',
                transition: 'all 180ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                minWidth: { xs: 84, sm: 96 },
                '&:hover': {
                  bgcolor: isSelected ? 'rgba(13, 118, 110, 0.12)' : 'rgba(13, 118, 110, 0.04)',
                  transform: 'translateY(-1px)',
                },
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  fontWeight: 900,
                  fontSize: '0.78rem',
                  color: isSelected ? '#0d766e' : 'text.secondary',
                  letterSpacing: '0.02em',
                }}
              >
                DAY {index + 1}
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: isSelected ? 800 : 600,
                  color: isSelected ? '#075c57' : 'text.primary',
                  fontSize: '0.88rem',
                  mt: 0.2,
                }}
              >
                {day.date.slice(5, 10).replace('-', '/')}
              </Typography>
            </Paper>
          )
        })}
      </Stack>
    </Box>
  )
}
