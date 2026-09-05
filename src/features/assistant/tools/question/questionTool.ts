import { tool, type ToolRuntime } from '@langchain/core/tools'
import { interrupt } from '@langchain/langgraph/web'
import type {
  AssistantQuestionData,
  AssistantQuestionDecision,
  AssistantQuestionInterrupt,
  AssistantTurnRequest,
} from '../../types'
import { askClarifyingQuestionSchema } from './questionToolSchema'

export const ASK_CLARIFYING_QUESTION_TOOL_NAME = 'ask_clarifying_question'

type QuestionToolState = {
  request?: AssistantTurnRequest | null
}

export type AssistantQuestionToolRuntime = ToolRuntime<QuestionToolState>

export async function askQuestion(
  questionData: AssistantQuestionData,
  runtime: AssistantQuestionToolRuntime,
) {
  const answer = interrupt<AssistantQuestionInterrupt, AssistantQuestionDecision>({
    kind: 'question',
    type: 'clarifying_question',
    toolCallId: runtime.toolCallId ?? 'question-interrupt',
    turnId: runtime.state?.request?.turnId,
    questionData,
  })

  const selectedList = answer.selectedOptions ?? []
  const customAnswer = answer.customAnswer?.trim() ?? ''
  const answerSummary =
    answer.answer ||
    customAnswer ||
    (selectedList.length > 0 ? selectedList.join('、') : '未選擇')

  return [
    JSON.stringify({
      answered: true,
      question: questionData.question,
      selectedOptions: selectedList,
      customAnswer: customAnswer || null,
      summary: answerSummary,
      message: `使用者已回覆：「${answerSummary}」。請根據使用者的具體偏好繼續後續規劃與回覆。`,
    }),
    {
      questionResult: {
        question: questionData.question,
        answer: answerSummary,
        options: questionData.options,
      },
    },
  ] as const
}

export const askClarifyingQuestionTool = tool(
  async (input, runtime: AssistantQuestionToolRuntime) => {
    const questionData: AssistantQuestionData = {
      question: input.question,
      options: input.options.map((opt) => ({
        id: opt.id,
        label: opt.label,
        description: opt.description ?? undefined,
      })),
      multiple: input.multiple ?? false,
      allowCustomInput: input.allowCustomInput ?? true,
    }

    return askQuestion(questionData, runtime)
  },
  {
    name: ASK_CLARIFYING_QUESTION_TOOL_NAME,
    responseFormat: 'content_and_artifact',
    description:
      '當使用者的旅遊需求不夠具體、有多種規劃方向（例如：旅行步調、預算等級、餐飲偏好、或二選一抉擇）時，呼叫此工具向使用者提出選擇題或確認問題。呼叫此工具會暫停模型生成，等待使用者點選選項膠囊或回答後再繼續。',
    schema: askClarifyingQuestionSchema,
  },
)
