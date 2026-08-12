import { describe, expect, it } from 'vitest'
import type { Itinerary } from '../../types/database'
import { buildAssistantPrompt, localizedPlaceText, parseAssistantModelResult, verifyGooglePlace } from './assistantApi'

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
  })

  it('rejects unknown itinerary operations', () => {
    expect(() => parseAssistantModelResult({
      reply: '完成',
      proposal: { title: '改行程', explanation: '修改', operations: [{ type: 'change_currency' }] },
    })).toThrow('不支援的行程修改')
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
