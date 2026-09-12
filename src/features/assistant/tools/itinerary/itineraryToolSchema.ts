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

export const assistantAttractionItemSchema = z.object({
  id: z.string().optional().describe('景點 ID'),
  name: z.string().optional().describe('景點名稱'),
  description: z.string().optional().describe('景點說明'),
  cost: z.number().optional().describe('花費預算'),
  duration: z.number().optional().describe('停留時間（分鐘）'),
  transportMode: z.enum(['driving', 'walking', 'transit', 'bicycling']).optional().describe('交通方式'),
  travelTime: z.number().optional().describe('前往交通時間（分鐘）'),
  locationName: z.string().optional().describe('地點名稱或地址'),
})

export const itineraryOperationItemSchema = z.object({
  type: z.enum([
    'set_day_start_time',
    'add_attraction',
    'update_attraction',
    'remove_attraction',
    'move_attraction',
    'reorder_attractions',
  ]).describe('操作類型'),
  dayId: z.string().optional().describe('目標天數 ID（例如 day-1）'),
  targetDayId: z.string().optional().describe('移動目的地天數 ID'),
  attractionId: z.string().optional().describe('景點 ID'),
  attractionIds: z.array(z.string()).optional().describe('重新排序後的景點 ID 清單'),
  startTime: z.string().optional().describe('當天開始時間（HH:mm）'),
  name: z.string().optional().describe('景點名稱'),
  description: z.string().optional().describe('景點簡短說明'),
  duration: z.number().optional().describe('停留時間（分鐘）'),
  transportMode: z.enum(['driving', 'walking', 'transit', 'bicycling']).optional().describe('交通方式'),
  travelTime: z.number().optional().describe('前往交通時間（分鐘）'),
  locationName: z.string().optional().describe('地點名稱或地址'),
  index: z.number().optional().describe('排序位置（0-indexed）'),
  attraction: assistantAttractionItemSchema.optional().describe('新增景點之完整資訊（選填）'),
  changes: assistantAttractionItemSchema.optional().describe('修改景點之變更內容（選填）'),
})

export const itineraryToolInputSchema = z.object({
  reply: z.string().optional().describe('對使用者的簡短說明或回覆'),
  title: z.string().optional().describe('提案標題'),
  explanation: z.string().optional().describe('提案詳細說明'),
  operations: z.array(itineraryOperationItemSchema).min(1).describe('要執行的行程操作清單'),
})
