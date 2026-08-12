import { describe, expect, it } from 'vitest'
import { mapExpense, parseLocation } from './rowMappers'

describe('parseLocation', () => {
  it('accepts WKT and GeoJSON point formats', () => {
    expect(parseLocation('POINT(121.5654 25.033)')).toEqual({
      longitude: 121.5654,
      latitude: 25.033,
    })
    expect(parseLocation({ type: 'Point', coordinates: [139.6917, 35.6895] })).toEqual({
      longitude: 139.6917,
      latitude: 35.6895,
    })
  })

  it('returns empty coordinates for unsupported values', () => {
    expect(parseLocation('not-a-location')).toEqual({ latitude: null, longitude: null })
  })
})

describe('mapExpense', () => {
  it('normalizes image references and orders receipt items', () => {
    const expense = mapExpense({
      id: 'expense-1',
      itinerary_id: 'trip-1',
      amount: 120,
      currency: 'TWD',
      image_url: 'receipts/legacy.jpg',
      receipt_image_paths: ['receipts/current.jpg'],
      expense_items: [
        { position: 1, source_name: 'second', quantity: 1 },
        { position: 0, source_name: 'first', quantity: 1 },
      ],
    })

    expect(expense.items.map((item) => item.sourceName)).toEqual(['first', 'second'])
    expect(expense.receiptImagePaths).toHaveLength(2)
  })
})
