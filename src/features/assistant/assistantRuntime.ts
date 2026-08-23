import { applyAssistantOperations } from '../../lib/repositories/assistantRepository'
import { SupabaseAssistantCheckpointer } from '../../lib/assistantCheckpointer'
import { supabase } from '../../lib/supabase'
import { createAssistantGraph } from './graph'
import { enrichAppliedProposalPlaces } from './tools'
import type { AssistantProposal } from './types'

export const createAssistantRuntime = (
  refreshWorkspace: () => void | Promise<void>,
  onNotice: (message: string) => void,
) => {
  const checkpointer = new SupabaseAssistantCheckpointer(supabase)
  const runner = createAssistantGraph(checkpointer, {
    proposals: {
      apply: async (proposal: AssistantProposal) => {
        const status = await applyAssistantOperations(proposal.threadId, proposal)
        if (status === 'applied') {
          if (proposal.afterDays.length > 0) {
            const enrichment = await enrichAppliedProposalPlaces(proposal)
            if (enrichment.failed > 0) {
              onNotice(`行程已套用；${enrichment.failed} 個景點暫時無法取得 Google 地點資料，可稍後手動補上。`)
            }
          }
          await refreshWorkspace()
        }
        return status
      },
    },
  })
  return { checkpointer, runner }
}

export type AssistantConversationRuntime = ReturnType<typeof createAssistantRuntime> & {
  updateSummary: (threadId: string, summary: string) => Promise<void>
  onNotice: (message: string) => void
}
