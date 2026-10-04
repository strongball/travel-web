import { z } from 'zod'

const timeValuePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/

export const timeSchema = z.string().trim().regex(
  timeValuePattern,
  '必須是有效的 24 小時 HH:mm',
)

export function normalizeTimeString(value: string): string {
  return timeSchema.parse(value)
}

const idSchema = z.preprocess(
  (v) => (typeof v === 'number' ? String(v) : v),
  z.string().trim().min(1),
)
const nonNegativeMinutesSchema = z.number().finite().int().min(0).max(1_440)
const durationMinutesSchema = z.number().finite().int().min(1).max(1_440)
const transportModeSchema = z.enum(['driving', 'walking', 'transit', 'bicycling'])
const nonEmptyTextSchema = z.string().trim().min(1)

export const optionalTrimmedTextSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  nonEmptyTextSchema.nullable().optional(),
)

export const optionalTransportModeSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  transportModeSchema.nullable().optional(),
)

export const assistantAttractionDraftSchema = z.object({
  name: nonEmptyTextSchema,
  description: z.string().trim().optional(),
  cost: z.number().optional(),
  duration: durationMinutesSchema.optional(),
  transportMode: optionalTransportModeSchema,
  travelTime: nonNegativeMinutesSchema.nullable().optional(),
  locationName: optionalTrimmedTextSchema,
})

export type AssistantAttractionDraftInput = z.infer<typeof assistantAttractionDraftSchema>

export function normalizeAttractionDraft(value: AssistantAttractionDraftInput) {
  return {
    id: crypto.randomUUID(),
    name: value.name.trim(),
    description: value.description?.trim() ?? '',
    cost: typeof value.cost === 'number' && Number.isFinite(value.cost) ? Math.max(0, value.cost) : 0,
    latitude: null,
    longitude: null,
    duration: value.duration ?? 60,
    transportMode: value.transportMode ?? null,
    travelTime: value.travelTime ?? null,
    placeId: null,
    locationName: value.locationName ?? null,
  }
}

export const attractionChangesSchema = z.object({
  name: nonEmptyTextSchema.optional(),
  description: z.string().trim().optional(),
  cost: z.number().optional(),
  duration: durationMinutesSchema.optional(),
  transportMode: optionalTransportModeSchema,
  travelTime: nonNegativeMinutesSchema.nullable().optional(),
  locationName: optionalTrimmedTextSchema,
})

const operationType = <T extends string>(value: T) => z.literal(value)

export const setDayStartTimeOperationSchema = z.object({
  type: operationType('set_day_start_time'),
  dayId: idSchema,
  startTime: timeSchema,
})

export const addAttractionOperationSchema = z.object({
  type: operationType('add_attraction'),
  dayId: idSchema,
  attraction: assistantAttractionDraftSchema.optional(),
  name: nonEmptyTextSchema.optional(),
  description: z.string().trim().optional(),
  cost: z.number().optional(),
  duration: durationMinutesSchema.optional(),
  transportMode: optionalTransportModeSchema,
  travelTime: nonNegativeMinutesSchema.nullable().optional(),
  locationName: optionalTrimmedTextSchema,
  index: z.number().finite().int().min(0).optional(),
})

export const updateAttractionOperationSchema = z.object({
  type: operationType('update_attraction'),
  attractionId: idSchema,
  changes: attractionChangesSchema.optional(),
  name: nonEmptyTextSchema.optional(),
  description: z.string().trim().optional(),
  cost: z.number().optional(),
  duration: durationMinutesSchema.optional(),
  transportMode: optionalTransportModeSchema,
  travelTime: nonNegativeMinutesSchema.nullable().optional(),
  locationName: optionalTrimmedTextSchema,
})

export const removeAttractionOperationSchema = z.object({
  type: operationType('remove_attraction'),
  attractionId: idSchema,
})

export const moveAttractionOperationSchema = z.object({
  type: operationType('move_attraction'),
  attractionId: idSchema,
  targetDayId: idSchema,
  index: z.number().finite().int().min(0),
})

export const reorderAttractionsOperationSchema = z.object({
  type: operationType('reorder_attractions'),
  dayId: idSchema,
  attractionIds: z.array(idSchema),
})

export const itineraryOperationSchema = z.discriminatedUnion('type', [
  setDayStartTimeOperationSchema,
  addAttractionOperationSchema,
  updateAttractionOperationSchema,
  removeAttractionOperationSchema,
  moveAttractionOperationSchema,
  reorderAttractionsOperationSchema,
])

