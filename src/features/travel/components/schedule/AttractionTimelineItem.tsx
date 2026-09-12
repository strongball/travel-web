import { useState } from 'react'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import PlaceRoundedIcon from '@mui/icons-material/PlaceRounded'
import {
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
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
  onDuplicateAttraction?: (day: TripDay, attraction: Attraction) => void
  onEditTravelInfo: (origin: Attraction, attraction: Attraction) => void
  onDeleteAttraction: (day: TripDay, id: string) => void
}

export function AttractionTimelineItem({
  day,
  attraction,
  index,
  previousAttraction,
  currency,
  onEditAttraction,
  onDuplicateAttraction,
  onEditTravelInfo,
  onDeleteAttraction,
}: AttractionTimelineItemProps) {
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null)
  const mapPoint = attractionMapPoint(attraction)

  const showLocation = Boolean(
    attraction.locationName &&
      attraction.locationName.trim().toLowerCase() !== attraction.name.trim().toLowerCase(),
  )

  const handleOpenMenu = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation()
    setMenuAnchorEl(e.currentTarget)
  }

  const handleCloseMenu = () => {
    setMenuAnchorEl(null)
  }

  return (
    <Box>
      {index > 0 && previousAttraction ? (
        <TravelInfoCard
          origin={previousAttraction}
          attraction={attraction}
          onEdit={() => onEditTravelInfo(previousAttraction, attraction)}
        />
      ) : null}

      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'stretch' }}>
        <Box sx={{ width: { xs: 38, sm: 52 }, pt: 0.75, textAlign: 'right', flexShrink: 0 }}>
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
          onClick={() => onEditAttraction(day, attraction)}
          sx={{
            flex: 1,
            cursor: 'pointer',
            transition: 'border-color 150ms ease, box-shadow 150ms ease',
            '&:hover': {
              borderColor: 'primary.main',
              boxShadow: (theme) => theme.palette.cardShadow,
            },
          }}
        >
          <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
            <Stack
              direction="row"
              spacing={1}
              sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 800,
                    lineHeight: 1.3,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {attraction.name}
                </Typography>

                {showLocation ? (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    noWrap
                    sx={{
                      display: 'block',
                      mt: 0.25,
                      fontSize: '0.78rem',
                    }}
                  >
                    📍 {attraction.locationName}
                  </Typography>
                ) : null}
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
                      onClick={(e) => e.stopPropagation()}
                    >
                      <PlaceRoundedIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : null}

                <Tooltip title="更多選項">
                  <IconButton
                    size="small"
                    aria-label={`更多選項 - ${attraction.name}`}
                    aria-haspopup="true"
                    aria-expanded={Boolean(menuAnchorEl)}
                    onClick={handleOpenMenu}
                  >
                    <MoreVertRoundedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>

                <Menu
                  anchorEl={menuAnchorEl}
                  open={Boolean(menuAnchorEl)}
                  onClose={handleCloseMenu}
                  onClick={(e) => e.stopPropagation()}
                  transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                  anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                >
                  <MenuItem
                    onClick={() => {
                      setMenuAnchorEl(null)
                      onEditAttraction(day, attraction)
                    }}
                  >
                    <ListItemIcon>
                      <EditRoundedIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>編輯景點</ListItemText>
                  </MenuItem>
                  {onDuplicateAttraction ? (
                    <MenuItem
                      onClick={() => {
                        setMenuAnchorEl(null)
                        onDuplicateAttraction(day, attraction)
                      }}
                    >
                      <ListItemIcon>
                        <ContentCopyRoundedIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText>複製景點</ListItemText>
                    </MenuItem>
                  ) : null}
                  <MenuItem
                    onClick={() => {
                      setMenuAnchorEl(null)
                      onDeleteAttraction(day, attraction.id)
                    }}
                    sx={{ color: 'error.main' }}
                  >
                    <ListItemIcon sx={{ color: 'error.main' }}>
                      <DeleteOutlineRoundedIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>刪除景點</ListItemText>
                  </MenuItem>
                </Menu>
              </Stack>
            </Stack>

            {attraction.description ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{
                  overflowWrap: 'anywhere',
                  mt: 0.75,
                  fontSize: '0.8rem',
                  lineHeight: 1.45,
                  bgcolor: 'action.hover',
                  p: 0.6,
                  px: 0.85,
                  borderRadius: 1,
                  display: 'block',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              >
                📝 {attraction.description}
              </Typography>
            ) : null}

            <Stack direction="row" spacing={0.75} sx={{ mt: 0.75, alignItems: 'center' }}>
              <Chip
                size="small"
                label={`${attraction.duration} 分鐘`}
                sx={{ height: 22, fontSize: '0.75rem' }}
              />
              {attraction.cost > 0 ? (
                <Chip
                  size="small"
                  color="primary"
                  variant="outlined"
                  label={formatAmount(attraction.cost, currency)}
                  sx={{ height: 22, fontSize: '0.75rem' }}
                />
              ) : null}
            </Stack>
          </CardContent>
        </Card>
      </Stack>
    </Box>
  )
}
