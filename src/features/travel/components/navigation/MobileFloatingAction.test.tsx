import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MobileFloatingAction } from './MobileFloatingAction'

describe('MobileFloatingAction', () => {
  it('renders nothing when visible is false', () => {
    render(
      <MobileFloatingAction
        section="schedule"
        visible={false}
        onAddAttraction={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: '新增景點' })).not.toBeInTheDocument()
  })

  it('renders "新增景點" button for schedule section and triggers callback', () => {
    const onAddAttraction = vi.fn()
    render(
      <MobileFloatingAction
        section="schedule"
        visible={true}
        onAddAttraction={onAddAttraction}
      />,
    )

    const btn = screen.getByRole('button', { name: '新增景點' })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onAddAttraction).toHaveBeenCalledTimes(1)
  })

  it('renders "新增待辦" button for todos section and triggers callback', () => {
    const onFocusTodoInput = vi.fn()
    render(
      <MobileFloatingAction
        section="todos"
        visible={true}
        onFocusTodoInput={onFocusTodoInput}
      />,
    )

    const btn = screen.getByRole('button', { name: '新增待辦' })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onFocusTodoInput).toHaveBeenCalledTimes(1)
  })

  it('renders "新增費用" button for expenses section and triggers callback', () => {
    const onAddExpense = vi.fn()
    render(
      <MobileFloatingAction
        section="expenses"
        visible={true}
        onAddExpense={onAddExpense}
      />,
    )

    const btn = screen.getByRole('button', { name: '新增費用' })
    expect(btn).toBeInTheDocument()
    fireEvent.click(btn)
    expect(onAddExpense).toHaveBeenCalledTimes(1)
  })

  it('renders nothing for overview or assistant sections', () => {
    const { rerender } = render(
      <MobileFloatingAction
        section="overview"
        visible={true}
        onAddExpense={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()

    rerender(
      <MobileFloatingAction
        section="assistant"
        visible={true}
        onAddExpense={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
