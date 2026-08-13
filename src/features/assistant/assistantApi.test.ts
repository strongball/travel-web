import { describe, expect, it } from 'vitest'
import type { Itinerary } from '../../types/database'
import {
  buildAssistantPrompt,
  localizedPlaceText,
  parseAssistantFunctionCalls,
  parseAssistantModelResult,
  verifyGooglePlace,
} from './assistantApi'
import { jsonSchemaFor, proposalToolArgumentsSchema } from './assistantSchemas'

describe('parseAssistantModelResult', () => {
  it('parses a regular assistant answer', () => {
    expect(parseAssistantModelResult({ reply: '第二天可以安排上野。', proposal: null })).toEqual({
      reply: '第二天可以安排上野。',
    })
  })

  it('includes recent preferences and the current itinerary in recommendation context', () => {
    const itinerary = {
      title: '東京旅行',
      startDate: '2026-09-01',
      endDate: '2026-09-02',
      days: [{
        id: 'day-1', date: '2026-09-01', startTime: '2026-09-01T09:00:00',
        attractions: [{
          id: 'place-1', name: '淺草寺', locationName: '東京淺草',
          startTime: '2026-09-01T09:00:00', endTime: '2026-09-01T10:00:00',
          duration: 60, transportMode: 'transit', travelTime: null,
        }],
      }],
    } as Itinerary
    const value = buildAssistantPrompt({
      summary: '使用者喜歡慢步調。',
      messages: [{ id: '1', turnId: '1', role: 'user', content: '不想走太多路', createdAt: '2026-08-12T00:00:00Z' }],
      userText: '推薦附近景點',
      itinerary,
      dayRevisions: { 'day-1': 0 },
    })
    expect(value).toContain('不想走太多路')
    expect(value).toContain('淺草寺')
    expect(value).toContain('避開目前行程已有的景點')
    expect(value).toContain('每日開始時間')
    expect(value).toContain('startTime/endTime')
    expect(value).toContain('travelTime + 該站 duration')
    expect(value).toContain('營業時段')
    expect(value).toContain('不能只調整景點順序')
  })

  it('does not duplicate the current user message in recent history', () => {
    const itinerary = { title: '大阪', startDate: '2026-09-01', endDate: '2026-09-01', days: [] } as unknown as Itinerary
    const value = buildAssistantPrompt({
      summary: '',
      messages: [
        { id: '1', turnId: '1', role: 'assistant', content: '前一則回答', createdAt: '2026-08-12T00:00:00Z' },
        { id: '2', turnId: '2', role: 'user', content: '幫我排第一天', createdAt: '2026-08-12T00:01:00Z' },
      ],
      userText: '幫我排第一天',
      itinerary,
      dayRevisions: {},
    })
    expect(value.match(/幫我排第一天/g)).toHaveLength(1)
    expect(value).toContain('前一則回答')
  })

  it('rejects unknown itinerary operations', () => {
    expect(() => parseAssistantModelResult({
      reply: '完成',
      proposal: { title: '改行程', explanation: '修改', operations: [{ type: 'change_currency' }] },
    })).toThrow('不支援的行程修改')
  })

  it('reports the exact malformed structured-output field', () => {
    expect(() => parseAssistantModelResult({
      reply: '已安排。',
      proposal: {
        title: '新增景點',
        explanation: '',
        operations: [{
          type: 'add_attraction',
          dayId: 'day-1',
          attraction: { name: '道頓堀', duration: '九十分鐘' },
        }],
      },
    })).toThrow('proposal.operations.0.attraction.duration')
  })

  it('normalizes ISO and seconds day start times to 24-hour HH:mm', () => {
    const result = parseAssistantModelResult({
      reply: '調整每天的開始時間。',
      proposal: {
        title: '調整出發時間',
        explanation: '',
        operations: [
          { type: 'set_day_start_time', dayId: 'day-1', startTime: '2026-09-01T09:30:00+09:00' },
          { type: 'set_day_start_time', dayId: 'day-2', startTime: '10:15:00' },
        ],
      },
    })
    expect(result.proposal?.operations).toEqual([
      { type: 'set_day_start_time', dayId: 'day-1', startTime: '09:30' },
      { type: 'set_day_start_time', dayId: 'day-2', startTime: '10:15' },
    ])
  })

  it('rejects an invalid day start time', () => {
    expect(() => parseAssistantModelResult({
      reply: '改成晚一點出發。',
      proposal: {
        title: '調整出發時間',
        explanation: '',
        operations: [{ type: 'set_day_start_time', dayId: 'day-1', startTime: '29:00' }],
      },
    })).toThrow('HH:mm 或 ISO')
  })

  it('keeps new-place metadata empty until post-apply enrichment', () => {
    const result = parseAssistantModelResult({
      reply: '可以加入道頓堀。',
      proposal: {
        title: '加入道頓堀',
        explanation: '安排於晚餐後散步。',
        operations: [{
          type: 'add_attraction',
          dayId: 'day-1',
          index: 2,
          attraction: {
            name: '道頓堀',
            locationName: '大阪道頓堀',
            duration: 75,
            transportMode: 'walking',
            travelTime: 15,
          },
        }],
      },
    })
    const operation = result.proposal?.operations[0]
    expect(operation?.type).toBe('add_attraction')
    if (operation?.type !== 'add_attraction') throw new Error('Expected add operation')
    expect(operation.attraction).toMatchObject({
      name: '道頓堀',
      locationName: '大阪道頓堀',
      duration: 75,
      transportMode: 'walking',
      travelTime: 15,
      placeId: null,
      latitude: null,
      longitude: null,
      cost: 0,
    })
    expect(operation.attraction.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('ignores model-supplied product fields on new attractions', () => {
    const result = parseAssistantModelResult({
      reply: '已加入三個景點。',
      proposal: {
        operations: [{
          type: 'add_attraction',
          dayId: 'day-1',
          attraction: {
            name: '黑門市場',
            duration: 60,
            transportMode: 'walking',
            travelTime: 10,
            cost: 500,
            placeId: 'hallucinated-place-id',
            latitude: 34.1,
            longitude: 135.1,
          },
        }],
      },
    })
    const operation = result.proposal?.operations[0]
    expect(result.proposal).toMatchObject({ title: '行程修改提案', explanation: '' })
    expect(operation?.type).toBe('add_attraction')
    if (operation?.type !== 'add_attraction') throw new Error('Expected add operation')
    expect(operation.attraction).toMatchObject({
      cost: 0,
      placeId: null,
      latitude: null,
      longitude: null,
    })
  })
})

describe('parseAssistantFunctionCalls', () => {
  it('converts the transformed Zod proposal input to Gemini JSON Schema', () => {
    expect(() => jsonSchemaFor(proposalToolArgumentsSchema)).not.toThrow()
    const schema = jsonSchemaFor(proposalToolArgumentsSchema)
    expect(schema).toMatchObject({
      type: 'object',
      properties: { operations: { type: 'array' } },
    })
    const serialized = JSON.stringify(schema)
    expect(serialized).not.toContain('"const"')
    expect(serialized).not.toContain('"pattern"')
    expect(serialized).toContain('"enum":["add_attraction"]')
  })

  it('parses a Gemini itinerary-edit tool call', () => {
    const result = parseAssistantFunctionCalls([{
      id: 'call-1',
      name: 'propose_itinerary_edit',
      args: {
        reply: '我會從九點開始，保留足夠交通時間。',
        title: '調整第一天',
        explanation: '九點出發並預留二十分鐘交通。',
        operations: [
          { type: 'set_day_start_time', dayId: 'day-1', startTime: '09:00' },
          {
            type: 'update_attraction',
            attractionId: 'place-1',
            changes: { duration: 90, transportMode: 'transit', travelTime: 20 },
          },
        ],
      },
    }])
    expect(result.proposal?.operations).toEqual([
      { type: 'set_day_start_time', dayId: 'day-1', startTime: '09:00' },
      {
        type: 'update_attraction',
        attractionId: 'place-1',
        changes: { duration: 90, transportMode: 'transit', travelTime: 20 },
      },
    ])
  })

  it('accepts a concise editing tool call without duplicate proposal copy', () => {
    const result = parseAssistantFunctionCalls([{
      name: 'propose_itinerary_edit',
      args: {
        reply: '已準備加入黑門市場。',
        operations: [{
          type: 'add_attraction',
          dayId: 'day-1',
          attraction: {
            name: '黑門市場',
            duration: 60,
            transportMode: 'walking',
            travelTime: 10,
            cost: 0,
          },
        }],
      },
    }])
    expect(result.proposal).toMatchObject({
      title: '行程修改提案',
      explanation: '已準備加入黑門市場。',
    })
  })

  it('parses the non-editing answer tool without a proposal', () => {
    expect(parseAssistantFunctionCalls([{
      name: 'answer_travel_question',
      args: { reply: '請問您指的是第一天還是第二天？' },
    }])).toEqual({ reply: '請問您指的是第一天還是第二天？' })
  })

  it('rejects malformed or multiple tool calls', () => {
    expect(() => parseAssistantFunctionCalls([])).toThrow('必須且只能')
    expect(() => parseAssistantFunctionCalls([
      { name: 'answer_travel_question', args: { reply: '一' } },
      { name: 'answer_travel_question', args: { reply: '二' } },
    ])).toThrow('必須且只能')
    expect(() => parseAssistantFunctionCalls([{
      name: 'propose_itinerary_edit',
      args: { reply: '完成', title: '提案', explanation: '', operations: [] },
    }])).toThrow('operations')
  })
})

describe('verifyGooglePlace', () => {
  it('does not replace a Chinese place name with Google romanization', () => {
    expect(localizedPlaceText('道頓堀', 'Dotonbori', 'zh-TW')).toBe('道頓堀')
    expect(localizedPlaceText('Dotonbori', '道頓堀', 'zh-TW')).toBe('道頓堀')
    expect(localizedPlaceText('道頓堀', 'Dotonbori', 'en')).toBe('Dotonbori')
  })

  it('falls back to the Maps JavaScript geocoder when Places Text Search is denied', async () => {
    class FakeGeocoder {
      async geocode() {
        return {
          results: [{
            place_id: 'geocoder-place-id',
            formatted_address: '東京都台東區淺草 2-3-1',
            geometry: { location: { toJSON: () => ({ lat: 35.7148, lng: 139.7967 }) } },
          }],
        }
      }
    }
    const place = await verifyGooglePlace('淺草寺 東京', async () => ({
      Place: { searchByText: async () => { throw new Error('PERMISSION_DENIED') } },
      Geocoder: FakeGeocoder,
    }) as never)
    expect(place).toEqual({
      name: null,
      address: '東京都台東區淺草 2-3-1',
      placeId: 'geocoder-place-id',
      latitude: 35.7148,
      longitude: 139.7967,
    })
  })

  it('retries a place search with the itinerary location context', async () => {
    class FakeGeocoder {
      async geocode() { return { results: [] } }
    }
    const place = await verifyGooglePlace('道頓堀', async () => ({
      Place: {
        searchByText: async ({ textQuery }: { textQuery: string }) => ({
          places: textQuery.includes('大阪') ? [{
            id: 'dotonbori-place-id',
            displayName: '道頓堀',
            formattedAddress: '日本大阪府大阪市中央區道頓堀',
            location: { toJSON: () => ({ lat: 34.6687, lng: 135.5013 }) },
          }] : [],
        }),
      },
      Geocoder: FakeGeocoder,
    }) as never, '大阪 日本')
    expect(place).not.toBeNull()
    expect(place?.placeId).toBe('dotonbori-place-id')
  })

  it('supports Maps JS builds whose geocoder completes through the callback', async () => {
    class FakeGeocoder {
      geocode(_request: unknown, callback: (results: unknown[], status: string) => void) {
        callback([{
          place_id: 'callback-place-id',
          formatted_address: '大阪府大阪市',
          geometry: { location: { toJSON: () => ({ lat: 34.6687, lng: 135.5013 }) } },
        }], 'OK')
        return undefined
      }
    }
    const place = await verifyGooglePlace('道頓堀', async () => ({
      Place: { searchByText: async () => ({ places: [] }) },
      Geocoder: FakeGeocoder,
    }) as never)
    expect(place).not.toBeNull()
    expect(place?.placeId).toBe('callback-place-id')
  })

  it('returns an empty match when Google cannot find the place', async () => {
    class FakeGeocoder {
      async geocode() { return { results: [] } }
    }
    await expect(verifyGooglePlace('不存在的景點', async () => ({
      Place: { searchByText: async () => ({ places: [] }) },
      Geocoder: FakeGeocoder,
    }) as never)).resolves.toBeNull()
  })

  it('returns an actionable error when both Google services deny the key', async () => {
    class FakeGeocoder {
      async geocode() { throw new Error('PERMISSION_DENIED') }
    }
    await expect(verifyGooglePlace('淺草寺', async () => ({
      Place: { searchByText: async () => { throw new Error('PERMISSION_DENIED') } },
      Geocoder: FakeGeocoder,
    }) as never)).rejects.toThrow('Places API (New)')
  })
})