export const assistantAttractionItemSchema = z.object({
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
  dayId: z.string().optional().describe('目標日期 ID，使用 view_itinerary 的 Day ID。新增景點必填'),
  targetDayId: z.string().optional().describe('移動目的地天數 ID'),
  attractionId: z.string().optional().describe('景點 ID'),
  attractionIds: z.array(z.string()).optional().describe('當天全部既有景點 ID，不得遺漏或重複。新增景點請用 index 定位，不能猜測新增 ID'),
  startTime: z.string().optional().describe('當天開始時間（HH:mm）'),
  name: z.string().optional().describe('景點名稱'),
  description: z.string().optional().describe('景點簡短說明'),
  cost: z.number().optional().describe('花費預算'),
  duration: z.number().optional().describe('停留時間（分鐘）'),
  transportMode: z.enum(['driving', 'walking', 'transit', 'bicycling']).optional().describe('交通方式'),
  travelTime: z.number().optional().describe('前往交通時間（分鐘）'),
  locationName: z.string().optional().describe('地點名稱或地址'),
  index: z.number().optional().describe('排序位置（0-indexed）'),
  attraction: assistantAttractionItemSchema.optional().describe('新增景點之完整資訊（選填）'),
  changes: assistantAttractionItemSchema.optional().describe('修改景點之變更內容（選填）'),
})

export const itineraryTimeTargetSchema = z.object({
  attractionId: z.string().trim().min(1).optional().describe('既有目標景點 ID；與 addOperationIndex 擇一'),
  addOperationIndex: z.number().int().min(0).optional().describe('目標新增景點在 operations 中的位置（0-indexed）；與 attractionId 擇一'),
  startTime: timeSchema.describe('期望開始時間，24 小時 HH:mm；晚餐 6:30 請填 18:30'),
  endTime: timeSchema.optional().describe('允許抵達區間的結束時間；單一預約時間不填'),
}).superRefine((target, context) => {
  if ((target.attractionId !== undefined) === (target.addOperationIndex !== undefined)) {
    context.addIssue({ code: 'custom', message: '時間目標必須以 attractionId 或 addOperationIndex 擇一指定；既有活動填 attractionId，新增活動填 operations 中的新增操作位置。' })
  }
  if (target.endTime !== undefined && target.endTime < target.startTime) {
    context.addIssue({ code: 'custom', message: '時間區間的 endTime 不得早於 startTime' })
  }
})

export type ItineraryTimeTarget = z.infer<typeof itineraryTimeTargetSchema>
export const itineraryTimeTargetsSchema = z.array(itineraryTimeTargetSchema).superRefine((targets, context) => {
  const seen = new Set<string>()
  targets.forEach((target, index) => {
    const key = target.attractionId !== undefined ? `existing:${target.attractionId}` : `added:${target.addOperationIndex}`
    if (seen.has(key)) context.addIssue({ code: 'custom', path: [index], message: '同一活動只設定一個時間目標；時間區間請使用 startTime 與 endTime，不要拆成兩個目標。' })
    seen.add(key)
  })
})

// Keep provider declarations simple; enforce constraints at the execution boundary.
const itineraryTimeTargetItemSchema = z.object({
  attractionId: z.string().optional().describe('既有目標景點 ID；與 addOperationIndex 擇一'),
  addOperationIndex: z.number().optional().describe('目標新增景點在 operations 中的位置（0-indexed）；與 attractionId 擇一'),
  startTime: z.string().describe('期望開始時間，24 小時 HH:mm；晚餐 6:30 請填 18:30'),
  endTime: z.string().optional().describe('指定抵達區間時填結束時間 HH:mm，區間只填一個目標；單一預約時間不填'),
})

export const itineraryToolInputSchema = z.object({
  reply: z.string().optional().describe('對使用者的簡短說明或回覆'),
  title: z.string().optional().describe('提案標題'),
  explanation: z.string().optional().describe('提案詳細說明'),
  operations: z.array(itineraryOperationItemSchema).min(1).describe('要執行的行程操作清單'),
  timeTargets: z.array(itineraryTimeTargetItemSchema).optional().describe('使用者指定的本次開始時間目標，全部列入；依連續排程驗算，允許前後 15 分鐘，不會鎖定或儲存時間'),
})
