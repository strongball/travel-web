import { useState } from 'react'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded'
import ClearRoundedIcon from '@mui/icons-material/ClearRounded'
import FlightTakeoffRoundedIcon from '@mui/icons-material/FlightTakeoffRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import {
  Avatar,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import type { Itinerary } from '../../../types/database'
import { formatDate } from '../travelWorkspaceUtils'

function getTripStatus(startDate?: string | null, endDate?: string | null) {
  if (!startDate) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const start = new Date(startDate.slice(0, 10))
  start.setHours(0, 0, 0, 0)

  const end = endDate ? new Date(endDate.slice(0, 10)) : new Date(start)
  end.setHours(23, 59, 59, 999)

  const diffDays = Math.ceil((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (today >= start && today <= end) {
    const currentDay = Math.floor((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
    return { label: `進行中 · 第 ${currentDay} 天`, color: 'success' as const }
  }
  if (diffDays > 0) {
    return { label: `還有 ${diffDays} 天出發`, color: 'primary' as const }
  }
  return { label: '已結束', color: 'default' as const }
}

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
  const [searchQuery, setSearchQuery] = useState('')

  const filteredItineraries = itineraries.filter((it) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.trim().toLowerCase()
    return (
      it.title?.toLowerCase().includes(q) ||
      it.currency?.toLowerCase().includes(q) ||
      it.startDate?.includes(q) ||
      it.endDate?.includes(q)
    )
  })
  return (
    <Stack spacing={{ xs: 2.5, md: 3.5 }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
      >
        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 0.5 }}>
            <FlightTakeoffRoundedIcon color="primary" fontSize="small" />
            <Typography
              variant="h5"
              sx={{ fontWeight: 900, letterSpacing: '-0.02em' }}
            >
              我的旅遊行程
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            進入旅程以查看日程排程、管理待辦事項、記錄費用與使用 AI 旅程助理。
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddRoundedIcon />}
          onClick={onNew}
          sx={{ alignSelf: { xs: 'stretch', sm: 'auto' } }}
        >
          新增行程
        </Button>
      </Stack>

      {itineraries.length > 0 ? (
        <TextField
          size="small"
          placeholder="搜尋行程名稱、幣別或日期…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon fontSize="small" color="action" />
                </InputAdornment>
              ),
              endAdornment: searchQuery ? (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    aria-label="清除搜尋"
                    onClick={() => setSearchQuery('')}
                    edge="end"
                  >
                    <ClearRoundedIcon fontSize="small" />
                  </IconButton>
                </InputAdornment>
              ) : null,
            },
          }}
          sx={{ maxWidth: { xs: '100%', sm: 360 } }}
        />
      ) : null}

      {loading && itineraries.length === 0 ? (
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">
            正在載入行程…
          </Typography>
        </Card>
      ) : itineraries.length === 0 ? (
        <Card sx={{ p: { xs: 4, md: 6 }, textAlign: 'center' }}>
          <Avatar
            sx={{
              width: 64,
              height: 64,
              mx: 'auto',
              mb: 2,
              bgcolor: 'primary.main',
              color: 'common.white',
            }}
          >
            <FlightTakeoffRoundedIcon sx={{ fontSize: 32 }} />
          </Avatar>
          <Typography variant="h6" sx={{ fontWeight: 900 }}>
            還沒有建立任何行程
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, mb: 3 }}>
            開始規劃你的第一趟旅程，輕鬆安排每一天的景點與交通。
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={onNew}
          >
            建立第一個行程
          </Button>
        </Card>
      ) : filteredItineraries.length === 0 ? (
        <Card sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary" sx={{ mb: 1.5 }}>
            找不到符合「{searchQuery}」的行程
          </Typography>
          <Button size="small" variant="outlined" onClick={() => setSearchQuery('')}>
            清除搜尋
          </Button>
        </Card>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, minmax(0, 1fr))',
              lg: 'repeat(3, minmax(0, 1fr))',
            },
            gap: { xs: 1.75, md: 2.5 },
          }}
        >
          {filteredItineraries.map((itinerary) => {
            const isSelected = itinerary.id === selectedItineraryId
            return (
              <Card
                key={itinerary.id}
                sx={{
                  borderWidth: isSelected ? '1.5px' : '1px',
                  borderColor: isSelected ? 'primary.main' : 'divider',
                  boxShadow: (theme) => isSelected ? theme.palette.cardShadowHover : theme.palette.cardShadow,
                  overflow: 'hidden',
                  transition: 'all 220ms cubic-bezier(0.4, 0, 0.2, 1)',
                  '&:hover': {
                    borderColor: 'primary.main',
                    transform: 'translateY(-3px)',
                    boxShadow: (theme) => theme.palette.cardShadowHover,
                  },
                }}
              >
                <CardActionArea onClick={() => onOpen(itinerary.id)} sx={{ height: '100%' }}>
                  <Box
                    sx={{
                      height: 5,
                      background: isSelected
                        ? (theme) => theme.palette.primaryGradient
                        : 'linear-gradient(90deg, #ee7c45 0%, #f97316 100%)',
                    }}
                  />
                  <CardContent sx={{ p: { xs: 2, md: 2.5 }, '&:last-child': { pb: { xs: 2, md: 2.5 } } }}>
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}
                    >
                      <Typography
                        variant="h6"
                        noWrap
                        sx={{
                          minWidth: 0,
                          fontWeight: 900,
                          fontSize: { xs: '1.05rem', sm: '1.15rem' },
                          letterSpacing: '-0.02em',
                        }}
                      >
                        {itinerary.title || '未命名行程'}
                      </Typography>
                      {isSelected ? (
                        <Chip
                          size="small"
                          label="目前使用中"
                          sx={{
                            height: 22,
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            bgcolor: 'surfaceSubtle',
                            color: 'primary.main',
                            borderColor: 'surfaceSubtleBorder',
                          }}
                        />
                      ) : null}
                    </Stack>

                    <Stack direction="row" spacing={0.75} sx={{ mt: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
                      {(() => {
                        const status = getTripStatus(itinerary.startDate, itinerary.endDate)
                        if (!status) return null
                        const isCountdown = status.label.includes('天出發')
                        const isOngoing = status.label.includes('進行中')
                        return (
                          <Chip
                            size="small"
                            variant="outlined"
                            label={status.label}
                            sx={{
                              height: 24,
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              ...(isCountdown || isOngoing
                                ? {
                                    bgcolor: 'accentWarmBg',
                                    color: 'accentWarm',
                                    borderColor: 'accentWarmBorder',
                                  }
                                : {
                                    bgcolor: 'action.hover',
                                    color: 'text.secondary',
                                    borderColor: 'divider',
                                  }),
                            }}
                          />
                        )
                      })()}
                      <Chip
                        size="small"
                        icon={<CalendarMonthRoundedIcon sx={{ fontSize: '14px !important' }} />}
                        label={`${formatDate(itinerary.startDate)} — ${formatDate(itinerary.endDate)}`}
                        sx={{
                          height: 24,
                          fontSize: '0.74rem',
                          fontWeight: 700,
                          bgcolor: 'action.hover',
                        }}
                      />
                      <Chip
                        size="small"
                        label={itinerary.currency}
                        sx={{
                          height: 24,
                          fontSize: '0.74rem',
                          fontWeight: 800,
                          bgcolor: 'surfaceSubtle',
                          color: 'primary.main',
                        }}
                      />
                    </Stack>

                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ display: 'block', mt: 1.75, fontWeight: 750, fontSize: '0.78rem' }}
                    >
                      📅 共 {itinerary.days?.length ?? 0} 天行程 · {itinerary.days?.reduce((sum, d) => sum + d.attractions.length, 0) ?? 0} 個景點
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            )
          })}
        </Box>
      )}
    </Stack>
  )
}


