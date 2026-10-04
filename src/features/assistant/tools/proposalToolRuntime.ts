import type { BaseMessage } from '@langchain/core/messages'
import type { ToolRuntime } from '@langchain/core/tools'
import type {
  AssistantProgressListener,
  AssistantProposalStatus,
  AssistantProposalExecution,
  AssistantUserDecision,
  AssistantTurnRequest,
  AssistantProposal,
} from '../types'
import { interrupt } from '@langchain/langgraph/web'
import { proposalModelContext } from '../utils/modelMessages'

type AssistantToolState = {
  request?: AssistantTurnRequest | null
  modelMessages?: BaseMessage[]
}

type ProposalRuntimeConfig = {
  request?: AssistantTurnRequest | null
  applyProposal?: AssistantProposalExecution['apply']
  onProgress?: AssistantProgressListener
}

export type AssistantProposalToolRuntime = ToolRuntime<AssistantToolState>

export function proposalIdForRequest(request: AssistantTurnRequest | undefined) {
  const turnId = request?.turnId?.trim()
  if (!turnId) throw new Error('Proposal tool requires a turn id')
  return turnId
}

export function proposalRuntimeContext(runtime: AssistantProposalToolRuntime) {
  const configured = (runtime.configurable ?? {}) as ProposalRuntimeConfig
  const request = configured.request || runtime.state?.request || undefined
  return {
    request,
    applyProposal: configured.applyProposal,
    onProgress: configured.onProgress,
  }
}

export function asProposalReviewInterrupt(
  proposal: AssistantProposal,
  runtime: AssistantProposalToolRuntime,
) {
  return {
    kind: 'proposal' as const,
    type: 'proposal_review' as const,
    toolCallId: runtime.toolCallId,
    turnId: runtime.state?.request?.turnId ?? proposal.turnId,
    proposal,
  }
}

export async function reviewProposal(
  proposal: AssistantProposal,
  runtime: AssistantProposalToolRuntime,
) {
  const decision = interrupt<ReturnType<typeof asProposalReviewInterrupt>, AssistantUserDecision>(
    asProposalReviewInterrupt(proposal, runtime),
  )

  let status: AssistantProposalStatus
  if (decision.approved) {
    const { applyProposal, onProgress } = proposalRuntimeContext(runtime)
    onProgress?.('applying_proposal', `正在套用「${proposal.title}」…`)
    if (!applyProposal) throw new Error('Proposal execution is unavailable')
    status = await applyProposal({ ...proposal, status: 'approved' }) ?? 'applied'
  } else {
    status = 'rejected'
  }

  const completedProposal = { ...proposal, status }

  return [
    JSON.stringify({
      success: status === 'applied',
      status,
      proposalId: proposal.id,
      message: decision.approved
        ? status === 'applied'
          ? `使用者已確認並成功套用「${proposal.title}」。`
          : `「${proposal.title}」無法套用，提案已${status === 'expired' ? '過期' : '保留目前狀態'}。`
        : `使用者決定不套用「${proposal.title}」。${decision.feedback ? ` 原因：${decision.feedback}` : ''}`,
      feedback: decision.feedback,
      rejectedProposal: !decision.approved ? proposalModelContext(completedProposal) : undefined,
      nextStep: !decision.approved
        ? decision.feedback?.trim()
          ? '依使用者 feedback 修改這份未套用的提案，保留未要求變更的安排，再單獨提出新提案供確認。若使用者表示停止或自行處理，尊重其決定。'
          : '這份提案未套用，對話仍可繼續。簡短詢問使用者想調整哪部分，不要原樣重提或宣告整個任務取消。'
        : undefined,
    }),
    { proposal: completedProposal },
  ] as const
}
