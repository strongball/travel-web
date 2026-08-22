import { useRiverMutation, useRiverRef, useRiverWatch } from '@stball/react-river'
import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'

import type { AssistantThread } from '../../../lib/repositories/assistantRepository'
import { assistantConversationsProvider, assistantThreadsProvider } from '../../../providers'
import { friendlyError, rememberedThread, rememberThread } from '../assistantConversationUtils'
import { DEFAULT_THREAD_TITLE } from '../assistantTurnFlow'

const EMPTY_THREADS: AssistantThread[] = []

const chooseThread = (threads: AssistantThread[], current: string | null, remembered: string | null) => {
  const available = (id: string | null) => id && threads.some((thread) => thread.id === id) ? id : null
  return available(current) ?? available(remembered) ?? threads[0]?.id ?? null
}

export function useAssistantThreads(itineraryId: string, setError: Dispatch<SetStateAction<string | null>>) {
  const riverRef = useRiverRef()
  const provider = assistantThreadsProvider(itineraryId)
  const state = useRiverWatch(provider)
  const threads = state.data ?? EMPTY_THREADS
  const [threadId, setThreadId] = useState<string | null>(null)
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null)
  const deletingRef = useRef<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const threadStorageKey = `assistant-active-thread:${itineraryId}`

  const activate = useCallback((next: string | null) => {
    setThreadId(next)
    rememberThread(threadStorageKey, next)
  }, [threadStorageKey])

  useEffect(() => {
    setThreadId(null)
    setInitialized(false)
  }, [itineraryId])

  useEffect(() => {
    if (!state.hasData || initialized) return
    setInitialized(true)
    activate(chooseThread(threads, threadId, rememberedThread(threadStorageKey)))
  }, [activate, initialized, state.hasData, threadId, threads, threadStorageKey])

  useEffect(() => {
    if (state.isError) setError(friendlyError(state.error, '無法載入助理對話'))
  }, [setError, state.error, state.isError])

  const { mutate: create, state: createState } = useRiverMutation(
    async (ref) => ref.read(provider.notifier).create(),
  )
  const { mutate: rename } = useRiverMutation(async (ref, input: { threadId: string; title: string }) => {
    await ref.read(provider.notifier).rename(input.threadId, input.title)
  })
  const { mutate: remove } = useRiverMutation(async (ref, targetId: string) => ref.read(provider.notifier).delete(targetId))

  const currentThread = threads.find((thread) => thread.id === threadId) ?? null

  const createThread = useCallback(async () => {
    setError(null)
    try {
      const thread = await create(undefined)
      activate(thread.id)
      return thread
    } catch (error) {
      setError(friendlyError(error, '無法建立新對話'))
      throw error
    }
  }, [activate, create, setError])

  const ensureActiveThread = useCallback(async (title?: string) => {
    let thread = currentThread ?? await createThread()
    if (title && thread.title === DEFAULT_THREAD_TITLE) {
      await rename({ threadId: thread.id, title }).catch(() => {})
      thread = { ...thread, title }
    }
    return thread
  }, [createThread, currentThread, rename])

  const renameThread = useCallback(async (targetId: string, title: string) => {
    setError(null)
    try {
      await rename({ threadId: targetId, title })
    } catch (error) {
      setError(friendlyError(error, '無法重新命名對話'))
    }
  }, [rename, setError])

  const updateSummary = useCallback(async (targetId: string, summary: string) => {
    await riverRef.read(provider.notifier).updateSummary(targetId, summary)
  }, [provider, riverRef])

  const deleteThread = useCallback(async (targetId: string) => {
    const busy = riverRef.read(assistantConversationsProvider(targetId)).data?.turn?.phase === 'running'
    if (busy || deletingRef.current) return
    deletingRef.current = targetId
    setDeletingThreadId(targetId)
    setError(null)
    try {
      await remove(targetId)
      if (threadId === targetId) activate(null)
    } catch (error) {
      setError(friendlyError(error, '無法刪除對話'))
    } finally {
      deletingRef.current = null
      setDeletingThreadId(null)
    }
  }, [activate, remove, riverRef, setError, threadId])

  const isDeleting = useCallback(
    (targetId: string) => deletingRef.current === targetId,
    [],
  )

  return {
    threads,
    threadId,
    currentThread,
    loading: state.isLoading && threads.length === 0,
    creatingThread: createState.isLoading,
    deletingThreadId,
    isDeleting,
    selectThread: activate,
    showThreadList: () => activate(null),
    createThread,
    ensureActiveThread,
    renameThread,
    deleteThread,
    updateSummary,
  }
}

export type AssistantThreads = ReturnType<typeof useAssistantThreads>
