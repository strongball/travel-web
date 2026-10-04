import type { TripDay } from '../../../../types/database'
import type { AssistantOperation, AssistantProposal } from '../../types'
import { itineraryTimeTargetsSchema, type ItineraryTimeTarget } from './itineraryToolSchema'

const timeMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number)
  return hours * 60 + minutes
}

/** Validate calculated arrival times, never override the continuous schedule. */
export function validateItineraryTimeTargets({
  beforeDays,
  afterDays,
  operations,
  timeTargets,
}: {
  beforeDays: TripDay[]
  afterDays: TripDay[]
  operations: AssistantOperation[]
  timeTargets: ItineraryTimeTarget[]
}) {
  const targets = itineraryTimeTargetsSchema.parse(timeTargets)
  if (targets.length === 0) return []
  const checks: NonNullable<AssistantProposal['timeChecks']> = []
  const errors: string[] = []
  for (const day of afterDays) {
    if (day.startTime !== beforeDays.find((before) => before.id === day.id)?.startTime) {
      errors.push('有時間目標時請維持當天出發時間，調整前面的停留時間與景點安排')
    }
  }
  for (const target of targets) {
    if ((target.attractionId !== undefined) === (target.addOperationIndex !== undefined)) {
      errors.push('時間目標必須以 attractionId 或 addOperationIndex 擇一指定')
      continue
    }
    const operation = target.addOperationIndex === undefined ? undefined : operations[target.addOperationIndex]
    if (target.addOperationIndex !== undefined && operation?.type !== 'add_attraction') {
      errors.push(`時間目標 operations[${target.addOperationIndex}] 必須是新增景點操作`)
      continue
    }
    const attractionId = target.attractionId ?? (operation?.type === 'add_attraction' ? operation.attraction.id : undefined)
    const day = afterDays.find((candidate) => candidate.attractions.some((item) => item.id === attractionId))
    const attraction = day?.attractions.find((item) => item.id === attractionId)
    if (!day || !attraction) {
      errors.push(`找不到時間目標景點 ${attractionId}，不得移除目標活動`)
      continue
    }
    // Accumulate minutes instead of reading a wrapped HH:mm (e.g. after midnight).
    let arrival = timeMinutes(day.startTime?.slice(11, 16) ?? '09:00')
    for (const item of day.attractions) {
      arrival += item.travelTime ?? 0
      if (item.id === attractionId) break
      arrival += Math.max(item.duration, 0)
    }
    const difference = arrival - timeMinutes(target.startTime)
    const actual = `${String(Math.floor(arrival / 60)).padStart(2, '0')}:${String(arrival % 60).padStart(2, '0')}`
    checks.push({ attractionId: attraction.id, name: attraction.name, targetStartTime: target.startTime, actualStartTime: actual, differenceMinutes: difference })
    if (Math.abs(difference) > 15) {
      errors.push(`${attraction.name} 目標 ${target.startTime}，實際開始 ${actual}，差距 ${difference > 0 ? '+' : ''}${difference} 分鐘（允許前後 15 分鐘）`)
    }
  }
  if (errors.length > 0) {
    throw new Error(`行程時間目標未達成：${errors.join('；')}。請以合理停留時間及增減、移動景點修正；不要虛增交通或新增等待項目，無法合理達成時請向使用者釐清。`)
  }
  return checks
}
