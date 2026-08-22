import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScheduleSection } from './ScheduleSection'
import type { TripDay } from '../../../types/database'

const sampleDays: TripDay[] = [
  {
    id: 'day-1',
    itineraryId: 'trip-1',
    revision: 0,
    date: '2026-09-01',
    startTime: '2026-09-01T09:00:00',
    attractions: [
      {
        id: 'attr-1',
        dayId: 'day-1',
        name: '清水寺',
        description: '京都著名古寺',
        locationName: '京都府京都市東山區清水1丁目294',
        duration: 90,
        cost: 400,
        latitude: 34.9948,
        longitude: 135.785,
        placeId: 'place-1',
        startTime: '2026-09-01T09:00:00',
        endTime: '2026-09-01T10:30:00',
        transportMode: null,
        travelTime: null,
      },
    ],
  },
  {
    id: 'day-2',
    itineraryId: 'trip-1',
    revision: 0,
    date: '2026-09-02',
    startTime: '2026-09-02T09:30:00',
    attractions: [
      {
        id: 'attr-2',
        dayId: 'day-2',
        name: '金閣寺',
        description: '金碧輝煌的舍利殿',
        locationName: '京都府京都市北區金閣寺町1',
        duration: 60,
        cost: 500,
        latitude: 35.0394,
        longitude: 135.7292,
        placeId: 'place-2',
        startTime: '2026-09-02T09:30:00',
        endTime: '2026-09-02T10:30:00',
        transportMode: null,
        travelTime: null,
      },
    ],
  },
]

describe('ScheduleSection', () => {
  it('renders Day 1 attractions initially', () => {
    render(
      <ScheduleSection
        days={sampleDays}
        currency="JPY"
        onAddAttraction={vi.fn()}
        onEditAttraction={vi.fn()}
        onEditTravelInfo={vi.fn()}
        onDeleteAttraction={vi.fn()}
        onStartTimeChange={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    expect(screen.getByText('清水寺')).toBeInTheDocument()
    expect(screen.queryByText('金閣寺')).not.toBeInTheDocument()
  })

  it('switches to Day 2 when next day button is clicked', () => {
    render(
      <ScheduleSection
        days={sampleDays}
        currency="JPY"
        onAddAttraction={vi.fn()}
        onEditAttraction={vi.fn()}
        onEditTravelInfo={vi.fn()}
        onDeleteAttraction={vi.fn()}
        onStartTimeChange={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    const nextBtn = screen.getByRole('button', { name: '切換至下一天' })
    fireEvent.click(nextBtn)

    expect(screen.getByText('金閣寺')).toBeInTheDocument()
    expect(screen.queryByText('清水寺')).not.toBeInTheDocument()
  })

  it('switches to Day 2 when swiping left on the schedule card', () => {
    const { container } = render(
      <ScheduleSection
        days={sampleDays}
        currency="JPY"
        onAddAttraction={vi.fn()}
        onEditAttraction={vi.fn()}
        onEditTravelInfo={vi.fn()}
        onDeleteAttraction={vi.fn()}
        onStartTimeChange={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    // Touch swipe left on schedule area
    const touchArea = container.querySelector('[style*="pan-y"]') || container.children[0].children[1]
    expect(touchArea).toBeInTheDocument()

    fireEvent.touchStart(touchArea, {
      touches: [{ clientX: 250, clientY: 100 }],
    })
    fireEvent.touchMove(touchArea, {
      touches: [{ clientX: 100, clientY: 105 }],
    })
    fireEvent.touchEnd(touchArea)

    expect(screen.getByText('金閣寺')).toBeInTheDocument()
  })

  it('switches back to Day 1 when swiping right on Day 2', () => {
    const { container } = render(
      <ScheduleSection
        days={sampleDays}
        currency="JPY"
        onAddAttraction={vi.fn()}
        onEditAttraction={vi.fn()}
        onEditTravelInfo={vi.fn()}
        onDeleteAttraction={vi.fn()}
        onStartTimeChange={vi.fn()}
        onReorder={vi.fn()}
      />,
    )

    // Switch to Day 2 first
    const nextBtn = screen.getByRole('button', { name: '切換至下一天' })
    fireEvent.click(nextBtn)
    expect(screen.getByText('金閣寺')).toBeInTheDocument()

    // Swipe right (clientX from 100 to 250)
    const touchArea = container.querySelector('[style*="pan-y"]') || container.children[0].children[1]
    fireEvent.touchStart(touchArea, {
      touches: [{ clientX: 100, clientY: 100 }],
    })
    fireEvent.touchMove(touchArea, {
      touches: [{ clientX: 250, clientY: 105 }],
    })
    fireEvent.touchEnd(touchArea)

    expect(screen.getByText('清水寺')).toBeInTheDocument()
  })
})
