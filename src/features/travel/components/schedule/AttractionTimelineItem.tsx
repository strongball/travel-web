import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded'
import {
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import type { Attraction, TripDay } from '../../../../types/database'
import { googlePlaceUrl } from '../../googleMaps'
import { attractionMapPoint, formatAmount } from '../../travelWorkspaceUtils'
import { TravelInfoCard } from '../TravelInfo'

interface AttractionTimelineItemProps {
  day: TripDay
  attraction: Attraction
  index: number
  previousAttraction?: Attraction
  currency: string
  onEditAttraction: (day: TripDay, attraction: Attraction) => void
  onEditTravelInfo: (origin: Attraction, attraction: Attraction) => void
  onDeleteAttraction: (day: TripDay, id: string) => void
  onStartTimeChange: (dayId: string, time: string) => void
}

export function AttractionTimelineItem({
  day,
  attraction,
  index,
  previousAttraction,
  currency,
  onEditAttraction,
  onEditTravelInfo,
  onDeleteAttraction,
  onStartTimeChange,
}: AttractionTimelineItemProps) {
  const mapPoint = attractionMapPoint(attraction)

  return (
    <Box>
      {index === 0 ? (
        <Paper
          variant="outlined"
          sx={{
            width: { xs: 'calc(100% - 46px)', sm: 'calc(100% - 60px)' },
            ml: { xs: '46px', sm: '60px' },
            mb: 1.25,
            p: 1,
            bgcolor: 'action.hover',
          }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Box
              sx={{
                width: 26,
                height: 26,
                display: 'grid',
                placeItems: 'center',
                borderRadius: '50%',
                bgcolor: 'primary.main',
                color: 'common.white',
                flexShrink: 0,
              }}
            >
              <AccessTimeRoundedIcon sx={{ fontSize: 16 }} />
            </Box>
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Typography
                variant="caption"
                color="primary.main"
                sx={{ display: 'block', fontWeight: 900 }}
              >
                出發時間
              </Typography>
            </Box>
            <TextField
              size="small"
              type="time"
              value={day.startTime?.slice(11, 16) ?? '09:00'}
              slotProps={{ htmlInput: { step: 300, 'aria-label': '每日開始時間' } }}
              onChange={(event) => onStartTimeChange(day.id, event.target.value)}
              sx={{ width: { xs: 130, sm: 150 } }}
            />
          </Stack>
        </Paper>
      ) : null}

      {index > 0 && previousAttraction ? (
        <TravelInfoCard
          origin={previousAttraction}
          attraction={attraction}
          onEdit={() => onEditTravelInfo(previousAttraction, attraction)}
        />
      ) : null}

      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'stretch' }}>
        <Box sx={{ width: { xs: 38, sm: 52 }, pt: 1, textAlign: 'right', flexShrink: 0 }}>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontWeight: 750 }}
          >
            {attraction.startTime
              ? attraction.startTime.slice(11, 16)
              : `${9 + index}:00`}
          </Typography>
        </Box>
        <Box
          sx={{
            width: 2,
            bgcolor: 'primary.main',
            opacity: 0.3,
            borderRadius: 1,
            my: 0.5,
          }}
        />
        <Card
          variant="outlined"
          sx={{
            flex: 1,
            '&:hover': {
              borderColor: 'primary.main',
            },
          }}
        >
          <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Stack
              direction="row"
              spacing={1}
              sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  sx={{
                    fontWeight: 850,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {attraction.name}
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{
                    overflowWrap: 'anywhere',
                    mt: 0.2,
                  }}
                >
                  {attraction.locationName ||
                    attraction.description ||
                    `停留約 ${attraction.duration} 分鐘`}
                </Typography>
              </Box>
              <Stack direction="row" spacing={0.25} sx={{ alignItems: 'center', flexShrink: 0 }}>
                {mapPoint ? (
                  <Tooltip title="在 Google 地圖查看景點">
                    <IconButton
                      component="a"
                      size="small"
                      href={googlePlaceUrl(mapPoint, attraction.placeId)}
                      target="_blank"
                      rel="noreferrer"
                      color="primary"
                      aria-label={`在 Google 地圖查看 ${attraction.name}`}
                    >
                      <PlaceRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : null}
                <IconButton
                  size="small"
                  aria-label={`編輯 ${attraction.name}`}
                  onClick={() => onEditAttraction(day, attraction)}
                >
                  <EditRoundedIcon fontSize="small" />
                </IconButton>
                <IconButton
                  size="small"
                  color="error"
                  aria-label={`刪除 ${attraction.name}`}
                  onClick={() => onDeleteAttraction(day, attraction.id)}
                >
                  <DeleteOutlineRoundedIcon fontSize="small" />
                </IconButton>
              </Stack>
            </Stack>
            <Stack direction="row" spacing={0.75} sx={{ mt: 1.25, flexWrap: 'wrap', gap: 0.5 }}>
              <Chip
                size="small"
                label={`${attraction.duration} 分鐘`}
              />
              {attraction.cost > 0 ? (
                <Chip
                  size="small"
                  color="primary"
                  variant="outlined"
                  label={formatAmount(attraction.cost, currency)}
                />
              ) : null}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  )
}
