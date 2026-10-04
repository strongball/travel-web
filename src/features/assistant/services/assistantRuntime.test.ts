import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssistantProposal } from '../types'
import { createAssistantRuntime } from './assistantRuntime'

const mocks = vi.hoisted(() => ({ apply: vi.fn(), enrich: vi.fn(), graph: vi.fn() }))
vi.mock('../../../lib/repositories/assistantRepository', () => ({ applyAssistantOperations: mocks.apply }))
vi.mock('../../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../graph', () => ({ createAssistantGraph: mocks.graph }))
vi.mock('../tools', () => ({ enrichAppliedProposalPlaces: mocks.enrich }))

const proposal: AssistantProposal = {
  id: 'proposal', threadId: 'thread', turnId: 'turn', itineraryId: 'trip', title: '修改', explanation: '',
  status: 'approved', createdAt: '2026-10-04T00:00:00Z', expectedDayRevisions: {}, beforeDays: [],
  afterDays: [{ id: 'day', itineraryId: 'trip', date: '2026-10-04', startTime: null, revision: 1, attractions: [] }],
  proposedTodos: [], proposedCategories: [],
}
beforeEach(() => { vi.clearAllMocks(); mocks.apply.mockResolvedValue('applied'); mocks.enrich.mockResolvedValue({ failed: 0 }) })

describe('applied proposal follow-up failures', () => {
  it('still refreshes and retains the applied result when optional place enrichment fails', async () => {
    mocks.enrich.mockRejectedValueOnce(new Error('places offline'))
    const refresh = vi.fn()
    const notice = vi.fn()
    createAssistantRuntime(refresh, notice)
    const apply = mocks.graph.mock.calls[0][1].proposals.apply
    expect(await apply(proposal)).toBe('applied')
    expect(refresh).toHaveBeenCalledOnce()
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('已成功套用'))
  })
  it('retains the applied result when refreshing the workspace fails', async () => {
    const notice = vi.fn()
    createAssistantRuntime(vi.fn().mockRejectedValueOnce(new Error('refresh offline')), notice)
    expect(await mocks.graph.mock.calls[0][1].proposals.apply(proposal)).toBe('applied')
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('畫面更新失敗'))
  })
  it('still reports real persistence failures instead of claiming success', async () => {
    mocks.apply.mockRejectedValueOnce(new Error('write failed'))
    const refresh = vi.fn()
    createAssistantRuntime(refresh, vi.fn())
    await expect(mocks.graph.mock.calls[0][1].proposals.apply(proposal)).rejects.toThrow('write failed')
    expect(refresh).not.toHaveBeenCalled()
    expect(mocks.enrich).not.toHaveBeenCalled()
  })
})
