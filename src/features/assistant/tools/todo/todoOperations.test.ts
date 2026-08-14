import { describe, expect, it } from 'vitest'
import {
  extractProposedCategories,
  extractProposedTodos,
} from './todoOperations'

describe('todoOperations', () => {
  it('extracts proposed todos and categories from operations', () => {
    const operations = [
      { type: 'add_todo_category' as const, name: '票券預約' },
      { type: 'add_todo' as const, title: '預約晴空塔展望台門票', category: '票券預約' },
      { type: 'add_todo' as const, title: '購買網卡 eSIM', category: '行前準備' },
    ]

    const todos = extractProposedTodos(operations)
    expect(todos).toEqual([
      { title: '預約晴空塔展望台門票', category: '票券預約' },
      { title: '購買網卡 eSIM', category: '行前準備' },
    ])

    const categories = extractProposedCategories(operations)
    expect(categories).toEqual(['票券預約'])
  })
})
