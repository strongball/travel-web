import { useEffect, useRef } from 'react'
import { Box, Chip, Paper, Stack, Typography } from '@mui/material'
import type { TripDay } from '../../../../types/database'
import { triggerHaptic } from '../../../../lib/haptics'

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
  const containerRef = useRef<HTMLDivElement | null>(null)
  const tabRefs = useRef<(HTMLDivElement | null)[]>([])

  // 取得今天日期 (YYYY-MM-DD)
  const todayStr = new Date().toLocaleDateString('sv-SE')

  useEffect(() => {
    const activeTab = tabRefs.current[activeDayIndex]
    if (activeTab && typeof activeTab.scrollIntoView === 'function') {
      activeTab.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      })
    }
  }, [activeDayIndex])

  const handleSelect = (index: number) => {
    if (index !== activeDayIndex) {
      triggerHaptic('light')
      onSelectDay(index)
    }
  }

  return (
    <Box
      ref={containerRef}
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
          const isToday = day.date.slice(0, 10) === todayStr

          return (
            <Paper
              key={day.id}
              ref={(el) => {
                tabRefs.current[index] = el
              }}
              elevation={0}
              onClick={() => handleSelect(index)}
              sx={{
                cursor: 'pointer',
                position: 'relative',
                py: 1,
                px: 2,
                borderRadius: 3,
                border: isSelected
                  ? '1.5px solid #0d766e'
                  : isToday
                  ? '1px solid rgba(13, 118, 110, 0.4)'
                  : '1px solid rgba(13, 118, 110, 0.12)',
                bgcolor: isSelected
                  ? 'rgba(13, 118, 110, 0.08)'
                  : isToday
                  ? 'rgba(13, 118, 110, 0.03)'
                  : '#ffffff',
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
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', justifyContent: 'center' }}>
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
                {isToday ? (
                  <Chip
                    label="今天"
                    size="small"
                    sx={{
                      height: 16,
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      bgcolor: isSelected ? '#0d766e' : 'rgba(13, 118, 110, 0.15)',
                      color: isSelected ? '#ffffff' : '#0d766e',
                      px: 0.25,
                      '& .MuiChip-label': { px: 0.5 },
                    }}
                  />
                ) : null}
              </Stack>
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
