import { z } from 'zod'
import type { Itinerary } from '../../../types/database'
import type { AssistantOperation } from '../types'
import {
  setDayStartTimeOperationSchema,
  addAttractionOperationSchema,
  updateAttractionOperationSchema,
  removeAttractionOperationSchema,
  moveAttractionOperationSchema,
  reorderAttractionsOperationSchema,
  normalizeAttractionDraft,
  normalizeTimeString,
} from '../tools/itinerary/itineraryToolSchema'
import {
  addTodoOperationSchema,
  addTodoCategoryOperationSchema,
} from '../tools/todo/todoToolSchema'

export const assistantOperationSchema = z.discriminatedUnion('type', [
  setDayStartTimeOperationSchema,
  addAttractionOperationSchema,
  updateAttractionOperationSchema,
  removeAttractionOperationSchema,
  moveAttractionOperationSchema,
  reorderAttractionsOperationSchema,
  addTodoOperationSchema,
  addTodoCategoryOperationSchema,
])

export const assistantOperationsSchema = z.array(assistantOperationSchema).min(1)

export const parseAssistantOperations = (value: unknown): AssistantOperation[] => {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Proposal requires operations')
  const parsed = assistantOperationsSchema.safeParse(value)
  if (!parsed.success) {
    const errorDetails = parsed.error.issues.map((i) => {
      const path = i.path.length > 0 ? i.path.join('.') : 'root'
      return `${path}: ${i.message}`
    }).join('; ')
    throw new Error(`Unsupported assistant operation: ${errorDetails}`)
  }
  return parsed.data.map((op): AssistantOperation => {
    switch (op.type) {
      case 'set_day_start_time':
        return {
          type: 'set_day_start_time',
          dayId: op.dayId,
          startTime: normalizeTimeString(op.startTime),
        }
      case 'add_attraction': {
        const draftInput = op.attraction ?? {
          name: op.name ?? '新景點',
          description: op.description ?? '',
          cost: op.cost ?? 0,
          duration: op.duration ?? 60,
          transportMode: op.transportMode ?? null,
          travelTime: op.travelTime ?? null,
          locationName: op.locationName ?? null,
        }
        return {
          type: 'add_attraction',
          dayId: op.dayId,
          attraction: normalizeAttractionDraft(draftInput),
          ...(typeof op.index === 'number' ? { index: op.index } : {}),
        }
      }
      case 'update_attraction': {
        const changes = op.changes ?? {
          ...(op.name !== undefined ? { name: op.name } : {}),
          ...(op.description !== undefined ? { description: op.description } : {}),
          ...(op.cost !== undefined ? { cost: op.cost } : {}),
          ...(op.duration !== undefined ? { duration: op.duration } : {}),
          ...(op.transportMode !== undefined ? { transportMode: op.transportMode } : {}),
          ...(op.travelTime !== undefined ? { travelTime: op.travelTime } : {}),
          ...(op.locationName !== undefined ? { locationName: op.locationName } : {}),
        }
        return {
          type: 'update_attraction',
          attractionId: op.attractionId,
          changes,
        }
      }
      case 'remove_attraction':
        return {
          type: 'remove_attraction',
          attractionId: op.attractionId,
        }
      case 'move_attraction':
        return {
          type: 'move_attraction',
          attractionId: op.attractionId,
          targetDayId: op.targetDayId,
          index: op.index,
        }
      case 'reorder_attractions':
        return {
          type: 'reorder_attractions',
          dayId: op.dayId,
          attractionIds: op.attractionIds,
        }
      case 'add_todo':
        return {
          type: 'add_todo',
          title: op.title,
          ...(op.category !== undefined ? { category: op.category } : {}),
        }
      case 'add_todo_category':
        return {
          type: 'add_todo_category',
          name: op.name,
        }
    }
  })
}

