import { applyAssistantOperations } from '../../../lib/repositories/assistantRepository'
import { SupabaseAssistantCheckpointer } from '../../../lib/assistantCheckpointer'
import { supabase } from '../../../lib/supabase'
import { createAssistantGraph } from '../graph'
import { enrichAppliedProposalPlaces } from '../tools'
import type { AssistantProposal } from '../types'

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
            try {
              const enrichment = await enrichAppliedProposalPlaces(proposal)
              if (enrichment.failed > 0) onNotice(`行程已套用；${enrichment.failed} 個景點暫時無法取得 Google 地點資料，可稍後手動補上。`)
            } catch {
              onNotice('提案已成功套用，但地點資料補充失敗，可稍後手動補上。')
            }
          }
          try {
            await refreshWorkspace()
          } catch {
            onNotice('提案已成功套用，但畫面更新失敗，請重新整理行程查看。')
          }
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
