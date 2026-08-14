import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { TodoItem } from '../../../types/database'
import { TodoSection } from './TodoSection'

const sampleTodos: TodoItem[] = [
  {
    id: '1',
    itineraryId: 'itinerary-1',
    title: '辦護照',
    isCompleted: false,
    category: '行前準備',
    imagePath: null,
    images: [],
  },
  {
    id: '2',
    itineraryId: 'itinerary-1',
    title: '買網卡',
    isCompleted: true,
    category: '行前準備',
    imagePath: null,
    images: [],
  },
  {
    id: '3',
    itineraryId: 'itinerary-1',
    title: '帶轉接頭',
    isCompleted: false,
    category: '行李打包',
    imagePath: null,
    images: [],
  },
]

describe('TodoSection', () => {
  it('renders categories and filter chips with counts', () => {
    render(
      <TodoSection
        todos={sampleTodos}
        categories={['行前準備', '行李打包', '旅途中', '其他']}
        title=""
        category="行前準備"
        onTitleChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onSubmit={vi.fn()}
        saving={false}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onSaveTodo={vi.fn()}
        onSaveCategories={vi.fn()}
        onRenameCategory={vi.fn()}
        onDeleteCategory={vi.fn()}
      />,
    )

    // Check filter chips
    expect(screen.getByText(/全部 \(1\/3\)/)).toBeInTheDocument()
    expect(screen.getByText(/行前準備 \(1\/2\)/)).toBeInTheDocument()
    expect(screen.getByText(/行李打包 \(0\/1\)/)).toBeInTheDocument()

    // Check todo item texts
    expect(screen.getByText('辦護照')).toBeInTheDocument()
    expect(screen.getByText('買網卡')).toBeInTheDocument()
    expect(screen.getByText('帶轉接頭')).toBeInTheDocument()
  })

  it('filters by category chip click', () => {
    render(
      <TodoSection
        todos={sampleTodos}
        categories={['行前準備', '行李打包', '其他']}
        title=""
        category="行前準備"
        onTitleChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onSubmit={vi.fn()}
        saving={false}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onSaveTodo={vi.fn()}
        onSaveCategories={vi.fn()}
        onRenameCategory={vi.fn()}
        onDeleteCategory={vi.fn()}
      />,
    )

    // Click on '行李打包' chip
    fireEvent.click(screen.getByText(/行李打包 \(0\/1\)/))

    // Now only '帶轉接頭' should be shown under displayed groups
    expect(screen.getByText('帶轉接頭')).toBeInTheDocument()
    expect(screen.queryByText('辦護照')).not.toBeInTheDocument()
  })

  it('opens category manager dialog and handles adding a new category', () => {
    const onSaveCategories = vi.fn()
    render(
      <TodoSection
        todos={sampleTodos}
        categories={['行前準備', '行李打包', '其他']}
        title=""
        category="行前準備"
        onTitleChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onSubmit={vi.fn()}
        saving={false}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
        onSaveTodo={vi.fn()}
        onSaveCategories={onSaveCategories}
        onRenameCategory={vi.fn()}
        onDeleteCategory={vi.fn()}
      />,
    )

    // Click "管理分類"
    fireEvent.click(screen.getByRole('button', { name: '管理分類' }))

    // Dialog should open
    expect(screen.getByText('管理待辦事項分類')).toBeInTheDocument()

    // Add new category
    const input = screen.getByPlaceholderText(/新增自訂分類名稱/)
    fireEvent.change(input, { target: { value: '美食清單' } })
    fireEvent.click(screen.getByRole('button', { name: '新增' }))

    expect(onSaveCategories).toHaveBeenCalledWith(['行前準備', '行李打包', '其他', '美食清單'])
  })

  it('toggles and deletes todos', () => {
    const onToggle = vi.fn()
    const onDelete = vi.fn()

    render(
      <TodoSection
        todos={sampleTodos}
        categories={['行前準備', '行李打包']}
        title=""
        category="行前準備"
        onTitleChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onSubmit={vi.fn()}
        saving={false}
        onToggle={onToggle}
        onDelete={onDelete}
        onSaveTodo={vi.fn()}
        onSaveCategories={vi.fn()}
        onRenameCategory={vi.fn()}
        onDeleteCategory={vi.fn()}
      />,
    )

    // Click toggle on '辦護照'
    const checkbox = screen.getByRole('checkbox', { name: '完成 辦護照' })
    fireEvent.click(checkbox)
    expect(onToggle).toHaveBeenCalledWith(sampleTodos[0])

    // Click delete on '辦護照'
    const deleteBtn = screen.getByRole('button', { name: '刪除 辦護照' })
    fireEvent.click(deleteBtn)
    expect(onDelete).toHaveBeenCalledWith(sampleTodos[0])
  })
})
