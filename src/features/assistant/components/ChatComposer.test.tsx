import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import type { ChatComposerHandle } from './ChatComposer'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { userIdProvider } from '../../../providers/authProviders'
import { ChatComposer } from './ChatComposer'

const mocks = vi.hoisted(() => ({ snapshot: { data: { turn: null as unknown }, isLoading: false, hasData: true, isError: false } }))
vi.mock('@stball/react-river', async (importOriginal) => ({
  ...await importOriginal<typeof import('@stball/react-river')>(),
  useRiverWatch: (provider: unknown) => provider === userIdProvider ? 'test-user' : mocks.snapshot,
}))
vi.mock('../hooks/useSpeechRecognition', () => ({ useSpeechRecognition: () => ({ isListening: false, error: null, clearError: vi.fn(), toggleListening: vi.fn() }) }))
vi.mock('./ModelSelector', () => ({ ModelSelector: () => null }))
afterEach(() => { cleanup(); mocks.snapshot.data.turn = null })

const props = () => ({ itineraryId: 'trip', threadId: crypto.randomUUID(), onSubmit: vi.fn(), onClearError: vi.fn(), onClearNotice: vi.fn() })

describe('ChatComposer controls', () => {
  it('allows Enter and IME Enter without sending, and sends multiline text with the button', async () => {
    const inputProps = props()
    render(<ChatComposer {...inputProps} />)
    const input = screen.getByRole('textbox')
    await waitFor(() => expect(input).not.toBeDisabled())
    fireEvent.change(input, { target: { value: '第一行\n第二行' } })
    expect(fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })).toBe(true)
    expect(fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 })).toBe(true)
    expect(inputProps.onSubmit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '送出訊息' }))
    expect(inputProps.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ text: '第一行\n第二行' }), expect.any(Function))
  })

  it('leaves turn failures and retry controls to the conversation bubble', () => {
    mocks.snapshot.data.turn = { phase: 'error', error: '生成失敗', canRetry: true }
    render(<ChatComposer {...props()} />)
    expect(screen.queryByText('生成失敗')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重試' })).not.toBeInTheDocument()
  })
  it('keeps the draft when sending is refused or throws, then clears it after acceptance', async () => {
    const onSubmit = vi.fn().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error('尚未送出')).mockResolvedValueOnce(true)
    render(<ChatComposer {...props()} onSubmit={onSubmit} />)
    const input = screen.getByRole('textbox')
    await waitFor(() => expect(input).not.toBeDisabled())
    fireEvent.change(input, { target: { value: '保留這份草稿' } })
    fireEvent.click(screen.getByRole('button', { name: '送出訊息' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '送出訊息' })).not.toBeDisabled())
    expect(input).toHaveValue('保留這份草稿')
    fireEvent.click(screen.getByRole('button', { name: '送出訊息' }))
    await screen.findByText('尚未送出')
    expect(input).toHaveValue('保留這份草稿')
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    await waitFor(() => expect(input).toHaveValue(''))
    expect(onSubmit).toHaveBeenCalledTimes(3)
  })

  it('keeps the next draft editable while generating and never clears it on completion', async () => {
    let finish!: (accepted: boolean) => void
    const onSubmit = vi.fn((_payload, onAccepted) => { onAccepted(); return new Promise<boolean>((resolve) => { finish = resolve }) })
    const inputProps = { ...props(), onSubmit }
    const { rerender } = render(<ChatComposer {...inputProps} />)
    const input = screen.getByRole('textbox')
    await waitFor(() => expect(input).not.toBeDisabled())
    fireEvent.change(input, { target: { value: '第一則' } })
    fireEvent.click(screen.getByRole('button', { name: '送出訊息' }))
    await waitFor(() => expect(input).toHaveValue(''))
    mocks.snapshot.data.turn = { phase: 'running' }
    rerender(<ChatComposer {...inputProps} />)
    expect(input).not.toBeDisabled()
    fireEvent.change(input, { target: { value: '下一則草稿' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    expect(onSubmit).toHaveBeenCalledTimes(1)
    finish(true)
    await waitFor(() => expect(input).toHaveValue('下一則草稿'))
  })

  it('appends quick prompts instead of replacing an existing draft', async () => {
    const ref = createRef<ChatComposerHandle>()
    render(<ChatComposer {...props()} ref={ref} />)
    const input = screen.getByRole('textbox')
    await waitFor(() => expect(input).not.toBeDisabled())
    fireEvent.change(input, { target: { value: '原本的想法' } })
    const { act } = await import('@testing-library/react')
    act(() => ref.current?.setText('檢查行程'))
    expect(input).toHaveValue('原本的想法\n檢查行程')
  })

  it('accepts pasted and dropped files without submitting a message', async () => {
    const inputProps = props()
    const { container } = render(<ChatComposer {...inputProps} />)
    const input = screen.getByRole('textbox')
    await waitFor(() => expect(input).not.toBeDisabled())
    fireEvent.paste(input, { clipboardData: { files: [new File(['預約'], 'note.txt', { type: 'text/plain' })] } })
    await screen.findByRole('button', { name: '預覽 note.txt' })
    fireEvent.drop(container.querySelector('form')!, { dataTransfer: { types: ['Files'], files: [new File(['路線'], 'route.txt', { type: 'text/plain' })] } })
    await screen.findByRole('button', { name: '預覽 route.txt' })
    expect(inputProps.onSubmit).not.toHaveBeenCalled()
  })

})
