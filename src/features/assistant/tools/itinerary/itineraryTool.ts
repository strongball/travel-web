import { tool } from '@langchain/core/tools'
import type { AssistantProposal } from '../../types'
import {
  normalizeOperationDayIds,
  parseAssistantOperations,
  validateAssistantOperations,
} from '../../services/assistantOperations'
import { itineraryTimeTargetsSchema, itineraryToolInputSchema } from './itineraryToolSchema'
import { applyItineraryOperations, changedDays } from './itineraryOperations'
import { validateRequiredItineraryTimeTargets } from './itineraryTimeRequirements'
import { validateItineraryTimeTargets } from './itineraryTimeTargets'
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
    const { request, onProgress } = proposalRuntimeContext(runtime)
    onProgress?.('validating_response', '正在檢查景點操作與連續排程時間…')
    const proposalId = proposalIdForRequest(request)

    let operations = parseAssistantOperations(input.operations)
    if (request?.itinerary?.days && request.itinerary.days.length > 0) {
      operations = normalizeOperationDayIds(operations, request.itinerary.days)
    }
    if (request?.itinerary) {
      validateAssistantOperations(request.itinerary, operations)
    }

    const timeTargets = validateRequiredItineraryTimeTargets({
      text: request?.text ?? '',
      modelMessages: runtime.state?.modelMessages ?? [],
      targets: itineraryTimeTargetsSchema.parse(input.timeTargets ?? []),
      operations,
    })
    const allBeforeDays = request?.itinerary.days ?? []
    const allAfterDays = request?.itinerary
      ? applyItineraryOperations(request.itinerary, operations)
      : []
    const timeChecks = validateItineraryTimeTargets({
      beforeDays: allBeforeDays,
      afterDays: allAfterDays,
      operations,
      timeTargets,
    })
    const afterDays = changedDays(allBeforeDays, allAfterDays)
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
      timeChecks,
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
    description: '當本次語意與近期對話表示使用者要執行、接受或調整行程景點時呼叫此工具，提出一組可套用的行程操作。產生的修改會呈現給使用者確認後套用。注意：一般點對點交通請直接填入景點的 transportMode 與 travelTime 欄位，切勿將一般交通移動建立為獨立景點，除非該交通本身為特殊觀光活動（如觀光列車、破冰船）。',
    schema: itineraryToolInputSchema,
  },
)
