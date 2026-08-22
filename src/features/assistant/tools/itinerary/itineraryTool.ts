import { tool } from '@langchain/core/tools'
import type { AssistantProposal } from '../../types'
import {
  parseAssistantOperations,
  validateAssistantOperations,
} from '../../api/assistantOperations'
import { itineraryToolInputSchema } from './itineraryToolSchema'
import { applyItineraryOperations, changedDays } from './itineraryOperations'
import {
  proposalIdForRequest,
  proposalRuntimeContext,
  reviewProposal,
  type AssistantProposalToolRuntime,
} from '../proposalToolRuntime'

export const PROPOSAL_TOOL_NAME = 'propose_itinerary_edit'

/**
 * LangChain standard structured tool for itinerary edit proposals
 */
export const proposeItineraryEditTool = tool(
  async (input, runtime: AssistantProposalToolRuntime) => {
    const { request } = proposalRuntimeContext(runtime)
    const proposalId = proposalIdForRequest(request)

    const operations = parseAssistantOperations(input.operations)
    if (request?.itinerary) {
      validateAssistantOperations(request.itinerary, operations)
    }

    const allBeforeDays = request?.itinerary.days ?? []
    const afterDays = request?.itinerary
      ? changedDays(allBeforeDays, applyItineraryOperations(request.itinerary, operations))
      : []
    const affectedDayIds = new Set(afterDays.map((day) => day.id))

    const proposal: AssistantProposal = {
      id: proposalId,
      threadId: request?.threadId ?? '',
      turnId: request?.turnId ?? '',
      itineraryId: request?.itinerary?.id ?? '',
      title: input.title || '行程修改提案',
      explanation: input.explanation || input.reply || '',
      expectedDayRevisions: Object.fromEntries(afterDays.map((day) => [
        day.id,
        request?.dayRevisions[day.id] ?? day.revision,
      ])),
      beforeDays: allBeforeDays.filter((day) => affectedDayIds.has(day.id)),
      afterDays,
      proposedTodos: [],
      proposedCategories: [],
      status: 'pending',
      createdAt: new Date().toISOString(),
    }

    return reviewProposal(proposal, runtime)
  },
  {
    name: PROPOSAL_TOOL_NAME,
    responseFormat: 'content_and_artifact',
    description: '當本次語意與近期對話表示使用者要執行、接受或調整行程景點時呼叫此工具，提出一組可套用的行程操作。產生的修改會呈現給使用者確認後套用。',
    schema: itineraryToolInputSchema,
  },
)
