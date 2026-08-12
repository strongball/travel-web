import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { emptyExpenseDraft, type ExpenseDraft } from '../../types/database'
import { ExpenseEditorPage } from './ExpenseEditorPage'

describe('ExpenseEditorPage', () => {
  it('enables scanning only after an image is selected', () => {
    const onScan = vi.fn()

    function Harness() {
      const [draft, setDraft] = useState<ExpenseDraft>({
        ...emptyExpenseDraft('trip-1'),
        title: '午餐',
      })
      return (
        <ExpenseEditorPage
          draft={draft}
          itineraries={[
            { id: 'trip-1', title: '東京', ownerId: 'user-1', currency: 'JPY' },
          ]}
          onChange={setDraft}
          onScan={onScan}
          onSave={() => undefined}
          onCancel={() => undefined}
        />
      )
    }

    const { container } = render(<Harness />)
    const scanButton = screen.getByRole('button', {
      name: '使用 Gemini 掃描收據',
    })
    expect(scanButton).toBeDisabled()

    const input = container.querySelector('input[type="file"]')
    expect(input).not.toBeNull()
    fireEvent.change(input!, {
      target: {
        files: [new File(['receipt'], 'receipt.jpg', { type: 'image/jpeg' })],
      },
    })

    expect(scanButton).toBeEnabled()
    fireEvent.click(scanButton)
    expect(onScan).toHaveBeenCalledOnce()
  })
})
