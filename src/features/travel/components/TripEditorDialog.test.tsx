import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RiverScope } from '@stball/react-river'

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

const renderWithScope = (ui: React.ReactElement) => render(<RiverScope>{ui}</RiverScope>)

describe('TripEditorDialog exchange rates', () => {
  it('updates a source currency rate without changing the itinerary currency', () => {
    const onChange = vi.fn()
    renderWithScope(
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
    renderWithScope(
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

  it('allows quick adding a popular currency', () => {
    const onChange = vi.fn()
    renderWithScope(
      <TripEditorDialog
        {...commonProps}
        itinerary={itinerary}
        expenseCurrencies={[]}
        onChange={onChange}
      />,
    )

    // KRW is one of the popular currencies and not yet in the trip rates
    const krwChip = screen.getByRole('button', { name: /KRW 韓元/i })
    expect(krwChip).toBeInTheDocument()
    fireEvent.click(krwChip)

    // JPY rate input should still exist, and KRW should now have a rate input
    expect(screen.getByRole('spinbutton', { name: 'KRW 匯率' })).toBeInTheDocument()
  })

  it('updates rates when clicking live rate update', async () => {
    const onChange = vi.fn()
    const mockResponse = {
      result: 'success',
      base_code: 'TWD',
      rates: { TWD: 1, JPY: 4.8 }, // 1 TWD = 4.8 JPY => 1 JPY = 0.208333 TWD
    }
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    }) as unknown as typeof fetch

    try {
      renderWithScope(
        <TripEditorDialog
          {...commonProps}
          itinerary={itinerary}
          expenseCurrencies={['JPY']}
          onChange={onChange}
        />,
      )

      const autoFetchBtn = screen.getByRole('button', { name: /一鍵更新即時匯率/ })
      fireEvent.click(autoFetchBtn)

      // Wait for fetch resolution
      await screen.findByText(/已更新/i)
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
        exchangeRates: expect.objectContaining({
          TWD: 1,
          JPY: expect.any(Number),
        }),
      }))
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

