import { describe, expect, it } from 'vitest'
import type { Itinerary } from '../../../types/database'
import { buildAssistantPrompt } from './assistantApi'

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
