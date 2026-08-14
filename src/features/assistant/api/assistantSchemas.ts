import { z } from 'zod'

const timeValuePattern = /^(?:(?:\d{4}-\d{2}-\d{2})[T ])?([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/

export const timeSchema = z.string().trim().regex(
  timeValuePattern,
  '必須是有效的 24 小時 HH:mm 或 ISO 日期時間',
)

export function normalizeTimeString(value: string): string {
  const match = timeValuePattern.exec(value)
  return match ? `${match[1]}:${match[2]}` : value
}

const nonNegativeMinutesSchema = z.number().finite().int().min(0).max(1_440)
const durationMinutesSchema = z.number().finite().int().min(1).max(1_440)
const transportModeSchema = z.enum(['driving', 'walking', 'transit', 'bicycling'])
const nonEmptyTextSchema = z.string().trim().min(1)

export const assistantAttractionDraftSchema = z.object({
  id: z.string().optional(),
  name: nonEmptyTextSchema,
  description: z.string().optional(),
  duration: durationMinutesSchema,
  transportMode: transportModeSchema.nullable().optional(),
  travelTime: nonNegativeMinutesSchema.nullable().optional(),
  locationName: nonEmptyTextSchema.nullable().optional(),
  placeId: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  cost: z.number().optional(),
})

export type AssistantAttractionDraftInput = z.infer<typeof assistantAttractionDraftSchema>

export function normalizeAttractionDraft(value: AssistantAttractionDraftInput) {
  return {
    id: value.id || crypto.randomUUID(),
    name: value.name,
    description: value.description ?? '',
    cost: value.cost ?? 0,
    latitude: value.latitude ?? null,
    longitude: value.longitude ?? null,
    duration: value.duration,
    transportMode: value.transportMode ?? null,
    travelTime: value.travelTime ?? null,
    placeId: value.placeId ?? null,
    locationName: value.locationName ?? null,
  }
}

export const attractionChangesSchema = z.object({
  name: nonEmptyTextSchema.optional(),
  description: z.string().optional(),
  duration: durationMinutesSchema.optional(),
  transportMode: transportModeSchema.nullable().optional(),
  travelTime: nonNegativeMinutesSchema.nullable().optional(),
  locationName: nonEmptyTextSchema.nullable().optional(),
})

export const assistantOperationSchema = z.object({
  type: z.enum([
    'set_day_start_time',
    'add_attraction',
    'update_attraction',
    'remove_attraction',
    'move_attraction',
    'reorder_attractions',
    'add_todo',
    'add_todo_category',
  ]),
  dayId: z.string().optional(),
  startTime: z.string().optional(),
  attraction: assistantAttractionDraftSchema.optional(),
  attractionId: z.string().optional(),
  changes: attractionChangesSchema.optional(),
  targetDayId: z.string().optional(),
  index: z.number().finite().int().min(0).optional(),
  attractionIds: z.array(z.string()).optional(),
  title: z.string().optional(),
  category: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  duration: z.number().optional(),
  transportMode: z.string().nullable().optional(),
  travelTime: z.number().nullable().optional(),
  locationName: z.string().nullable().optional(),
  cost: z.number().optional(),
})

export const assistantOperationsSchema = z.array(assistantOperationSchema).min(1)

export const proposalSchema = z.object({
  title: nonEmptyTextSchema.optional(),
  explanation: z.string().trim().optional(),
  operations: assistantOperationsSchema,
}).strict()

export const assistantModelResultSchema = z.object({
  reply: nonEmptyTextSchema,
  proposal: proposalSchema.nullable().optional(),
}).strict()

function geminiCompatibleJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(geminiCompatibleJsonSchema)
  if (!value || typeof value !== 'object') return value
  const result: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) {
    if (key === '$schema' || key === 'pattern' || key === 'minLength') continue
    if (key === 'const') {
      result.enum = [child]
      continue
    }
    result[key] = geminiCompatibleJsonSchema(child)
  }
  return result
}

export function jsonSchemaFor<T extends z.ZodType>(schema: T): Record<string, unknown> {
  return geminiCompatibleJsonSchema(z.toJSONSchema(schema, { io: 'input' })) as Record<string, unknown>
}

export function formatAssistantSchemaError(error: z.ZodError): string {
  return error.issues.slice(0, 3).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : 'root'
    return `${path}：${issue.message}`
  }).join('；')
}
