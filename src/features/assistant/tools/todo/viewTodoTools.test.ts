import { describe, expect, it } from 'vitest'
import {
  viewTodoCategoriesTool,
  viewTodoListTool,
} from './viewTodoTools'
import type { AssistantProposalToolRuntime } from '../proposalToolRuntime'

describe('viewTodoTools', () => {
  const mockRuntime = {
    state: {
      request: {
        todoCategories: ['行前準備', '行李打包'],
        todos: [
          { title: '購買 eSIM 網卡', category: '行前準備', isCompleted: true },
          { title: '預約晴空塔門票', category: '行前準備', isCompleted: false },
          { title: '換日幣', category: '行前準備', isCompleted: false },
          { title: '帶雨傘', category: '行李打包', isCompleted: true },
          { title: '帶行動電源', category: '行李打包', isCompleted: false },
        ],
      },
    },
  } as unknown as AssistantProposalToolRuntime

  describe('viewTodoCategoriesTool', () => {
    it('summarizes categories and counts correctly', async () => {
      const result = await (viewTodoCategoriesTool as any).invoke({}, mockRuntime)
      expect(result).toContain('【目前待辦分類概況】（共 5 項待辦，待完成 3 項，已完成 2 項）')
      expect(result).toContain('【行前準備】（共 3 項，待完成 2 項，已完成 1 項）')
      expect(result).toContain('【行李打包】（共 2 項，待完成 1 項，已完成 1 項）')
    })

    it('handles empty categories and todos gracefully', async () => {
      const emptyRuntime = {
        state: {
          request: {
            todoCategories: [],
            todos: [],
          },
        },
      } as unknown as AssistantProposalToolRuntime
      const result = await (viewTodoCategoriesTool as any).invoke({}, emptyRuntime)
      expect(result).toContain('目前尚無建立任何待辦事項與分類')
    })
  })

  describe('viewTodoListTool', () => {
    it('lists all todos when no filter is provided', async () => {
      const result = await (viewTodoListTool as any).invoke({}, mockRuntime)
      expect(result).toContain('共 5 項')
      expect(result).toContain('[已完成] 購買 eSIM 網卡')
      expect(result).toContain('[未完成] 預約晴空塔門票')
      expect(result).toContain('[未完成] 帶行動電源')
    })

    it('filters by category', async () => {
      const result = await (viewTodoListTool as any).invoke({ category: '行李打包' }, mockRuntime)
      expect(result).toContain('分類: 行李打包')
      expect(result).toContain('共 2 項')
      expect(result).toContain('帶雨傘')
      expect(result).toContain('帶行動電源')
      expect(result).not.toContain('購買 eSIM 網卡')
    })

    it('filters by pending status', async () => {
      const result = await (viewTodoListTool as any).invoke({ status: 'pending' }, mockRuntime)
      expect(result).toContain('共 3 項')
      expect(result).toContain('[未完成] 預約晴空塔門票')
      expect(result).toContain('[未完成] 換日幣')
      expect(result).toContain('[未完成] 帶行動電源')
      expect(result).not.toContain('[已完成]')
    })

    it('filters by completed status and category combined', async () => {
      const result = await (viewTodoListTool as any).invoke(
        { category: '行前準備', status: 'completed' },
        mockRuntime,
      )
      expect(result).toContain('共 1 項')
      expect(result).toContain('[已完成] 購買 eSIM 網卡')
      expect(result).not.toContain('晴空塔')
    })

    it('handles non-existent category', async () => {
      const result = await (viewTodoListTool as any).invoke({ category: '不存在的分類' }, mockRuntime)
      expect(result).toContain('查無任何待辦事項')
    })

    it('handles empty todos', async () => {
      const emptyRuntime = {
        state: {
          request: {
            todos: [],
          },
        },
      } as unknown as AssistantProposalToolRuntime
      const result = await (viewTodoListTool as any).invoke({}, emptyRuntime)
      expect(result).toContain('目前尚無任何待辦事項')
    })
  })
})
