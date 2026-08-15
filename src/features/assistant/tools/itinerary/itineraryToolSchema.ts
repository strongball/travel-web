import { z } from 'zod'

const timeValuePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/

export const timeSchema = z.string().trim().regex(
  timeValuePattern,
  '必須是有效的 24 小時 HH:mm',
)

export function normalizeTimeString(value: string): string {
  return timeSchema.parse(value)
}

const nonEmptyIdSchema = z.string().trim().min(1)
const nonNegativeMinutesSchema = z.number().finite().int().min(0).max(1_440)
const durationMinutesSchema = z.number().finite().int().min(1).max(1_440)
const transportModeSchema = z.enum(['driving', 'walking', 'transit', 'bicycling'])
const nonEmptyTextSchema = z.string().trim().min(1)

export const assistantAttractionDraftSchema = z.object({
  name: nonEmptyTextSchema,
  duration: durationMinutesSchema,
  transportMode: transportModeSchema.nullable().optional(),
  travelTime: nonNegativeMinutesSchema.nullable().optional(),
  locationName: nonEmptyTextSchema.nullable().optional(),
})

export type AssistantAttractionDraftInput = z.infer<typeof assistantAttractionDraftSchema>

export function normalizeAttractionDraft(value: AssistantAttractionDraftInput) {
  return {
    id: crypto.randomUUID(),
    name: value.name.trim(),
    description: '',
    cost: 0,
    latitude: null,
    longitude: null,
    duration: value.duration,
    transportMode: value.transportMode ?? null,
    travelTime: value.travelTime ?? null,
    placeId: null,
    locationName: value.locationName ?? null,
  }
}

export const attractionChangesSchema = z.object({
  name: nonEmptyTextSchema.optional(),
  description: z.string().trim().optional(),
  duration: durationMinutesSchema.optional(),
  transportMode: transportModeSchema.nullable().optional(),
  travelTime: nonNegativeMinutesSchema.nullable().optional(),
  locationName: nonEmptyTextSchema.nullable().optional(),
})

const operationType = <T extends string>(value: T) => z.enum([value])

export const setDayStartTimeOperationSchema = z.object({
  type: operationType('set_day_start_time'),
  dayId: nonEmptyIdSchema,
  startTime: timeSchema,
})

export const addAttractionOperationSchema = z.object({
  type: operationType('add_attraction'),
  dayId: nonEmptyIdSchema,
  attraction: assistantAttractionDraftSchema.optional(),
  name: nonEmptyTextSchema.optional(),
  duration: durationMinutesSchema.optional(),
  transportMode: transportModeSchema.nullable().optional(),
  travelTime: nonNegativeMinutesSchema.nullable().optional(),
  locationName: nonEmptyTextSchema.nullable().optional(),
  index: z.number().finite().int().min(0).optional(),
})

export const updateAttractionOperationSchema = z.object({
  type: operationType('update_attraction'),
  attractionId: nonEmptyIdSchema,
  changes: attractionChangesSchema.optional(),
  name: nonEmptyTextSchema.optional(),
  description: z.string().trim().optional(),
  duration: durationMinutesSchema.optional(),
  transportMode: transportModeSchema.nullable().optional(),
  travelTime: nonNegativeMinutesSchema.nullable().optional(),
  locationName: nonEmptyTextSchema.nullable().optional(),
})

export const removeAttractionOperationSchema = z.object({
  type: operationType('remove_attraction'),
  attractionId: nonEmptyIdSchema,
})

export const moveAttractionOperationSchema = z.object({
  type: operationType('move_attraction'),
  attractionId: nonEmptyIdSchema,
  targetDayId: nonEmptyIdSchema,
  index: z.number().finite().int().min(0),
})

export const reorderAttractionsOperationSchema = z.object({
  type: operationType('reorder_attractions'),
  dayId: nonEmptyIdSchema,
  attractionIds: z.array(nonEmptyIdSchema),
})

export const itineraryOperationSchema = z.union([
  setDayStartTimeOperationSchema,
  addAttractionOperationSchema,
  updateAttractionOperationSchema,
  removeAttractionOperationSchema,
  moveAttractionOperationSchema,
  reorderAttractionsOperationSchema,
])

export const itineraryToolInputSchema = z.object({
  reply: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  explanation: z.string().nullable().optional(),
  operations: z.array(itineraryOperationSchema).min(1),
})
