import { Box, Chip, Stack, Typography } from '@mui/material'
import type { AssistantProposal } from '../../types'
import type { Attraction, TripDay } from '../../../../types/database'

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

function itineraryChanges(beforeDays: TripDay[], afterDays: TripDay[]): string[] {
  const before = new Map(beforeDays.flatMap((day) => day.attractions).map((item) => [item.id, item]))
  const after = new Map(afterDays.flatMap((day) => day.attractions).map((item) => [item.id, item]))
  const changes: string[] = []
  for (const item of before.values()) {
    if (!after.has(item.id)) changes.push(`移除：${item.name}`)
  }
  for (const item of after.values()) {
    const original = before.get(item.id)
    if (!original) { changes.push(`新增：${item.name}（停留 ${item.duration} 分鐘）`); continue }
    const fields: Array<[keyof Attraction, string]> = [
      ['duration', '停留'], ['travelTime', '交通'],
    ]
    if (original.name !== item.name) changes.push(`名稱：${original.name} → ${item.name}`)
    for (const [key, label] of fields) {
      if (original[key] !== item[key]) changes.push(`${item.name} ${label}：${original[key] ?? 0} → ${item[key] ?? 0} 分鐘`)
    }
    if (original.dayId !== item.dayId) changes.push(`移動日期：${item.name}`)
    else {
      const oldOrder = beforeDays.find((day) => day.id === item.dayId)?.attractions.map((attraction) => attraction.id) ?? []
      const newOrder = afterDays.find((day) => day.id === item.dayId)?.attractions.map((attraction) => attraction.id) ?? []
      const commonOld = oldOrder.filter((id) => newOrder.includes(id))
      const commonNew = newOrder.filter((id) => oldOrder.includes(id))
      if (commonOld.indexOf(item.id) !== commonNew.indexOf(item.id)) changes.push(`移動順序：${item.name}（第 ${newOrder.indexOf(item.id) + 1} 站）`)
    }
    if (original.startTime !== item.startTime) changes.push(`${item.name} 開始：${original.startTime?.slice(11, 16) ?? '未排'} → ${item.startTime?.slice(11, 16) ?? '未排'}`)
  }
  return changes
}

export function ItineraryProposalView({
  afterDays,
  beforeDays,
  timeChecks = [],
}: {
  afterDays: TripDay[]
  beforeDays: TripDay[]
  timeChecks?: AssistantProposal['timeChecks']
}) {
  if (afterDays.length === 0 && timeChecks.length === 0) return null

  return (
    <Stack spacing={1.5}>
      {timeChecks.length > 0 ? <Box sx={{ p: 1.5, bgcolor: 'surfaceSubtle', borderRadius: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>時間安排參考</Typography>
        {timeChecks.map((check, index) => <Typography key={index} variant="body2" sx={{ mt: 0.5 }}>
          {check.name}：目標 {check.targetStartTime}{check.targetEndTime ? `～${check.targetEndTime}` : ''} → 預計 {check.actualStartTime}
          （{check.differenceMinutes === 0 ? check.targetEndTime ? '區間內' : '準時' : `${check.differenceMinutes < 0 ? '提早' : '延後'} ${Math.abs(check.differenceMinutes)} 分鐘`}）
        </Typography>)}
      </Box> : null}
      {afterDays.length > 0 ? <Box sx={{ p: 1.5, bgcolor: 'surfaceSubtle', borderRadius: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>本次調整</Typography>
        {itineraryChanges(beforeDays, afterDays).map((change, index) => (
          <Typography key={index} variant="body2" sx={{ mt: 0.5 }}>{change}</Typography>
        ))}
      </Box> : null}
      {afterDays.map((after) => {
        const before = beforeDays.find((day) => day.id === after.id)
        return (
          <Box
            key={after.id}
            sx={{
              p: 1.5,
              bgcolor: 'background.paper',
              borderRadius: 2.5,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Chip
              size="small"
              label={dateLabel(after)}
              sx={{
                fontWeight: 850,
                bgcolor: 'surfaceSubtle',
                color: 'primary.main',
                mb: 1,
              }}
            />
            <Stack spacing={0.75}>
              <Box sx={{ p: 1, borderRadius: 2, bgcolor: 'action.hover' }}>
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
                  bgcolor: 'surfaceSubtle',
                  border: '1px solid',
                  borderColor: 'surfaceSubtleBorder',
                }}
              >
                <Typography
                  variant="caption"
                  sx={{ display: 'block', fontWeight: 900, color: 'primary.main', mb: 0.2 }}
                >
                  建議新安排：
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontWeight: 650,
                    color: 'primary.main',
                    fontSize: '0.86rem',
                  }}
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
