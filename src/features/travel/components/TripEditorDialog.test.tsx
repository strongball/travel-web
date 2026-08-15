import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { Itinerary } from '../../../types/database'
import { TripEditorDialog } from './TripEditorDialog'

const itinerary: Itinerary = {
  id: 'trip-1',
  title: '東京旅程',
  ownerId: 'user-1',
  currency: 'TWD',
  exchangeRates: { TWD: 1, JPY: 0.22 },
}

const commonProps = {
  saving: false,
  canDelete: false,
  onClose: vi.fn(),
  onDateChange: vi.fn(),
  onDelete: vi.fn(),
  onSave: vi.fn(),
}

describe('TripEditorDialog exchange rates', () => {
  it('updates a source currency rate without changing the itinerary currency', () => {
    const onChange = vi.fn()
    render(
      <TripEditorDialog
        {...commonProps}
        itinerary={itinerary}
        expenseCurrencies={['JPY']}
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getByRole('spinbutton', { name: 'JPY 匯率' }), {
      target: { value: '0.21' },
    })

    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      currency: 'TWD',
      exchangeRates: expect.objectContaining({ TWD: 1, JPY: 0.21 }),
    }))
  })

  it('requires rates for currencies already used by the trip', () => {
    render(
      <TripEditorDialog
        {...commonProps}
        itinerary={{ ...itinerary, exchangeRates: { TWD: 1 } }}
        expenseCurrencies={['JPY']}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByText(/尚未設定：JPY/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '儲存行程' })).toBeDisabled()
  })
})
