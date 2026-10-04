import { useCallback, useEffect, useState, type SetStateAction } from 'react'
import {
  emptyAssistantDraft, loadAssistantDraft, saveAssistantDraft, type AssistantDraft,
} from '../utils/assistantDraftStore'
import type { AssistantAttachment } from '../types'

const drafts = new Map<string, AssistantDraft>()

/** Cache switches synchronously; IndexedDB also preserves attachments across reloads. */
export function useAssistantDraft(key: string) {
  const [state, setState] = useState(() => ({ key, draft: drafts.get(key) ?? emptyAssistantDraft(), loading: !drafts.has(key) }))
  const [storageError, setStorageError] = useState<string | null>(null)
  const current = state.key === key ? state : { key, draft: drafts.get(key) ?? emptyAssistantDraft(), loading: !drafts.has(key) }

  useEffect(() => {
    let active = true
    setStorageError(null)
    if (drafts.has(key)) {
      setState({ key, draft: drafts.get(key)!, loading: false })
    } else {
      void loadAssistantDraft(key).then((draft) => {
        if (!active) return
        const currentDraft = drafts.get(key) ?? draft
        drafts.set(key, currentDraft)
        setState({ key, draft: currentDraft, loading: false })
      }).catch(() => {
        if (!active) return
        const draft = emptyAssistantDraft()
        drafts.set(key, draft)
        setState({ key, draft, loading: false })
        setStorageError('無法讀取本機草稿；你仍可輸入與送出訊息。')
      })
    }
    return () => {
      active = false
      const draft = drafts.get(key)
      if (draft) void saveAssistantDraft(key, draft).catch(() => {})
    }
  }, [key])

  useEffect(() => {
    if (current.loading) return
    const timer = setTimeout(() => {
      void saveAssistantDraft(key, current.draft).catch(() => {
        setStorageError('本機儲存空間暫時無法使用，草稿目前保留在此頁面，請勿重新整理。')
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [key, current.draft, current.loading])

  const update = useCallback((change: (draft: AssistantDraft) => AssistantDraft) => {
    const draft = change(drafts.get(key) ?? emptyAssistantDraft())
    drafts.set(key, draft)
    setState({ key, draft, loading: false })
  }, [key])
  const setText = useCallback((value: SetStateAction<string>) => update((draft) => ({
    ...draft, text: typeof value === 'function' ? value(draft.text) : value,
  })), [update])
  const setAttachments = useCallback((value: SetStateAction<AssistantAttachment[]>) => update((draft) => ({
    ...draft, attachments: typeof value === 'function' ? value(draft.attachments) : value,
  })), [update])
  const clearDraft = useCallback((submitted?: AssistantDraft) => {
    const currentDraft = drafts.get(key) ?? emptyAssistantDraft()
    const draft = submitted ? {
      text: currentDraft.text === submitted.text ? '' : currentDraft.text,
      attachments: currentDraft.attachments.filter((file) => !submitted.attachments.some((sent) => sent.id === file.id)),
    } : emptyAssistantDraft()
    drafts.set(key, draft)
    setState({ key, draft, loading: false })
    void saveAssistantDraft(key, draft).catch(() => setStorageError('暫時無法清除本機草稿。'))
  }, [key])

  return { ...current.draft, loading: current.loading, storageError, setText, setAttachments, clearDraft }
}
