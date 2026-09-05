import type { ToolRuntime } from '@langchain/core/tools'
import type {
  AssistantProposalStatus,
  AssistantProposalExecution,
  AssistantUserDecision,
  AssistantTurnRequest,
  AssistantProposal,
} from '../types'
import { interrupt } from '@langchain/langgraph/web'

type AssistantToolState = {
  request?: AssistantTurnRequest | null
}

type ProposalRuntimeConfig = {
  request?: AssistantTurnRequest | null
  applyProposal?: AssistantProposalExecution['apply']
}

export type AssistantProposalToolRuntime = ToolRuntime<AssistantToolState>

export function proposalIdForRequest(request: AssistantTurnRequest | undefined) {
  const turnId = request?.turnId?.trim()
  if (!turnId) throw new Error('Proposal tool requires a turn id')
  return turnId
}

export function proposalRuntimeContext(runtime: AssistantProposalToolRuntime) {
  const configured = (runtime.configurable ?? {}) as ProposalRuntimeConfig
  const request = runtime.state?.request ?? configured.request ?? undefined
  return {
    request,
    applyProposal: configured.applyProposal,
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
    const { applyProposal } = proposalRuntimeContext(runtime)
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
    }),
    { proposal: completedProposal },
  ] as const
}
