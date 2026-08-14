import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import type { AssistantModelResult } from '../../types'
import { assistantOperationsSchema } from '../../api/assistantSchemas'
import { parseAssistantOperations } from '../../api/assistantOperations'

export const PROPOSAL_TOOL_NAME = 'propose_itinerary_edit'

const nonEmptyTextSchema = z.string().trim().min(1)

export const proposalToolArgumentsSchema = z.object({
  reply: nonEmptyTextSchema.describe('對使用者的自然語言回覆說明'),
  title: nonEmptyTextSchema.optional().describe('提案標題'),
  explanation: z.string().trim().optional().describe('提案變更重點說明'),
  operations: assistantOperationsSchema.describe('行程具體變更操作清單'),
})

/**
 * LangChain standard structured tool for itinerary edit proposals
 */
export const proposeItineraryEditTool = tool(
  async (input): Promise<AssistantModelResult> => ({
    reply: input.reply,
    proposal: {
      title: input.title || '行程修改提案',
      explanation: input.explanation || input.reply,
      operations: parseAssistantOperations(input.operations),
    },
  }),
  {
    name: PROPOSAL_TOOL_NAME,
    description: '當本次語意與近期對話表示使用者要執行、接受或調整行程景點時呼叫此工具，提出一組可套用的行程操作。產生的修改會呈現給使用者確認後套用。',
    schema: proposalToolArgumentsSchema,
  },
)
