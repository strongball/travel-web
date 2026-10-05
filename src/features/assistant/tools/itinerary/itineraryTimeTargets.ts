import type { TripDay } from '../../../../types/database'
import type { AssistantOperation, AssistantProposal } from '../../types'
import { itineraryTimeTargetsSchema, type ItineraryTimeTarget } from './itineraryToolSchema'

const timeMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

/** Report calculated arrival times without rejecting a proposal for a time difference. */
export function calculateItineraryTimeChecks({
  afterDays,
  operations,
  timeTargets,
}: {
  afterDays: TripDay[]
  operations: AssistantOperation[]
  timeTargets: ItineraryTimeTarget[]
}) {
  const targets = itineraryTimeTargetsSchema.parse(timeTargets)
  if (targets.length === 0) return []
  const checks: NonNullable<AssistantProposal['timeChecks']> = []
  const errors: string[] = []
  for (const target of targets) {
    const operation = target.addOperationIndex === undefined ? undefined : operations[target.addOperationIndex]
    if (target.addOperationIndex !== undefined && operation?.type !== 'add_attraction') {
      errors.push(`時間目標 operations[${target.addOperationIndex}] 必須是新增景點操作`)
      continue
    }
    const attractionId = target.attractionId ?? (operation?.type === 'add_attraction' ? operation.attraction.id : undefined)
    const day = afterDays.find((candidate) => candidate.attractions.some((item) => item.id === attractionId))
    const attraction = day?.attractions.find((item) => item.id === attractionId)
    if (!day || !attraction) {
      errors.push(`找不到時間目標景點 ${attractionId}，請確認目標參照`)
      continue
    }
    // Accumulate minutes instead of reading a wrapped HH:mm (e.g. after midnight).
    let arrival = timeMinutes(day.startTime?.slice(11, 16) ?? '09:00')
    for (const item of day.attractions) {
      arrival += item.travelTime ?? 0
      if (item.id === attractionId) break
      arrival += Math.max(item.duration, 0)
    }
    const difference = target.endTime
      ? arrival < timeMinutes(target.startTime) ? arrival - timeMinutes(target.startTime)
        : arrival > timeMinutes(target.endTime) ? arrival - timeMinutes(target.endTime) : 0
      : arrival - timeMinutes(target.startTime)
    const actual = `${String(Math.floor(arrival / 60)).padStart(2, '0')}:${String(arrival % 60).padStart(2, '0')}`
    checks.push({ attractionId: attraction.id, name: attraction.name, targetStartTime: target.startTime, actualStartTime: actual, differenceMinutes: difference })
    if (target.endTime) checks.at(-1)!.targetEndTime = target.endTime

  }
  if (errors.length > 0) {
    throw new Error(`時間目標參照無效：${errors.join('；')}。請使用正確的景點 ID 或新增操作位置。`)
  }
  return checks
}
