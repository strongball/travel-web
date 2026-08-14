import { describe, expect, it } from 'vitest'
import type { Itinerary } from '../../../types/database'
import {
  buildAssistantPrompt,
  executeAssistantToolCall,
  parseAssistantModelResult,
} from './assistantApi'
import { jsonSchemaFor } from './assistantSchemas'
import { proposalToolArgumentsSchema } from '../tools'

describe('parseAssistantModelResult', () => {
  it('parses a regular assistant answer', () => {
    expect(parseAssistantModelResult({ reply: '第二天可以安排上野。', proposal: null })).toEqual({
      reply: '第二天可以安排上野。',
    })
  })

  it('parses an itinerary edit proposal and preserves valid operations', () => {
    const raw = {
      reply: '已將淺草寺移到第一天下午。',
      proposal: {
        title: '調整淺草寺時間',
        explanation: '第一天下午有空檔，移至 14:00。',
        operations: [
          {
            type: 'move_attraction',
            attractionId: 'attraction-1',
            targetDayId: 'day-1',
            index: 2,
          },
        ],
      },
    }

    expect(parseAssistantModelResult(raw)).toEqual(raw)
  })

  it('supports flat properties in update_attraction operations', () => {
    const raw = {
      reply: '已將淺草寺停留時間改為 120 分鐘。',
      proposal: {
        title: '調整淺草寺時間',
        explanation: '停留時間延長。',
        operations: [
          {
            type: 'update_attraction',
            attractionId: 'attraction-1',
            duration: 120,
          },
        ],
      },
    }

    const result = parseAssistantModelResult(raw)
    expect(result.proposal?.operations[0]).toEqual({
      type: 'update_attraction',
      attractionId: 'attraction-1',
      changes: { duration: 120 },
    })
  })

  it('rejects unsupported operation types', () => {
    expect(() =>
      parseAssistantModelResult({
        reply: '無效操作',
        proposal: {
          operations: [
            {
              type: 'delete_entire_trip',
              targetDayId: 'day-1',
            },
          ],
        },
      }),
    ).toThrow('不支援的行程修改：delete_entire_trip')
  })

  it('normalizes legacy empty values in attraction drafts', () => {
    const result = parseAssistantModelResult({
      reply: '新增晴空塔。',
      proposal: {
        title: '新增晴空塔',
        operations: [
          {
            type: 'add_attraction',
            dayId: 'day-1',
            attraction: {
              name: '東京晴空塔',
              duration: 90,
              transportMode: 'transit',
              travelTime: 20,
              locationName: '押上',
              cost: 2500,
            },
          },
        ],
      },
    })

    const draft = result.proposal?.operations[0]
    if (!draft || draft.type !== 'add_attraction') {
      throw new Error('預期為 add_attraction 操作')
    }

    expect(draft.attraction).toMatchObject({
      name: '東京晴空塔',
      cost: 2500,
      latitude: null,
      longitude: null,
      duration: 90,
      transportMode: 'transit',
      travelTime: 20,
      placeId: null,
      locationName: '押上',
    })
    expect(draft.attraction.id).toBeTypeOf('string')
  })

  it('allows adding and categorizing todo items', () => {
    const result = parseAssistantModelResult({
      reply: '已建議將行李打包與票券預約加入待辦清單。',
      proposal: {
        title: '建議待辦項目',
        operations: [
          { type: 'add_todo_category', name: '行前準備' },
          { type: 'add_todo', title: '換日幣現金', category: '行前準備' },
        ],
      },
    })

    expect(result.proposal?.operations).toEqual([
      { type: 'add_todo_category', name: '行前準備' },
      { type: 'add_todo', title: '換日幣現金', category: '行前準備' },
    ])
  })
})

describe('buildAssistantPrompt', () => {
  const itinerary: Itinerary = {
    id: 'trip-1',
    title: '東京賞楓 5 日遊',
    ownerId: 'user-1',
    startDate: '2026-11-01',
    currency: 'JPY',
    days: [
      {
        id: 'day-1',
        itineraryId: 'trip-1',
        date: '2026-11-01',
        startTime: '2026-11-01T09:00:00',
        revision: 1,
        attractions: [
          {
            id: 'a-1',
            dayId: 'day-1',
            name: '淺草寺',
            description: '雷門拍照',
            startTime: '2026-11-01T09:00:00',
            endTime: '2026-11-01T10:30:00',
            cost: 0,
            latitude: 35.7147,
            longitude: 139.7967,
            duration: 90,
            transportMode: 'walking',
            travelTime: 15,
            placeId: 'place-asakusa',
            locationName: '淺草寺',
          },
        ],
      },
    ],
  }

  it('includes itinerary structure, recent messages, and current user question', () => {
    const prompt = buildAssistantPrompt(
      itinerary,
      '使用者偏好搭地鐵，不想走太遠。',
      [
        {
          id: 'm-1',
          turnId: 'turn-1',
          role: 'user',
          content: '第一天早上想去淺草寺。',
          createdAt: '2026-08-12T00:00:00Z',
        },
      ],
      '下午想去晴空塔，怎麼排比較順？',
    )

    expect(prompt).toContain('東京賞楓 5 日遊')
    expect(prompt).toContain('第 1 天（ID: day-1，日期：2026-11-01')
    expect(prompt).toContain('淺草寺')
    expect(prompt).toContain('使用者偏好搭地鐵，不想走太遠。')
    expect(prompt).toContain('使用者：第一天早上想去淺草寺。')
    expect(prompt).toContain('下午想去晴空塔，怎麼排比較順？')
    expect(prompt).toContain('propose_itinerary_edit')
  })
})

describe('tool schema compatibility with Gemini', () => {
  it('omits disallowed fields like $schema and pattern from tool schemas', () => {
    const schema = jsonSchemaFor(proposalToolArgumentsSchema)
    const json = JSON.stringify(schema)
    expect(json).not.toContain('"$schema"')
    expect(json).not.toContain('"pattern"')
    expect(json).not.toContain('"minLength"')
  })
})

describe('executeAssistantToolCall', () => {
  it('executes LangChain propose_itinerary_edit tool', async () => {
    const result = await executeAssistantToolCall('propose_itinerary_edit', {
      reply: '已準備加入黑門市場。',
      operations: [{
        type: 'add_attraction',
        dayId: 'day-1',
        attraction: {
          name: '黑門市場',
          duration: 60,
          transportMode: 'walking',
          travelTime: 10,
        },
      }],
    })

    expect(result.reply).toBe('已準備加入黑門市場。')
    expect(result.proposal?.operations[0]).toMatchObject({
      type: 'add_attraction',
      dayId: 'day-1',
      attraction: expect.objectContaining({ name: '黑門市場' }),
    })
  })

  it('executes LangChain propose_todo_list tool', async () => {
    const result = await executeAssistantToolCall('propose_todo_list', {
      reply: '已為您規劃待辦清單。',
      todos: [
        { title: '購買交通卡', category: '行前準備' },
      ],
      newCategories: ['交通票券'],
    })

    expect(result.reply).toBe('已為您規劃待辦清單。')
    expect(result.proposal?.operations).toEqual([
      { type: 'add_todo_category', name: '交通票券' },
      { type: 'add_todo', title: '購買交通卡', category: '行前準備' },
    ])
  })
})
