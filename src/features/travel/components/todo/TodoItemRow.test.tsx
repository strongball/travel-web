import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TodoItemRow } from './TodoItemRow'
import type { TodoItem } from '../../../../types/database'

const sampleTodo: TodoItem = {
  id: 'todo-1',
  itineraryId: 'itinerary-1',
  title: '換日幣現金',
  isCompleted: false,
  category: '行前準備',
  imagePath: null,
  images: [],
}

describe('TodoItemRow', () => {
  it('renders todo item title and checkbox correctly', () => {
    render(
      <TodoItemRow
        todo={sampleTodo}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('換日幣現金')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '完成 換日幣現金' })).not.toBeChecked()
  })

  it('triggers onToggle when checkbox is clicked', () => {
    const onToggle = vi.fn()
    render(
      <TodoItemRow
        todo={sampleTodo}
        onToggle={onToggle}
        onDelete={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole('checkbox', { name: '完成 換日幣現金' }))
    expect(onToggle).toHaveBeenCalledWith(sampleTodo)
  })

  it('triggers onDelete when delete button is clicked', () => {
    const onDelete = vi.fn()
    render(
      <TodoItemRow
        todo={sampleTodo}
        onToggle={vi.fn()}
        onDelete={onDelete}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '刪除 換日幣現金' }))
    expect(onDelete).toHaveBeenCalledWith(sampleTodo)
  })

  it('triggers onToggle when swipe right exceeds threshold', () => {
    const onToggle = vi.fn()
    const { container } = render(
      <TodoItemRow
        todo={sampleTodo}
        onToggle={onToggle}
        onDelete={vi.fn()}
      />,
    )

    const swipeContainer = container.firstChild as HTMLElement

    // Touch start at clientX = 50, clientY = 100
    fireEvent.touchStart(swipeContainer, {
      touches: [{ clientX: 50, clientY: 100 }],
    })
    // Touch move to clientX = 180 (delta = +130 > 65)
    fireEvent.touchMove(swipeContainer, {
      touches: [{ clientX: 180, clientY: 102 }],
    })
    // Touch end
    fireEvent.touchEnd(swipeContainer)

    expect(onToggle).toHaveBeenCalledWith(sampleTodo)
  })

  it('triggers onDelete when swipe left exceeds threshold', () => {
    const onDelete = vi.fn()
    const { container } = render(
      <TodoItemRow
        todo={sampleTodo}
        onToggle={vi.fn()}
        onDelete={onDelete}
      />,
    )

    const swipeContainer = container.firstChild as HTMLElement

    // Touch start at clientX = 200, clientY = 100
    fireEvent.touchStart(swipeContainer, {
      touches: [{ clientX: 200, clientY: 100 }],
    })
    // Touch move to clientX = 80 (delta = -120 < -65)
    fireEvent.touchMove(swipeContainer, {
      touches: [{ clientX: 80, clientY: 102 }],
    })
    // Touch end
    fireEvent.touchEnd(swipeContainer)

    expect(onDelete).toHaveBeenCalledWith(sampleTodo)
  })
})
