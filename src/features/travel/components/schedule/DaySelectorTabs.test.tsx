import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DaySelectorTabs } from './DaySelectorTabs'
import type { TripDay } from '../../../../types/database'

const sampleDays: TripDay[] = [
  {
    id: 'day-1',
    itineraryId: 'trip-1',
    revision: 0,
    date: '2026-09-01', // Tuesday (週二)
    startTime: '2026-09-01T09:00:00',
    attractions: [
      {
        id: 'attr-1',
        dayId: 'day-1',
        name: '清水寺',
        description: '',
        locationName: '',
        duration: 90,
        cost: 400,
        latitude: null,
        longitude: null,
        placeId: null,
        startTime: '2026-09-01T09:00:00',
        endTime: '2026-09-01T10:30:00',
        transportMode: null,
        travelTime: null,
      },
      {
        id: 'attr-2',
        dayId: 'day-1',
        name: '地主神社',
        description: '',
        locationName: '',
        duration: 45,
        cost: 0,
        latitude: null,
        longitude: null,
        placeId: null,
        startTime: '2026-09-01T10:30:00',
        endTime: '2026-09-01T11:15:00',
        transportMode: null,
        travelTime: null,
      },
    ],
  },
  {
    id: 'day-2',
    itineraryId: 'trip-1',
    revision: 0,
    date: '2026-09-02', // Wednesday (週三)
    startTime: '2026-09-02T09:30:00',
    attractions: [],
  },
]

describe('DaySelectorTabs', () => {
  it('renders DAY headers, weekdays, and attraction counts', () => {
    render(
      <DaySelectorTabs
        days={sampleDays}
        activeDayIndex={0}
        onSelectDay={vi.fn()}
      />,
    )

    expect(screen.getByText('DAY 1')).toBeInTheDocument()
    expect(screen.getByText('DAY 2')).toBeInTheDocument()

    // Weekdays
    expect(screen.getByText('(週二)')).toBeInTheDocument()
    expect(screen.getByText('(週三)')).toBeInTheDocument()

    // Attraction counts
    expect(screen.getByText('2 個景點')).toBeInTheDocument()
    expect(screen.getByText('尚無景點')).toBeInTheDocument()
  })

  it('triggers onSelectDay when tab is clicked', () => {
    const onSelectDay = vi.fn()
    render(
      <DaySelectorTabs
        days={sampleDays}
        activeDayIndex={0}
        onSelectDay={onSelectDay}
      />,
    )

    fireEvent.click(screen.getByText('DAY 2'))
    expect(onSelectDay).toHaveBeenCalledWith(1)
  })
})
