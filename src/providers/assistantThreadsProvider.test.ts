import { RiverContainer } from '@stball/react-river'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createAssistantThread: vi.fn(),
  deleteAssistantThread: vi.fn(),
  listAssistantThreads: vi.fn(),
  renameAssistantThread: vi.fn(),
  updateAssistantThreadSummary: vi.fn(),
}))

vi.mock('../lib/repositories', () => mocks)

import { userIdProvider } from './authProviders'
import { assistantThreadsProvider } from './assistantThreadsProvider'
import type { AssistantThread } from '../lib/repositories/assistantRepository'

const thread = (id: string, title = '測試對話'): AssistantThread => ({
  id,
  title,
  summary: '',
  updatedAt: '2026-08-22T00:00:00.000Z',
})

let container: RiverContainer

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createAssistantThread.mockResolvedValue(thread('thread-2'))
  mocks.deleteAssistantThread.mockResolvedValue(undefined)
  mocks.renameAssistantThread.mockResolvedValue(undefined)
  mocks.updateAssistantThreadSummary.mockResolvedValue(undefined)
})

afterEach(() => {
  container.dispose()
})

describe('assistantThreadsProvider', () => {
  it('owns thread loading and CRUD state for one itinerary', async () => {
    const first = thread('thread-1')
    const created = thread('thread-2')
    mocks.listAssistantThreads.mockResolvedValueOnce([first])

    container = new RiverContainer({
      overrides: [{ original: userIdProvider, create: () => 'user-1' }],
    })
    const provider = assistantThreadsProvider('trip-1')

    await container.read(provider.promise)
    const notifier = container.read(provider.notifier)
    expect(container.read(provider).data).toEqual([first])

    await notifier.create()
    expect(mocks.createAssistantThread).toHaveBeenCalledWith('trip-1', 'user-1')
    expect(container.read(provider).data).toEqual([created, first])

    await notifier.rename(first.id, '新標題')
    expect(mocks.renameAssistantThread).toHaveBeenCalledWith(first.id, '新標題')
    expect(container.read(provider).data?.find((item) => item.id === first.id)?.title).toBe('新標題')

    await notifier.updateSummary(first.id, '摘要')
    expect(mocks.updateAssistantThreadSummary).toHaveBeenCalledWith(first.id, '摘要')
    expect(container.read(provider).data?.find((item) => item.id === first.id)?.summary).toBe('摘要')

    await notifier.delete(first.id)
    expect(mocks.deleteAssistantThread).toHaveBeenCalledWith(first.id)
    expect(container.read(provider).data).toEqual([created])
    expect(mocks.listAssistantThreads).toHaveBeenCalledTimes(1)
  })

  it('keeps a local mutation when an older refresh resolves afterwards', async () => {
    const first = thread('thread-1')
    let resolveRefresh!: (threads: AssistantThread[]) => void
    mocks.listAssistantThreads
      .mockResolvedValueOnce([first])
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveRefresh = resolve
      }))

    container = new RiverContainer({
      overrides: [{ original: userIdProvider, create: () => 'user-1' }],
    })
    const provider = assistantThreadsProvider('trip-1')

    await container.read(provider.promise)
    const notifier = container.read(provider.notifier)
    const refreshPromise = notifier.refresh()

    await notifier.rename(first.id, '新標題')
    resolveRefresh([{ ...first, title: '舊標題' }])
    await refreshPromise

    expect(container.read(provider).data?.[0].title).toBe('新標題')
  })
})
