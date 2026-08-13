import { z } from 'zod'

const timeValuePattern = /^(?:(?:\d{4}-\d{2}-\d{2})[T ])?([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/

// Gemini sometimes copies the ISO timestamp from the itinerary context even
// though this operation only needs a wall-clock value. Accept both forms but
// normalize without Date parsing so a timezone suffix cannot shift the hour.
const timeSchema = z.string().trim().refine(
  (value) => timeValuePattern.test(value),
  '必須是有效的 24 小時 HH:mm 或 ISO 日期時間',
).transform((value) => {
  const match = timeValuePattern.exec(value)
  return `${match![1]}:${match![2]}`
})

const nonNegativeMinutesSchema = z.number().finite().int().min(0).max(1_440)
const durationMinutesSchema = z.number().finite().int().min(1).max(1_440)
const transportModeSchema = z.enum(['driving', 'walking', 'transit', 'bicycling'])
const nonEmptyTextSchema = z.string().trim().min(1)

const rawAttractionDraftSchema = z.object({
  id: z.unknown().optional(),
  name: nonEmptyTextSchema,
  description: z.string().optional(),
  duration: durationMinutesSchema,
  transportMode: transportModeSchema,
  travelTime: nonNegativeMinutesSchema.nullable(),
  locationName: nonEmptyTextSchema.nullable().optional(),
  // Google metadata must remain empty until the user applies the proposal.
  placeId: z.unknown().optional(),
  latitude: z.unknown().optional(),
  longitude: z.unknown().optional(),
  // Older model responses may still include product-owned fields such as
  // cost. Unknown keys are stripped and never reach the proposal snapshot.
}).strip()

export const assistantAttractionDraftSchema = rawAttractionDraftSchema.transform((value) => ({
  id: crypto.randomUUID(),
  name: value.name,
  description: value.description ?? '',
  cost: 0,
  latitude: null,
  longitude: null,
  duration: value.duration,
  transportMode: value.transportMode,
  travelTime: value.travelTime,
  placeId: null,
  locationName: value.locationName ?? null,
}))

const attractionChangesSchema = z.object({
  name: nonEmptyTextSchema.optional(),
  description: z.string().optional(),
  duration: durationMinutesSchema.optional(),
  transportMode: transportModeSchema.nullable().optional(),
  travelTime: nonNegativeMinutesSchema.nullable().optional(),
  locationName: nonEmptyTextSchema.nullable().optional(),
}).strict().refine((changes) => Object.keys(changes).length > 0, {
  message: '至少需要一個要修改的欄位',
})

const setDayStartTimeSchema = z.object({
  type: z.literal('set_day_start_time'),
  dayId: nonEmptyTextSchema,
  startTime: timeSchema,
}).strict()

const addAttractionSchema = z.object({
  type: z.literal('add_attraction'),
  dayId: nonEmptyTextSchema,
  index: z.number().finite().int().min(0).optional(),
  attraction: assistantAttractionDraftSchema,
}).strict()

const updateAttractionSchema = z.object({
  type: z.literal('update_attraction'),
  attractionId: nonEmptyTextSchema,
  changes: attractionChangesSchema,
}).strict()

const removeAttractionSchema = z.object({
  type: z.literal('remove_attraction'),
  attractionId: nonEmptyTextSchema,
}).strict()

const moveAttractionSchema = z.object({
  type: z.literal('move_attraction'),
  attractionId: nonEmptyTextSchema,
  targetDayId: nonEmptyTextSchema,
  index: z.number().finite().int().min(0),
}).strict()

const reorderAttractionsSchema = z.object({
  type: z.literal('reorder_attractions'),
  dayId: nonEmptyTextSchema,
  attractionIds: z.array(nonEmptyTextSchema).min(1),
}).strict()

export const assistantOperationSchema = z.discriminatedUnion('type', [
  setDayStartTimeSchema,
  addAttractionSchema,
  updateAttractionSchema,
  removeAttractionSchema,
  moveAttractionSchema,
  reorderAttractionsSchema,
])

export const assistantOperationsSchema = z.array(assistantOperationSchema).min(1)

const proposalSchema = z.object({
  title: nonEmptyTextSchema.optional(),
  explanation: z.string().trim().optional(),
  operations: assistantOperationsSchema,
}).strict().transform((value) => ({
  ...value,
  title: value.title ?? '行程修改提案',
  explanation: value.explanation ?? '',
}))

export const assistantModelResultSchema = z.object({
  reply: nonEmptyTextSchema,
  proposal: proposalSchema.nullable().optional(),
}).strict()

export const answerToolArgumentsSchema = z.object({
  reply: nonEmptyTextSchema,
}).strict()

export const proposalToolArgumentsSchema = z.object({
  reply: nonEmptyTextSchema,
  title: nonEmptyTextSchema.optional(),
  explanation: z.string().trim().optional(),
  operations: assistantOperationsSchema,
}).strict().transform((value) => ({
  ...value,
  title: value.title ?? '行程修改提案',
  explanation: value.explanation ?? value.reply,
}))

export const assistantSummarySchema = z.object({
  summary: z.string().trim(),
}).strict()

export const assistantFunctionCallSchema = z.object({
  name: z.string(),
  args: z.record(z.string(), z.unknown()).optional(),
}).passthrough()

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
