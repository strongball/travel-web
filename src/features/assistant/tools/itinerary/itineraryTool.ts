import { Command } from '@langchain/langgraph/web'
import { tool } from '@langchain/core/tools'
import type {
  AssistantMessage,
  AssistantTurnRequest,
  ItineraryChangeProposal,
} from '../../types'
import {
  normalizeAssistantOperations,
  validateAssistantOperations,
} from '../../api/assistantOperations'
import { itineraryToolInputSchema } from './itineraryToolSchema'

export const PROPOSAL_TOOL_NAME = 'propose_itinerary_edit'

/**
 * LangChain standard structured tool for itinerary edit proposals
 */
export const proposeItineraryEditTool = tool(
  async (input, config) => {
    const request = (config.configurable?.request ?? (config as any)?.state?.request) as AssistantTurnRequest | undefined
    const savePending = config.configurable?.savePending as ((proposal: ItineraryChangeProposal) => Promise<void>) | undefined

    const operations = normalizeAssistantOperations(input.operations)
    if (request?.itinerary) {
      validateAssistantOperations(request.itinerary, operations)
    }

    const proposal: ItineraryChangeProposal = {
      id: crypto.randomUUID(),
      threadId: request?.threadId ?? '',
      turnId: request?.turnId ?? '',
      itineraryId: request?.itinerary?.id ?? '',
      title: input.title || '行程修改提案',
      explanation: input.explanation || input.reply || '',
      expectedDayRevisions: request?.dayRevisions ?? {},
      operations,
      status: 'pending',
      createdAt: new Date().toISOString(),
    }

    if (savePending) {
      await savePending(proposal)
    }

    const assistantMessage: AssistantMessage = {
      id: crypto.randomUUID(),
      turnId: request?.turnId ?? '',
      role: 'assistant',
      content: input.explanation || input.reply || '我已為您準備好修改提案，請確認是否套用：',
      createdAt: new Date().toISOString(),
      proposal,
    }

    return new Command({
      update: {
        pendingProposal: proposal,
        assistantMessage,
      },
    })
  },
  {
    name: PROPOSAL_TOOL_NAME,
    description: '當本次語意與近期對話表示使用者要執行、接受或調整行程景點時呼叫此工具，提出一組可套用的行程操作。產生的修改會呈現給使用者確認後套用。',
    schema: itineraryToolInputSchema,
  },
)
