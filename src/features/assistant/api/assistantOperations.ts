import { z } from 'zod'
import type { Itinerary } from '../../../types/database'
import type { AssistantOperation } from '../types'
import {
  itineraryOperationSchema,
  normalizeAttractionDraft,
  normalizeTimeString,
} from '../tools/itinerary/itineraryToolSchema'
import { todoOperationSchema } from '../tools/todo/todoToolSchema'

export const assistantOperationSchema = z.union([
  itineraryOperationSchema,
  todoOperationSchema,
])

export const assistantOperationsSchema = z.array(assistantOperationSchema).min(1)

export const parseAssistantOperations = (value: unknown): AssistantOperation[] => {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Proposal requires operations')
  const parsed = assistantOperationsSchema.safeParse(value)
  if (!parsed.success) {
    const errorDetails = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
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

export function validateAssistantOperations(
  itinerary: Itinerary,
  operations: AssistantOperation[],
) {
  const days = new Map((itinerary.days ?? []).map((day) => [
    day.id,
    new Set(day.attractions.map((item) => item.id)),
  ] as const))
  const attractionToDay = new Map(
    (itinerary.days ?? []).flatMap((day) => day.attractions.map((item) => [item.id, day.id] as const)),
  )

  const requireDay = (dayId: string) => {
    if (!days.has(dayId)) throw new Error(`找不到日期 ${dayId}`)
    return days.get(dayId)!
  }

  const requireAttraction = (attractionId: string) => {
    const dayId = attractionToDay.get(attractionId)
    if (!dayId) throw new Error(`找不到景點 ${attractionId}`)
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
        throw new Error(`日期 ${operation.dayId} 的景點排序資料不完整`)
      }
      continue
    }
  }
}
