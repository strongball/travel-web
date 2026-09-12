import { describe, expect, it } from 'vitest'
import type { Itinerary } from '../../../types/database'
import {
  buildAssistantSystemPrompt,
  buildAssistantUserPrompt,
} from './assistantApi'
describe('assistant prompt builders', () => {
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
        revision: 2,
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

  describe('buildAssistantSystemPrompt', () => {
    it('contains core principles, SOP rules for itinerary and todo tools, and trip metadata', () => {
      const systemPrompt = buildAssistantSystemPrompt(itinerary, '使用者偏好搭地鐵，不想走太遠。')
      expect(systemPrompt).toContain('東京賞楓 5 日遊')
      expect(systemPrompt).toContain('共 1 天')
      expect(systemPrompt).toContain('view_itinerary')
      expect(systemPrompt).toContain('view_todo_categories')
      expect(systemPrompt).toContain('view_todo_list')
      expect(systemPrompt).toContain('行程最新性原則')
      expect(systemPrompt).toContain('待辦最新性原則')
      expect(systemPrompt).toContain('歷史快照不可信原則')
      expect(systemPrompt).toContain('先前對話摘要')
      expect(systemPrompt).toContain('使用者偏好搭地鐵，不想走太遠。')
    })
  })

  describe('buildAssistantUserPrompt', () => {
    it('returns pure user input without dumping itinerary or todo state', () => {
      const userPrompt = buildAssistantUserPrompt('幫我安排第一天晚餐')
      expect(userPrompt).toBe('幫我安排第一天晚餐')
      expect(userPrompt).not.toContain('東京賞楓')
      expect(userPrompt).not.toContain('淺草寺')
      expect(userPrompt).not.toContain('行前準備')
    })

    it('includes text attachments when present', () => {
      const userPrompt = buildAssistantUserPrompt('請看這份文件', [
        {
          id: 'att-1',
          name: 'notes.txt',
          mimeType: 'text/plain',
          size: 100,
          textContent: '飯店訂單編號: 12345',
        },
      ])
      expect(userPrompt).toContain('### 檔案【notes.txt】內容：\n飯店訂單編號: 12345')
      expect(userPrompt).toContain('請看這份文件')
    })
  })
})
