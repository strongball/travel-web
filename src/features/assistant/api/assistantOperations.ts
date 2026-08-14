import type { Itinerary } from '../../../types/database'
import type { AssistantOperation } from '../types'
import {
  assistantOperationsSchema,
  normalizeAttractionDraft,
  normalizeTimeString,
} from './assistantSchemas'

export const parseAssistantOperations = (value: unknown): AssistantOperation[] => {
  if (!Array.isArray(value) || value.length === 0) throw new Error('Proposal requires operations')
  const parsed = assistantOperationsSchema.safeParse(value)
  if (!parsed.success) throw new Error('Unsupported assistant operation')
  return parsed.data.map((op): AssistantOperation => {
    switch (op.type) {
      case 'set_day_start_time':
        if (!op.dayId || !op.startTime) throw new Error('set_day_start_time requires dayId and startTime')
        return {
          type: 'set_day_start_time',
          dayId: op.dayId,
          startTime: normalizeTimeString(op.startTime),
        }
      case 'add_attraction': {
        if (!op.dayId) throw new Error('add_attraction requires dayId')
        const attractionDraft = op.attraction || {
          name: op.name || op.title || '',
          description: op.description || '',
          duration: op.duration || 60,
          transportMode: (op.transportMode as 'driving' | 'walking' | 'transit' | 'bicycling' | null | undefined) ?? null,
          travelTime: op.travelTime ?? null,
          locationName: op.locationName ?? null,
          cost: op.cost ?? 0,
        }
        if (!attractionDraft.name) throw new Error('add_attraction requires attraction name')
        return {
          type: 'add_attraction',
          dayId: op.dayId,
          attraction: normalizeAttractionDraft(attractionDraft),
          ...(typeof op.index === 'number' ? { index: op.index } : {}),
        }
      }
      case 'update_attraction': {
        if (!op.attractionId) throw new Error('update_attraction requires attractionId')
        const changes = op.changes || {
          ...(op.name ? { name: op.name } : {}),
          ...(op.description !== undefined ? { description: op.description } : {}),
          ...(op.duration ? { duration: op.duration } : {}),
          ...(op.transportMode !== undefined ? { transportMode: op.transportMode as 'driving' | 'walking' | 'transit' | 'bicycling' | null } : {}),
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
        if (!op.attractionId) throw new Error('remove_attraction requires attractionId')
        return {
          type: 'remove_attraction',
          attractionId: op.attractionId,
        }
      case 'move_attraction':
        if (!op.attractionId || !op.targetDayId || typeof op.index !== 'number') {
          throw new Error('move_attraction requires attractionId, targetDayId, and index')
        }
        return {
          type: 'move_attraction',
          attractionId: op.attractionId,
          targetDayId: op.targetDayId,
          index: op.index,
        }
      case 'reorder_attractions':
        if (!op.dayId || !op.attractionIds) throw new Error('reorder_attractions requires dayId and attractionIds')
        return {
          type: 'reorder_attractions',
          dayId: op.dayId,
          attractionIds: op.attractionIds,
        }
      case 'add_todo':
        if (!op.title) throw new Error('add_todo requires title')
        return {
          type: 'add_todo',
          title: op.title,
          ...(op.category ? { category: op.category } : {}),
        }
      case 'add_todo_category':
        if (!op.name) throw new Error('add_todo_category requires name')
        return {
          type: 'add_todo_category',
          name: op.name,
        }
    }
  })
}

export const normalizeAssistantOperations = (operations: unknown): AssistantOperation[] =>
  parseAssistantOperations(operations)

export function validateAssistantOperations(
  itinerary: Itinerary,
  operations: AssistantOperation[],
) {
  const dayIds = new Set((itinerary.days ?? []).map((day) => day.id))
  const attractionIds = new Set(
    (itinerary.days ?? []).flatMap((day) => day.attractions.map((item) => item.id)),
  )

  for (const operation of operations) {
    if (operation.type === 'set_day_start_time' && !dayIds.has(operation.dayId)) {
      throw new Error(`找不到日期 ${operation.dayId}`)
    }
    if (operation.type === 'add_attraction' && !dayIds.has(operation.dayId)) {
      throw new Error(`找不到日期 ${operation.dayId}`)
    }
    if (operation.type === 'update_attraction' && !attractionIds.has(operation.attractionId)) {
      throw new Error(`找不到景點 ${operation.attractionId}`)
    }
    if (operation.type === 'remove_attraction' && !attractionIds.has(operation.attractionId)) {
      throw new Error(`找不到景點 ${operation.attractionId}`)
    }
    if (operation.type === 'move_attraction') {
      if (!attractionIds.has(operation.attractionId)) throw new Error(`找不到景點 ${operation.attractionId}`)
      if (!dayIds.has(operation.targetDayId)) throw new Error(`找不到目的日期 ${operation.targetDayId}`)
    }
    if (operation.type === 'reorder_attractions' && !dayIds.has(operation.dayId)) {
      throw new Error(`找不到日期 ${operation.dayId}`)
    }
  }
}
