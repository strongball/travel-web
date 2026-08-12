import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ReceiptScanResult } from '../../types/receipt'
import { ReceiptReviewPage } from './ReceiptReviewPage'

const result: ReceiptScanResult = {
  schemaVersion: 1,
  sourceLocale: 'ja',
  targetLocale: 'zh-TW',
  items: [
    {
      position: 0,
      sourceName: 'お茶',
      localizedName: '茶',
      quantity: 2,
      unitPrice: 100,
      lineTotal: 200,
    },
  ],
  receiptTotal: 220,
  itemsTotal: 200,
  difference: 20,
}

describe('ReceiptReviewPage', () => {
  it('shows the mismatch and returns recalculated values', () => {
    const onApply = vi.fn()
    render(
      <ReceiptReviewPage
        result={result}
        onApply={onApply}
        onCancel={() => undefined}
      />,
    )

    expect(screen.getByText(/相差/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('收據總額'), {
      target: { value: '200' },
    })
    fireEvent.click(screen.getByRole('button', { name: '套用結果' }))

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptTotal: 200,
        itemsTotal: 200,
        difference: 0,
      }),
    )
  })

  it('does not apply an item without a line total', () => {
    render(
      <ReceiptReviewPage
        result={{
          ...result,
          items: [{ ...result.items[0], lineTotal: null }],
        }}
        onApply={() => undefined}
        onCancel={() => undefined}
      />,
    )

    expect(screen.getByRole('button', { name: '套用結果' })).toBeDisabled()
  })
})
