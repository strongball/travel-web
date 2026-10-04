import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAssistantDraft } from './useAssistantDraft'

const store = vi.hoisted(() => ({ loadAssistantDraft: vi.fn(), saveAssistantDraft: vi.fn() }))
vi.mock('../utils/assistantDraftStore', () => ({
  ...store, emptyAssistantDraft: () => ({ text: '', attachments: [] }),
}))

const attachment = { id: 'file', name: '預約.pdf', mimeType: 'application/pdf', size: 3, dataUrl: 'data:application/pdf;base64,YWJj' }

describe('conversation drafts', () => {
  it('isolates text and attachments by conversation and restores them when switching back', async () => {
    store.loadAssistantDraft.mockResolvedValue({ text: '', attachments: [] })
    store.saveAssistantDraft.mockResolvedValue(undefined)
    const { result, rerender, unmount } = renderHook(({ id }) => useAssistantDraft(id), { initialProps: { id: 'draft-a' } })
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => { result.current.setText('A 的草稿'); result.current.setAttachments([attachment]) })
    rerender({ id: 'draft-b' })
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.text).toBe('')
    expect(result.current.attachments).toEqual([])
    act(() => result.current.setText('B 的草稿'))
    rerender({ id: 'draft-a' })
    expect(result.current.text).toBe('A 的草稿')
    expect(result.current.attachments).toEqual([attachment])
    unmount()
    expect(store.saveAssistantDraft).toHaveBeenCalledWith('draft-a', { text: 'A 的草稿', attachments: [attachment] })
  })

  it('restores a persisted draft and removes it only when cleared', async () => {
    store.loadAssistantDraft.mockResolvedValue({ text: '尚未送出的內容', attachments: [attachment] })
    const { result } = renderHook(() => useAssistantDraft('persisted-draft'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.attachments).toEqual([attachment])
    act(() => result.current.clearDraft())
    expect(result.current.text).toBe('')
    expect(result.current.attachments).toEqual([])
    expect(store.saveAssistantDraft).toHaveBeenCalledWith('persisted-draft', { text: '', attachments: [] })
  })
  it('does not overwrite a quick prompt with a delayed storage read', async () => {
    let resolve!: (draft: { text: string; attachments: [] }) => void
    store.loadAssistantDraft.mockReturnValueOnce(new Promise((done) => { resolve = done }))
    const { result } = renderHook(() => useAssistantDraft('quick-prompt-draft'))
    act(() => result.current.setText('使用者選取的建議'))
    await act(async () => resolve({ text: '舊草稿', attachments: [] }))
    expect(result.current.text).toBe('使用者選取的建議')
  })

  it('consumes only submitted content and retains edits and new attachments', async () => {
    store.loadAssistantDraft.mockResolvedValue({ text: '', attachments: [] })
    const { result } = renderHook(() => useAssistantDraft('concurrent-draft'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => { result.current.setText('本次訊息'); result.current.setAttachments([attachment]) })
    const submitted = { text: result.current.text, attachments: result.current.attachments }
    const nextAttachment = { ...attachment, id: 'next' }
    act(() => { result.current.setText('下一則訊息'); result.current.setAttachments([attachment, nextAttachment]) })
    act(() => result.current.clearDraft(submitted))
    expect(result.current.text).toBe('下一則訊息')
    expect(result.current.attachments).toEqual([nextAttachment])
  })

})
