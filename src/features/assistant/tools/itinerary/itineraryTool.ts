import { tool } from '@langchain/core/tools'
import type { AssistantModelResult, AssistantOperation } from '../../types'
import { itineraryToolInputSchema } from './itineraryToolSchema'

export const PROPOSAL_TOOL_NAME = 'propose_itinerary_edit'

/**
 * LangChain standard structured tool for itinerary edit proposals
 */
export const proposeItineraryEditTool = tool(
  async (input): Promise<AssistantModelResult> => {
    return {
      reply: input.reply,
      proposal: {
        title: input.title || '行程修改提案',
        explanation: input.explanation || input.reply,
        operations: input.operations as unknown as AssistantOperation[],
      },
    }
  },
  {
    name: PROPOSAL_TOOL_NAME,
    description: '當本次語意與近期對話表示使用者要執行、接受或調整行程景點時呼叫此工具，提出一組可套用的行程操作。產生的修改會呈現給使用者確認後套用。',
    schema: itineraryToolInputSchema,
  },
)
