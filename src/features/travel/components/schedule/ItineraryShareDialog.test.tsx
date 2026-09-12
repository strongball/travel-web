import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ItineraryShareDialog } from './ItineraryShareDialog'
import type { Itinerary } from '../../../../types/database'

const sampleItinerary: Itinerary = {
  id: 'trip-1',
  ownerId: 'user-1',
  title: '東京賞楓五日遊',
  currency: 'JPY',
  startDate: '2026-11-10',
  endDate: '2026-11-14',
  days: [
    {
      id: 'day-1',
      itineraryId: 'trip-1',
      revision: 0,
      date: '2026-11-10',
      startTime: '2026-11-10T09:00:00',
      attractions: [
        {
          id: 'attr-1',
          dayId: 'day-1',
          name: '淺草寺',
          description: '抽御籤與拍照',
          locationName: '東京都台東區淺草2-3-1',
          duration: 90,
          cost: 500,
          latitude: null,
          longitude: null,
          placeId: null,
          startTime: '2026-11-10T09:30:00',
          endTime: '2026-11-10T11:00:00',
          transportMode: null,
          travelTime: null,
        },
      ],
    },
    {
      id: 'day-2',
      itineraryId: 'trip-1',
      revision: 0,
      date: '2026-11-11',
      startTime: '2026-11-11T09:30:00',
      attractions: [],
    },
  ],
  exchangeRates: { JPY: 0.22 },
  todoCategories: ['行前準備'],
}

describe('ItineraryShareDialog', () => {
  it('renders dialog and formats day text properly', () => {
    render(
      <ItineraryShareDialog
        open={true}
        itinerary={sampleItinerary}
        activeDayIndex={0}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByText('分享 / 匯出文字行程')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /當日行程/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /完整行程/ })).toBeInTheDocument()

    // The text field should contain the formatted day 1 details
    const textInput = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textInput.value).toContain('東京賞楓五日遊')
    expect(textInput.value).toContain('DAY 1')
    expect(textInput.value).toContain('淺草寺')
    expect(textInput.value).toContain('抽御籤與拍照')
    expect(textInput.value).toContain('東京都台東區淺草2-3-1')
  })

  it('switches to all days mode when tab is clicked', () => {
    render(
      <ItineraryShareDialog
        open={true}
        itinerary={sampleItinerary}
        activeDayIndex={0}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('tab', { name: /完整行程/ }))
    const textInput = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textInput.value).toContain('DAY 1')
    expect(textInput.value).toContain('DAY 2')
    expect(textInput.value).toContain('此日尚無安排景點')
  })
})
