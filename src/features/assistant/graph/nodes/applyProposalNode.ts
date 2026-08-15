import { ToolMessage, AIMessage } from '@langchain/core/messages'
import type {
  AssistantProgressPhase,
  AssistantProposal,
  AssistantProposalPersistence,
} from '../../types'
import type { AssistantGraphNodeState } from '../graphState'

type ApplyProposalNodeOptions = {
  proposals: AssistantProposalPersistence
  emitProgress?: (threadId: string, phase: AssistantProgressPhase) => void
}

export function createApplyProposalNode(options: ApplyProposalNodeOptions) {
  return async (state: AssistantGraphNodeState) => {
    const request = state.request
    const proposal = state.pendingProposal
    const decision = state.userDecision

    if (!proposal) return { userDecision: null }

    const lastAiMessage = state.modelMessages.findLast((m) => AIMessage.isInstance(m)) as AIMessage | undefined
    const toolCallId = lastAiMessage?.tool_calls?.[0]?.id || 'assistant-proposal-tool-call'
    const title = proposal.title || '提案'
    const approved = Boolean(decision?.approved)
    const updatedProposal: AssistantProposal = {
      ...proposal,
      status: approved ? 'approved' : 'rejected',
    }

    if (approved) {
      if (request?.threadId) options.emitProgress?.(request.threadId, 'applying_proposal')
      await options.proposals.applyPending?.(updatedProposal)
    } else {
      await options.proposals.rejectPending?.(updatedProposal)
    }

    const feedback = decision?.feedback ? ` 原因：${decision.feedback}` : ''
    const message = approved
      ? `使用者已確認並成功套用「${title}」。`
      : `使用者決定不套用「${title}」。${feedback}`

    const toolMessage = new ToolMessage({
      tool_call_id: toolCallId,
      content: JSON.stringify({
        success: approved,
        message,
      }),
    })

    return {
      pendingProposal: null,
      userDecision: null,
      modelMessages: [...state.modelMessages, toolMessage],
    }
  }
}
