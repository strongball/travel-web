import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { ChatComposer } from './ChatComposer'

const mocks = vi.hoisted(() => ({ snapshot: { data: { turn: null as unknown }, isLoading: false, hasData: true, isError: false } }))
vi.mock('@stball/react-river', async (importOriginal) => ({
  ...await importOriginal<typeof import('@stball/react-river')>(),
  useRiverWatch: () => mocks.snapshot,
}))
vi.mock('../hooks/useSpeechRecognition', () => ({ useSpeechRecognition: () => ({ isListening: false, error: null, clearError: vi.fn(), toggleListening: vi.fn() }) }))
vi.mock('./ModelSelector', () => ({ ModelSelector: () => null }))
afterEach(() => { cleanup(); mocks.snapshot.data.turn = null })

const props = () => ({ itineraryId: 'trip', threadId: 'thread', onSubmit: vi.fn(), onClearError: vi.fn(), onClearNotice: vi.fn() })

describe('ChatComposer controls', () => {
  it('allows Enter and IME Enter without sending, and sends multiline text with the button', () => {
    const inputProps = props()
    render(<ChatComposer {...inputProps} />)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '第一行\n第二行' } })
    expect(fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })).toBe(true)
    expect(fireEvent.keyDown(input, { key: 'Enter', isComposing: true, keyCode: 229 })).toBe(true)
    expect(inputProps.onSubmit).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '送出訊息' }))
    expect(inputProps.onSubmit).toHaveBeenCalledWith(expect.objectContaining({ text: '第一行\n第二行' }))
  })

  it('leaves turn failures and retry controls to the conversation bubble', () => {
    mocks.snapshot.data.turn = { phase: 'error', error: '生成失敗', canRetry: true }
    render(<ChatComposer {...props()} />)
    expect(screen.queryByText('生成失敗')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重試' })).not.toBeInTheDocument()
  })
})
