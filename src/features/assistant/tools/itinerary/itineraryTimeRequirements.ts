import { ToolMessage, type BaseMessage } from '@langchain/core/messages'
import type { AssistantOperation, AssistantProposal } from '../../types'
import type { ItineraryTimeTarget } from './itineraryToolSchema'

type TimeExpression = { options: string[]; activity?: string; windows?: Array<{ startTime: string; endTime: string }> }
const inWindow = (expression: TimeExpression, time: string) => expression.windows?.some((window) => time >= window.startTime && time <= window.endTime) ?? false


/** Recognize explicit clock expressions, leaving ambiguous AM/PM as two possibilities. */
function activityTimeExpressions(text: string): TimeExpression[] {
  const result: TimeExpression[] = []
  text = text.replace(/(\d{1,2})(?=\s*[-–—~～至到]\s*\d{1,2}\s*[點点時时])/g, '$1點')
  const pattern = /(?<!\d)(\d{1,2})(?:[:：](\d{2})|\s*[點点時时](?:\s*(半|[0-5]?\d)(?:分)?)?)(?!\d)/g
  const matches = [...text.matchAll(pattern)]
  let previousMatch: RegExpMatchArray | undefined
  for (const match of matches) {
    let hour = Number(match[1])
    const minute = match[2] ? Number(match[2]) : match[3] === '半' ? 30 : Number(match[3] ?? 0)
    if (hour > 23 || minute > 59) continue
    const prefix = text.slice(Math.max(0, match.index! - 40), match.index!).split(/[，,。；;\n]/).at(-1) ?? ''
    const suffix = text.slice(match.index! + match[0].length, match.index! + match[0].length + 12)
    if (/出發|出发|起床|depart|start the day/i.test(prefix.slice(-12) + suffix)) continue
    const context = [...prefix.matchAll(/晚餐|晚飯|晚饭|晚上|下午|傍晚|午餐|中午|早餐|上午|早上|凌晨|dinner|lunch|breakfast|\b(?:am|pm)\b/gi)].at(-1)?.[0]
      ?? suffix.match(/晚餐|晚飯|晚饭|晚上|下午|傍晚|午餐|中午|早餐|上午|早上|凌晨|dinner|lunch|breakfast|\b(?:am|pm)\b/i)?.[0]
    const evening = /晚|下午|傍晚|dinner|pm/i.test(context ?? '')
    const midday = /午餐|中午|lunch/i.test(context ?? '')
    const format = (value: number) => `${String(value).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    if (hour < 12 && (evening || (midday && hour < 6))) hour += 12
    else if (hour === 12 && /凌晨|^am$/i.test(context ?? '')) hour = 0
    const activity = /晚餐|晚飯|晚饭|dinner/i.test(context ?? '') ? 'dinner'
      : /午餐|lunch/i.test(context ?? '') ? 'lunch'
      : /早餐|breakfast/i.test(context ?? '') ? 'breakfast' : undefined
    const options = hour < 12 && !context ? [format(hour), format(hour + 12)] : [format(hour)]
    const previous = result.at(-1)
    const connector = previousMatch ? text.slice(previousMatch.index! + previousMatch[0].length, match.index) : ''
    if (previous && /^\s*[-–—~～至到]\s*$/.test(connector)) {
      const windows = previous.options.flatMap((startTime) => options
        .filter((endTime) => endTime >= startTime && (previous.options.length === 1 && options.length === 1 || Number(endTime.slice(0, 2)) - Number(startTime.slice(0, 2)) < 12))
        .map((endTime) => ({ startTime, endTime })))
      if (windows.length) {
        previous.windows = windows
        previous.options = windows.flatMap((window) => [window.startTime, window.endTime])
      } else result.push({ options, activity })
    } else result.push({ options, activity })
    previousMatch = match
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
  const supersededWindows: TimeExpression[] = []
  if (changes.length) {
    const replaceSingle = expressions.length === 1 && changes.length === 1 && /改|調整|change|instead/i.test(feedback)
    expressions = [...expressions.filter((original) => {
      const replaced = replaceSingle || changes.some((change) => change.activity && change.activity === original.activity)
      if (replaced) {
        original.options.forEach((time) => superseded.add(time))
        supersededWindows.push(original)
      }
      return !replaced
    }), ...changes]
  }
  const departureOnly = operations.every((operation) => operation.type === 'set_day_start_time') &&
    expressions.every((expression) => !expression.activity)
  const requested = departureOnly ? [] : expressions
  const normalizedTargets = targets.map((target) => ({ ...target }))
  // Failed model guesses are not user requirements. Only preserve reviewed proposal goals.
  const reviewed = modelMessages.filter(ToolMessage.isInstance).findLast((message) =>
    (message.artifact as { proposal?: AssistantProposal } | undefined)?.proposal?.timeChecks?.length)
  const proposal = reviewed?.artifact as { proposal?: AssistantProposal } | undefined
  const previous: ItineraryTimeTarget[] = (proposal?.proposal?.timeChecks ?? []).map((check) => ({
    attractionId: check.attractionId, startTime: check.targetStartTime, endTime: check.targetEndTime,
  }))
  // A malformed earlier AM/PM interpretation must not prevent correcting the user's explicit time.
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
  const preserved: TimeExpression[] = previous.filter((target) => !superseded.has(target.startTime) &&
    !supersededWindows.some((expression) => inWindow(expression, target.startTime)) &&
    !requested.some(({ options }) => options.length === 1 && Math.abs(minutes(options[0]) - minutes(target.startTime)) === 720 &&
      (previous.length === requested.length || targets.some((candidate) => candidate.startTime === options[0] &&
        (target.attractionId ? candidate.attractionId === target.attractionId : candidate.addOperationIndex === target.addOperationIndex))))
  ).filter((target) => !requested.some((expression) => {
    if (!expression.windows) return false
    const oppositeTime = `${String(Math.floor(((minutes(target.startTime) + 720) % 1440) / 60)).padStart(2, '0')}:${target.startTime.slice(3)}`
    return inWindow(expression, target.startTime) || inWindow(expression, oppositeTime) || targets.some((candidate) =>
      (target.attractionId !== undefined ? candidate.attractionId === target.attractionId : candidate.addOperationIndex === target.addOperationIndex) &&
      inWindow(expression, candidate.startTime))
  }))
    .map((target): TimeExpression => target.endTime
      ? { options: [target.startTime, target.endTime], windows: [{ startTime: target.startTime, endTime: target.endTime }] }
      : { options: [target.startTime] })
  for (const requirements of [preserved, requested]) {
    const remaining = targets.map((target, index) => ({ target, index }))
    for (const expression of requirements) {
      const index = remaining.findIndex(({ target }) => expression.windows
        ? inWindow(expression, target.startTime)
        : expression.options.includes(target.startTime))
      if (index < 0) {
        const required = expression.windows
          ? expression.windows.map((window) => `${window.startTime}～${window.endTime}`).join(' 或 ')
          : expression.options.join(' 或 ')
        throw new Error(`請在 timeTargets 保留所有本回合時間目標，缺少 ${required}；不能省略目標逃避驗算。若時間語意不清楚，請先向使用者釐清。`)
      }
      const match = remaining.splice(index, 1)[0]
      const window = expression.windows?.find((window) => match.target.startTime >= window.startTime && match.target.startTime <= window.endTime)
      if (window) normalizedTargets[match.index] = { ...match.target, ...window }
      else {
        normalizedTargets[match.index] = { ...match.target }
        delete normalizedTargets[match.index].endTime
      }
    }
  }
  return normalizedTargets
}
