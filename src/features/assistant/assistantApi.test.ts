import { describe, expect, it } from 'vitest'
import { parseAssistantModelResult, verifyGooglePlace } from './assistantApi'

describe('parseAssistantModelResult', () => {
  it('parses a regular assistant answer', () => {
    expect(parseAssistantModelResult({ reply: '第二天可以安排上野。', proposal: null })).toEqual({
      reply: '第二天可以安排上野。',
    })
  })

  it('rejects unknown itinerary operations', () => {
    expect(() => parseAssistantModelResult({
      reply: '完成',
      proposal: { title: '改行程', explanation: '修改', operations: [{ type: 'change_currency' }] },
    })).toThrow('不支援的行程修改')
  })
})

describe('verifyGooglePlace', () => {
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
