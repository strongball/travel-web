import { useState } from 'react'
import CheckRoundedIcon from '@mui/icons-material/CheckRounded'
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded'
import ShareRoundedIcon from '@mui/icons-material/ShareRounded'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import type { Itinerary, TripDay } from '../../../../types/database'
import { formatDate } from '../../travelWorkspaceUtils'

interface ItineraryShareDialogProps {
  open: boolean
  itinerary: Itinerary
  activeDayIndex: number
  onClose: () => void
}

function generateShareText(
  itinerary: Itinerary,
  mode: 'day' | 'all',
  activeDayIndex: number,
): string {
  const days = itinerary.days ?? []
  const targetDays: { day: TripDay; dayNumber: number }[] =
    mode === 'day'
      ? days[activeDayIndex]
        ? [{ day: days[activeDayIndex], dayNumber: activeDayIndex + 1 }]
        : []
      : days.map((day, idx) => ({ day, dayNumber: idx + 1 }))

  let result = `✈️ 【${itinerary.title || '我的旅遊行程'}】\n`
  if (itinerary.startDate) {
    result += `📅 日期：${formatDate(itinerary.startDate)} ~ ${formatDate(itinerary.endDate)}\n`
  }
  result += `━━━━━━━━━━━━━━━━━━━━━\n`

  targetDays.forEach(({ day, dayNumber }) => {
    result += `\n📍 DAY ${dayNumber} ${day.date ? `(${formatDate(day.date)})` : ''}\n`
    if (day.startTime) {
      result += `⏰ 出發時間：${day.startTime.slice(11, 16)}\n`
    }
    if (!day.attractions || day.attractions.length === 0) {
      result += `   (此日尚無安排景點)\n`
    } else {
      day.attractions.forEach((attr, idx) => {
        const timeStr = attr.startTime ? ` [${attr.startTime.slice(11, 16)}]` : ''
        result += `\n${idx + 1}. ${attr.name}${timeStr} (停留約 ${attr.duration} 分鐘)\n`
        if (attr.locationName) {
          result += `   📍 地點：${attr.locationName}\n`
        }
        if (attr.description) {
          result += `   📝 備註：${attr.description}\n`
        }
        if (attr.cost > 0) {
          result += `   💰 費用：${attr.cost} ${itinerary.currency}\n`
        }
      })
    }
    result += `\n`
  })

  result += `━━━━━━━━━━━━━━━━━━━━━\n來自 Travel Web 旅程規劃`
  return result.trim()
}

export function ItineraryShareDialog({
  open,
  itinerary,
  activeDayIndex,
  onClose,
}: ItineraryShareDialogProps) {
  const [mode, setMode] = useState<'day' | 'all'>('day')
  const [copied, setCopied] = useState(false)

  const shareText = generateShareText(itinerary, mode, activeDayIndex)
  const canNativeShare = typeof navigator !== 'undefined' && 'share' in navigator

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText)
      setCopied(true)
    } catch {
      // fallback
    }
  }

  const handleNativeShare = async () => {
    if (!canNativeShare) return
    try {
      await navigator.share({
        title: itinerary.title || '旅遊行程',
        text: shareText,
      })
    } catch {
      // user cancelled
    }
  }

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <ShareRoundedIcon color="primary" />
            <Typography variant="h6" sx={{ fontWeight: 900 }}>
              分享 / 匯出文字行程
            </Typography>
          </Stack>
        </DialogTitle>

        <DialogContent dividers>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tabs
              value={mode}
              onChange={(_, val) => setMode(val as 'day' | 'all')}
              textColor="primary"
              indicatorColor="primary"
            >
              <Tab value="day" label={`當日行程 (Day ${activeDayIndex + 1})`} />
              <Tab value="all" label={`完整行程 (共 ${itinerary.days?.length ?? 0} 天)`} />
            </Tabs>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            可直接複製下方排版好的行程文字，傳送給旅伴或貼至 LINE / 備忘錄：
          </Typography>

          <TextField
            multiline
            fullWidth
            minRows={8}
            maxRows={14}
            value={shareText}
            slotProps={{
              input: {
                readOnly: true,
                sx: {
                  fontFamily: 'monospace',
                  fontSize: '0.84rem',
                  bgcolor: 'action.hover',
                },
              },
            }}
          />
        </DialogContent>

        <DialogActions sx={{ px: 2.5, py: 1.5 }}>
          <Button onClick={onClose}>關閉</Button>
          {canNativeShare ? (
            <Button
              variant="outlined"
              startIcon={<ShareRoundedIcon />}
              onClick={handleNativeShare}
            >
              系統分享
            </Button>
          ) : null}
          <Button
            variant="contained"
            startIcon={copied ? <CheckRoundedIcon /> : <ContentCopyRoundedIcon />}
            onClick={handleCopy}
            color={copied ? 'success' : 'primary'}
          >
            {copied ? '已複製！' : '複製行程文字'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={copied}
        autoHideDuration={2500}
        onClose={() => setCopied(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" sx={{ width: '100%', fontWeight: 700 }}>
          行程文字已成功複製到剪貼簿！
        </Alert>
      </Snackbar>
    </>
  )
}