export function resolveDayId(days: Array<{ id: string }>, dayId: string): string {
  if (days.some((d) => d.id === dayId)) return dayId
  const match = dayId.match(/^day-(\d+)$/i)
  if (match) {
    const idx = parseInt(match[1], 10) - 1
    if (days[idx]) return days[idx].id
  }
  const numMatch = dayId.match(/^(\d+)$/)
  if (numMatch) {
    const idx = parseInt(numMatch[1], 10) - 1
    if (days[idx]) return days[idx].id
  }
  if (days.length === 1) return days[0].id
  return dayId
}

export function normalizeOperationDayIds(
  operations: AssistantOperation[],
  days: Array<{ id: string }>,
): AssistantOperation[] {
  if (!days || days.length === 0) return operations
  return operations.map((op) => {
    switch (op.type) {
      case 'set_day_start_time':
        return { ...op, dayId: resolveDayId(days, op.dayId) }
      case 'add_attraction':
        return { ...op, dayId: resolveDayId(days, op.dayId) }
      case 'move_attraction':
        return { ...op, targetDayId: resolveDayId(days, op.targetDayId) }
      case 'reorder_attractions':
        return { ...op, dayId: resolveDayId(days, op.dayId) }
      default:
        return op
    }
  })
}

export function validateAssistantOperations(
  itinerary: Itinerary,
  operations: AssistantOperation[],
) {
  const itineraryDays = itinerary.days ?? []
  const days = new Map(itineraryDays.map((day) => [
    day.id,
    new Set(day.attractions.map((item) => item.id)),
  ] as const))
  const attractionToDay = new Map(
    itineraryDays.flatMap((day) => day.attractions.map((item) => [item.id, day.id] as const)),
  )

  const requireDay = (dayId: string) => {
    const resolvedId = resolveDayId(itineraryDays, dayId)
    if (!days.has(resolvedId)) throw new Error(`找不到日期 ${dayId}。可用日期：${itineraryDays.map((day, index) => `第 ${index + 1} 天 = ${day.id}`).join("；")}。請使用讀取結果中的 Day ID。`)
    return days.get(resolvedId)!
  }

  const requireAttraction = (attractionId: string) => {
    const dayId = attractionToDay.get(attractionId)
    if (!dayId) throw new Error(`找不到景點 ${attractionId}。請使用本回合 view_itinerary 回傳的景點 ID；新景點請用 add_attraction 的 index 放到指定位置，不要猜測新增 ID。`)
    return dayId
  }

  for (const operation of operations) {
    if (operation.type === 'set_day_start_time') {
      requireDay(operation.dayId)
      continue
    }
    if (operation.type === 'add_attraction') {
      const dayAttractions = requireDay(operation.dayId)
      const attractionId = operation.attraction.id
      if (attractionToDay.has(attractionId)) throw new Error(`景點 ID 已存在 ${attractionId}`)
      dayAttractions.add(attractionId)
      attractionToDay.set(attractionId, operation.dayId)
      continue
    }
    if (operation.type === 'update_attraction') {
      requireAttraction(operation.attractionId)
      continue
    }
    if (operation.type === 'remove_attraction') {
      const dayId = requireAttraction(operation.attractionId)
      days.get(dayId)!.delete(operation.attractionId)
      attractionToDay.delete(operation.attractionId)
      continue
    }
    if (operation.type === 'move_attraction') {
      const sourceDayId = requireAttraction(operation.attractionId)
      const destination = requireDay(operation.targetDayId)
      days.get(sourceDayId)!.delete(operation.attractionId)
      destination.add(operation.attractionId)
      attractionToDay.set(operation.attractionId, operation.targetDayId)
      continue
    }
    if (operation.type === 'reorder_attractions') {
      const dayAttractions = requireDay(operation.dayId)
      const requestedIds = new Set(operation.attractionIds)
      if (requestedIds.size !== operation.attractionIds.length ||
        requestedIds.size !== dayAttractions.size ||
        operation.attractionIds.some((id) => !dayAttractions.has(id))) {
        throw new Error(`日期 ${operation.dayId} 的景點排序資料不完整。attractionIds 必須包含操作執行到此處時的全部景點 ID，且不得重複：${[...dayAttractions].join(", ")}。新增景點請用 index 定位，避免引用尚未取得的 ID。`)
      }
      continue
    }
  }
}
