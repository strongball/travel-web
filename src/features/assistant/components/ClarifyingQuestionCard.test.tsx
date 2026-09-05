import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ClarifyingQuestionCard } from './ClarifyingQuestionCard'
import type { AssistantQuestionData } from '../types'

const sampleQuestion: AssistantQuestionData = {
  question: '這趟東京 5 天 4 夜，你和旅伴比較偏好哪種步調？',
  options: [
    { id: 'relaxed', label: '☕ 悠閒慢活', description: '每天 1~2 個景點' },
    { id: 'compact', label: '🏃 緊湊充實', description: '熱門地標打卡' },
    { id: 'family', label: '👨‍👩‍👧 親子友善', description: '少走路步調平緩' },
  ],
  multiple: false,
  allowCustomInput: true,
}

describe('ClarifyingQuestionCard', () => {
  it('renders question and options in pending interactive mode', () => {
    render(
      <ClarifyingQuestionCard
        questionData={sampleQuestion}
        busy={false}
        online={true}
      />,
    )

    expect(screen.getByText('旅程助理 想先確認你的偏好')).toBeInTheDocument()
    expect(screen.getByText('這趟東京 5 天 4 夜，你和旅伴比較偏好哪種步調？')).toBeInTheDocument()
    expect(screen.getByText('☕ 悠閒慢活')).toBeInTheDocument()
    expect(screen.getByText('🏃 緊湊充實')).toBeInTheDocument()
    expect(screen.getByText('👨‍👩‍👧 親子友善')).toBeInTheDocument()
  })

  it('triggers onAnswer when a single-select option capsule is clicked', () => {
    const handleAnswer = vi.fn()
    render(
      <ClarifyingQuestionCard
        questionData={sampleQuestion}
        busy={false}
        online={true}
        onAnswer={handleAnswer}
      />,
    )

    fireEvent.click(screen.getByText('☕ 悠閒慢活'))
    expect(handleAnswer).toHaveBeenCalledWith({
      selectedOptions: ['☕ 悠閒慢活'],
      answer: '☕ 悠閒慢活',
    })
  })

  it('supports custom input submission', () => {
    const handleAnswer = vi.fn()
    render(
      <ClarifyingQuestionCard
        questionData={sampleQuestion}
        busy={false}
        online={true}
        onAnswer={handleAnswer}
      />,
    )

    const input = screen.getByPlaceholderText('或輸入其他偏好想法…')
    fireEvent.change(input, { target: { value: '希望多排一些居酒屋' } })
    fireEvent.submit(input.closest('form')!)

    expect(handleAnswer).toHaveBeenCalledWith({
      customAnswer: '希望多排一些居酒屋',
      answer: '希望多排一些居酒屋',
    })
  })

  it('renders compact answered state when isHistory is true', () => {
    render(
      <ClarifyingQuestionCard
        questionData={sampleQuestion}
        isHistory={true}
        answeredAnswer="☕ 悠閒慢活"
      />,
    )

    expect(screen.getByText('先前偏好確認')).toBeInTheDocument()
    expect(screen.getByText('☕ 悠閒慢活')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('或輸入其他偏好想法…')).not.toBeInTheDocument()
  })
})
