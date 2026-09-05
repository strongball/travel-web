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
import {
  SEARCH_WEB_TOOL_NAME,
  tavilySearchTool,
} from './search'
import {
  ASK_CLARIFYING_QUESTION_TOOL_NAME,
  askClarifyingQuestionTool,
  askQuestion,
  askClarifyingQuestionSchema,
  questionOptionSchema,
} from './question'

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
  SEARCH_WEB_TOOL_NAME,
  tavilySearchTool,
  ASK_CLARIFYING_QUESTION_TOOL_NAME,
  askClarifyingQuestionTool,
  askQuestion,
  askClarifyingQuestionSchema,
  questionOptionSchema,
}

/** 提案 / UI 互動中斷類工具：執行後中斷模型回合，交由前端 UI 確認或選擇 */
export const assistantProposalTools = [
  proposeItineraryEditTool,
  proposeTodoListTool,
  askClarifyingQuestionTool,
] as const

/** 一般查詢 / 背景類工具：執行後將結果回傳給模型繼續思考 */
export const assistantGeneralTools = [
  tavilySearchTool,
] as const

/** 前端/本地可執行的工具集合（供 LangGraph ToolNode 使用） */
export const assistantCallableTools = [
  ...assistantProposalTools,
  ...assistantGeneralTools,
]

/** Gemini 原生內建工具（由 Google 伺服器端直接執行，例如網頁解析、聯網搜尋與程式碼沙盒執行） */
export const assistantBuiltinTools = [
  { urlContext: {} },
  { codeExecution: {} },
  // { googleSearch: {} },
]

/** 供 ChatGoogleGenerativeAI.bindTools 使用的完整工具清單 */
export const langchainAssistantTools = [
  ...assistantCallableTools,
  ...assistantBuiltinTools,
]

const allCallableToolNames = new Set<string>(assistantCallableTools.map((tool) => tool.name))

/** 判斷是否為已註冊的本地助理工具名稱 */
export function isAssistantToolName(name: string) {
  return allCallableToolNames.has(name)
}

