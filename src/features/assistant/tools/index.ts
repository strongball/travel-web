import {
  PROPOSAL_TOOL_NAME,
  proposeItineraryEditTool,
  applyItineraryOperations,
  changedDays,
  enrichAppliedProposalPlaces,
  placeEnrichmentCandidates,
  ItineraryProposalView,
} from './itinerary'
import {
  TODO_PROPOSAL_TOOL_NAME,
  proposeTodoListTool,
  extractProposedTodos,
  extractProposedCategories,
  applyTodoProposal,
  TodoProposalView,
} from './todo'

export {
  PROPOSAL_TOOL_NAME,
  proposeItineraryEditTool,
  applyItineraryOperations,
  changedDays,
  enrichAppliedProposalPlaces,
  placeEnrichmentCandidates,
  ItineraryProposalView,
  TODO_PROPOSAL_TOOL_NAME,
  proposeTodoListTool,
  extractProposedTodos,
  extractProposedCategories,
  applyTodoProposal,
  TodoProposalView,
}

/** 提案 / UI 類工具：執行後中斷模型回合，交由前端 UI 確認 */
export const assistantProposalTools = [
  proposeItineraryEditTool,
  proposeTodoListTool,
] as const

/** 一般查詢 / 背景類工具：執行後將結果回傳給模型繼續思考 */
export const assistantGeneralTools = [
  // 供未來擴充：例如 lookupWeatherTool, searchPlacesTool 等
] as const

/** 供 ChatGoogleGenerativeAI.bindTools 使用的完整工具清單 */
export const langchainAssistantTools = [
  ...assistantProposalTools,
  ...assistantGeneralTools,
]

const allToolNames = new Set<string>(langchainAssistantTools.map((tool) => tool.name))

/** 判斷是否為已註冊的助理工具名稱 */
export function isAssistantToolName(name: string) {
  return allToolNames.has(name)
}
