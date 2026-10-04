import { AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import type { AssistantOperation } from '../../types'
import { itineraryTimeTargetsSchema, type ItineraryTimeTarget } from './itineraryToolSchema'

/** Recognize explicit clock expressions, leaving ambiguous AM/PM as two possibilities. */
function activityTimeExpressions(text: string): Array<{ options: string[]; activity?: string }> {
  const result: Array<{ options: string[]; activity?: string }> = []
  const pattern = /(?<!\d)(\d{1,2})(?:[:：](\d{2})|\s*[點点時时](?:\s*(半|[0-5]?\d)(?:分)?)?)(?!\d)/g
  for (const match of text.matchAll(pattern)) {
    let hour = Number(match[1])
    const minute = match[2] ? Number(match[2]) : match[3] === '半' ? 30 : Number(match[3] ?? 0)
    if (hour > 23 || minute > 59) continue
    const prefix = text.slice(Math.max(0, match.index! - 40), match.index!).split(/[，,。；;\n]/).at(-1) ?? ''
    const suffix = text.slice(match.index! + match[0].length, match.index! + match[0].length + 12)
    if (/出發|出发|起床|depart|start the day/i.test(prefix.slice(-12) + suffix)) continue
    const context = [...prefix.matchAll(/晚餐|晚飯|晚饭|晚上|下午|傍晚|午餐|中午|早餐|上午|早上|凌晨|dinner|lunch|breakfast|\b(?:am|pm)\b/gi)].at(-1)?.[0]
      ?? suffix.match(/晚餐|晚飯|晚饭|晚上|下午|傍晚|午餐|中午|早餐|上午|早上|凌晨|dinner|lunch|breakfast|\b(?:am|pm)\b/i)?.[0]
    const evening = /晚|下午|傍晚|dinner|pm/i.test(context ?? '')
    const morning = /早餐|上午|早上|凌晨|breakfast|am/i.test(context ?? '')
    const midday = /午餐|中午|lunch/i.test(context ?? '')
    const format = (value: number) => `${String(value).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    if (hour < 12 && (evening || (midday && hour < 6))) hour += 12
    else if (hour === 12 && morning) hour = 0
    const activity = /晚餐|晚飯|晚饭|dinner/i.test(context ?? '') ? 'dinner'
      : /午餐|lunch/i.test(context ?? '') ? 'lunch'
      : /早餐|breakfast/i.test(context ?? '') ? 'breakfast' : undefined
    result.push({ options: hour < 12 && !context ? [format(hour), format(hour + 12)] : [format(hour)], activity })
  }
  return result
}

export function requestedActivityTimes(text: string): string[][] {
  return activityTimeExpressions(text).map((target) => target.options)
}

export function validateRequiredItineraryTimeTargets({ text, modelMessages, targets, operations }: {
  text: string
  modelMessages: BaseMessage[]
  targets: ItineraryTimeTarget[]
  operations: AssistantOperation[]
}) {
  let expressions = activityTimeExpressions(text)
  let feedback = ''
  for (const message of modelMessages) {
    if (!ToolMessage.isInstance(message) || typeof message.content !== 'string') continue
    try {
      const value = JSON.parse(message.content) as { feedback?: unknown }
      if (typeof value.feedback === 'string' && value.feedback.trim()) feedback = value.feedback
    } catch { /* Ordinary tool text is not a proposal decision. */ }
  }
  const changes = activityTimeExpressions(feedback)
  const superseded = new Set<string>()
  if (changes.length) {
    const replaceSingle = expressions.length === 1 && changes.length === 1 && /改|調整|change|instead/i.test(feedback)
    expressions = [...expressions.filter((original) => {
      const replaced = replaceSingle || changes.some((change) => change.activity && change.activity === original.activity)
      if (replaced) original.options.forEach((time) => superseded.add(time))
      return !replaced
    }), ...changes]
  }
  const departureOnly = operations.every((operation) => operation.type === 'set_day_start_time') &&
    expressions.every((expression) => !expression.activity)
  const requested = departureOnly ? [] : expressions.map((expression) => expression.options)
  let previous: ItineraryTimeTarget[] = []
  for (const message of modelMessages) {
    if (!AIMessage.isInstance(message)) continue
    for (const call of message.tool_calls ?? []) {
      if (call.name !== 'propose_itinerary_edit') continue
      const parsed = itineraryTimeTargetsSchema.safeParse(call.args.timeTargets)
      if (parsed.success && parsed.data.length > previous.length) previous = parsed.data
    }
  }
  // A malformed earlier AM/PM interpretation must not prevent correcting the user's explicit time.
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
  const preserved = previous.filter((target) => !superseded.has(target.startTime) &&
    !requested.some((options) => options.length === 1 && Math.abs(minutes(options[0]) - minutes(target.startTime)) === 720 &&
      (previous.length === requested.length || targets.some((candidate) => candidate.startTime === options[0] &&
        (target.attractionId ? candidate.attractionId === target.attractionId : candidate.addOperationIndex === target.addOperationIndex))))
  ).map((target) => [target.startTime])
  for (const requirements of [requested, preserved]) {
    const remaining = targets.map((target) => target.startTime)
    for (const options of requirements) {
      const index = remaining.findIndex((time) => options.includes(time))
      if (index < 0) {
        throw new Error(`請在 timeTargets 保留所有本回合時間目標，缺少 ${options.join(' 或 ')}；不能省略目標逃避驗算。若時間語意不清楚，請先向使用者釐清。`)
      }
      remaining.splice(index, 1)
    }
  }
}
