import { describe, expect, it } from 'vitest'
import { viewItineraryTool } from './viewItineraryTool'
import type { Itinerary } from '../../../../types/database'
import type { AssistantProposalToolRuntime } from '../proposalToolRuntime'

describe('viewItineraryTool', () => {
  const mockItinerary: Itinerary = {
    id: 'itinerary-1',
    title: '東京自由行',
    ownerId: 'user-1',
    currency: 'JPY',
    startDate: '2026-05-01',
    days: [
      {
        id: 'day-1',
        itineraryId: 'itinerary-1',
        date: '2026-05-01T00:00:00.000Z',
        startTime: '09:00:00',
        revision: 2,
        attractions: [
          {
            id: 'attr-1',
            dayId: 'day-1',
            name: '淺草寺',
            description: '',
            startTime: '2026-05-01T09:30:00.000Z',
            endTime: '2026-05-01T11:00:00.000Z',
            cost: 0,
            latitude: null,
            longitude: null,
            duration: 90,
            transportMode: 'transit',
            travelTime: 30,
            placeId: null,
            locationName: '雷門',
          },
        ],
      },
      {
        id: 'day-2',
        itineraryId: 'itinerary-1',
        date: '2026-05-02T00:00:00.000Z',
        startTime: null,
        revision: 1,
        attractions: [],
      },
    ],
  }

  const mockRuntime = {
    state: {
      request: {
        itinerary: mockItinerary,
      },
    },
  } as unknown as AssistantProposalToolRuntime

  it('returns full itinerary overview when dayNumber is not provided', async () => {
    const result = await (viewItineraryTool as any).invoke({}, mockRuntime)
    expect(result).toContain('【東京自由行 全體行程總覽】')
    expect(result).toContain('第 1 天 (2026-05-01, ID: day-1, rev 2, 共 1 個景點): 淺草寺')
    expect(result).toContain('第 2 天 (2026-05-02, ID: day-2, rev 1, 共 0 個景點): （尚無景點）')
  })

  it('returns specific day details with attractions and revisions when dayNumber is provided', async () => {
    const result = await (viewItineraryTool as any).invoke({ dayNumber: 1 }, mockRuntime)
    expect(result).toContain('【第 1 天行程現況】')
    expect(result).toContain('Day ID: day-1')
    expect(result).toContain('rev 2')
    expect(result).toContain('淺草寺')
    expect(result).toContain('雷門')
    expect(result).toContain('transit (30分)')
  })

  it('handles days with no attractions cleanly', async () => {
    const result = await (viewItineraryTool as any).invoke({ dayNumber: 2 }, mockRuntime)
    expect(result).toContain('【第 2 天行程現況】')
    expect(result).toContain('目前尚無景點安排')
  })

  it('returns error message when dayNumber is out of range', async () => {
    const result = await (viewItineraryTool as any).invoke({ dayNumber: 99 }, mockRuntime)
    expect(result).toContain('超出範圍')
  })

  it('handles missing itinerary gracefully', async () => {
    const emptyRuntime = { state: { request: null } } as unknown as AssistantProposalToolRuntime
    const result = await (viewItineraryTool as any).invoke({}, emptyRuntime)
    expect(result).toContain('無法讀取行程資訊')
  })
})
