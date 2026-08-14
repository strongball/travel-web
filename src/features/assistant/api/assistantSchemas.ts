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
}).strict()

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
}).strict().refine((value) => Object.keys(value).length > 0, '至少需要一個景點變更欄位')

const operationType = <T extends string>(value: T) => z.enum([value])

const setDayStartTimeOperationSchema = z.object({
  type: operationType('set_day_start_time'),
  dayId: nonEmptyIdSchema,
  startTime: timeSchema,
}).strict()

const addAttractionOperationSchema = z.object({
  type: operationType('add_attraction'),
  dayId: nonEmptyIdSchema,
  attraction: assistantAttractionDraftSchema,
  index: z.number().finite().int().min(0).optional(),
}).strict()

const updateAttractionOperationSchema = z.object({
  type: operationType('update_attraction'),
  attractionId: nonEmptyIdSchema,
  changes: attractionChangesSchema,
}).strict()

// Keep the existing flat update payload as a separately constrained legacy
// branch. It is normalized to the canonical `changes` shape by the parser.
const flatUpdateAttractionOperationSchema = z.object({
  type: operationType('update_attraction'),
  attractionId: nonEmptyIdSchema,
  name: nonEmptyTextSchema.optional(),
  description: z.string().trim().optional(),
  duration: durationMinutesSchema.optional(),
  transportMode: transportModeSchema.nullable().optional(),
  travelTime: nonNegativeMinutesSchema.nullable().optional(),
  locationName: nonEmptyTextSchema.nullable().optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== 'type' && key !== 'attractionId'), '至少需要一個景點變更欄位')

const removeAttractionOperationSchema = z.object({
  type: operationType('remove_attraction'),
  attractionId: nonEmptyIdSchema,
}).strict()

const moveAttractionOperationSchema = z.object({
  type: operationType('move_attraction'),
  attractionId: nonEmptyIdSchema,
  targetDayId: nonEmptyIdSchema,
  index: z.number().finite().int().min(0),
}).strict()

const reorderAttractionsOperationSchema = z.object({
  type: operationType('reorder_attractions'),
  dayId: nonEmptyIdSchema,
  attractionIds: z.array(nonEmptyIdSchema),
}).strict()

const addTodoOperationSchema = z.object({
  type: operationType('add_todo'),
  title: nonEmptyTextSchema,
  category: nonEmptyTextSchema.optional(),
}).strict()

const addTodoCategoryOperationSchema = z.object({
  type: operationType('add_todo_category'),
  name: nonEmptyTextSchema,
}).strict()

export const assistantOperationSchema = z.union([
  setDayStartTimeOperationSchema,
  addAttractionOperationSchema,
  updateAttractionOperationSchema,
  flatUpdateAttractionOperationSchema,
  removeAttractionOperationSchema,
  moveAttractionOperationSchema,
  reorderAttractionsOperationSchema,
  addTodoOperationSchema,
  addTodoCategoryOperationSchema,
])

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
