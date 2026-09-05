import { describe, expect, it, vi } from 'vitest'
import { askClarifyingQuestionSchema } from './questionToolSchema'
import { ASK_CLARIFYING_QUESTION_TOOL_NAME, askClarifyingQuestionTool, askQuestion } from './questionTool'

vi.mock('@langchain/langgraph/web', () => ({
  interrupt: vi.fn(() => ({
    selectedOptions: ['☕ 悠閒慢活'],
    answer: '☕ 悠閒慢活',
  })),
}))

describe('questionToolSchema', () => {
  it('validates a correct question input', () => {
    const valid = {
      question: '請問這趟東京行的旅行步調偏好？',
      options: [
        { id: 'relaxed', label: '☕ 悠閒慢活', description: '每天 1~2 個景點' },
        { id: 'packed', label: '🏃 緊湊充實', description: '熱門地標打卡' },
      ],
      multiple: false,
      allowCustomInput: true,
    }
    const parsed = askClarifyingQuestionSchema.parse(valid)
    expect(parsed.question).toBe('請問這趟東京行的旅行步調偏好？')
    expect(parsed.options).toHaveLength(2)
  })

  it('fails validation when fewer than 2 options are provided', () => {
    const invalid = {
      question: '問題',
      options: [{ id: '1', label: '只有一個' }],
    }
    expect(() => askClarifyingQuestionSchema.parse(invalid)).toThrow()
  })
})

describe('askQuestion runtime function', () => {
  it('calls interrupt and formats user answer correctly', async () => {
    const questionData = {
      question: '步調偏好？',
      options: [
        { id: '1', label: '☕ 悠閒慢活' },
        { id: '2', label: '🏃 緊湊充實' },
      ],
    }

    const runtime = {
      toolCallId: 'test-call-id',
    } as any

    const [content, artifact] = await askQuestion(questionData, runtime)
    const parsed = JSON.parse(content)

    expect(parsed.answered).toBe(true)
    expect(parsed.question).toBe('步調偏好？')
    expect(parsed.summary).toBe('☕ 悠閒慢活')
    expect(artifact.questionResult.question).toBe('步調偏好？')
    expect(artifact.questionResult.answer).toBe('☕ 悠閒慢活')
  })

  it('exposes tool name correctly', () => {
    expect(askClarifyingQuestionTool.name).toBe(ASK_CLARIFYING_QUESTION_TOOL_NAME)
  })
})
