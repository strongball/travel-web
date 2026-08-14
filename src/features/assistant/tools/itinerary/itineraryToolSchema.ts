import { z } from 'zod'

/** Gemini/LangChain-compatible input schema for itinerary proposals. */
const transportModeSchema = z.enum(['driving', 'walking', 'transit', 'bicycling'])

const attractionSchema = z.object({
  name: z.string(),
  duration: z.number(),
  transportMode: transportModeSchema.nullable().optional(),
  travelTime: z.number().nullable().optional(),
  locationName: z.string().nullable().optional(),
})

const operationSchema = z.object({
  type: z.enum([
    'set_day_start_time',
    'add_attraction',
    'update_attraction',
    'remove_attraction',
    'move_attraction',
    'reorder_attractions',
  ]),
  dayId: z.string().optional(),
  startTime: z.string().optional(),
  attraction: attractionSchema.optional(),
  attractionId: z.string().optional(),
  targetDayId: z.string().optional(),
  index: z.number().optional(),
  attractionIds: z.array(z.string()).optional(),
  changes: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    duration: z.number().optional(),
    transportMode: transportModeSchema.nullable().optional(),
    travelTime: z.number().nullable().optional(),
    locationName: z.string().nullable().optional(),
  }).optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  duration: z.number().optional(),
  transportMode: transportModeSchema.nullable().optional(),
  travelTime: z.number().nullable().optional(),
  locationName: z.string().nullable().optional(),
  category: z.string().optional(),
})

export const itineraryToolInputSchema = z.object({
  reply: z.string(),
  title: z.string().nullable().optional(),
  explanation: z.string().nullable().optional(),
  operations: z.array(operationSchema).min(1),
})
