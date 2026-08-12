import type { TripDay } from '../../types/database'
import type {
  AssistantMessage,
  ItineraryChangeProposal,
} from '../../features/assistant/types'
import { ASSISTANT_GRAPH_VERSION } from '../../features/assistant/types'
import { supabase } from '../supabase'

export type AssistantThread = {
  id: string
  itineraryId: string
  ownerId: string
  title: string
  summary: string
  graphVersion: number
  latestCheckpointId: string | null
  createdAt: string
  updatedAt: string
}

export type StoredAssistantProposal = ItineraryChangeProposal & {
  beforeDays: TripDay[]
  afterDays: TripDay[]
}

type Row = Record<string, unknown>
const text = (value: unknown) => typeof value === 'string' ? value : ''

const mapThread = (row: Row): AssistantThread => ({
  id: text(row.id),
  itineraryId: text(row.itinerary_id),
  ownerId: text(row.owner_id),
  title: text(row.title),
  summary: text(row.summary),
  graphVersion: Number(row.graph_version ?? 1),
  latestCheckpointId: typeof row.latest_checkpoint_id === 'string' ? row.latest_checkpoint_id : null,
  createdAt: text(row.created_at),
  updatedAt: text(row.updated_at),
})

export async function listAssistantThreads(itineraryId: string) {
  const { data, error } = await supabase.from('assistant_threads').select('*')
    .eq('itinerary_id', itineraryId).order('updated_at', { ascending: false })
  if (error) throw error
  return (data as Row[]).map(mapThread)
}

export async function createAssistantThread(itineraryId: string, ownerId: string) {
  const { data, error } = await supabase.from('assistant_threads').insert({
    itinerary_id: itineraryId,
    owner_id: ownerId,
    title: '新對話',
    graph_version: ASSISTANT_GRAPH_VERSION,
  }).select('*').single()
  if (error) throw error
  return mapThread(data as Row)
}

export async function renameAssistantThread(id: string, title: string) {
  const { error } = await supabase.from('assistant_threads').update({ title: title.trim() }).eq('id', id)
  if (error) throw error
}

export async function updateAssistantThreadSummary(id: string, summary: string) {
  const { error } = await supabase.from('assistant_threads').update({ summary }).eq('id', id)
  if (error) throw error
}

export async function deleteAssistantThread(id: string) {
  const { error } = await supabase.from('assistant_threads').delete().eq('id', id)
  if (error) throw error
}

export async function listAssistantMessages(threadId: string): Promise<AssistantMessage[]> {
  const { data, error } = await supabase.from('assistant_messages').select('*')
    .eq('thread_id', threadId).order('created_at', { ascending: true })
  if (error) throw error
  return (data as Row[]).map((row) => ({
    id: text(row.id),
    turnId: text(row.turn_id),
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: text(row.content),
    createdAt: text(row.created_at),
  }))
}

export async function saveAssistantMessage(threadId: string, message: AssistantMessage) {
  const { error } = await supabase.from('assistant_messages').upsert({
    id: message.id,
    thread_id: threadId,
    turn_id: message.turnId,
    role: message.role,
    content: message.content,
    created_at: message.createdAt,
  }, { onConflict: 'thread_id,turn_id,role' })
  if (error) throw error
}

export async function saveAssistantProposal(
  proposal: ItineraryChangeProposal,
  beforeDays: TripDay[],
  afterDays: TripDay[],
) {
  const { error } = await supabase.from('assistant_proposals').upsert({
    id: proposal.id,
    thread_id: proposal.threadId,
    turn_id: proposal.turnId,
    itinerary_id: proposal.itineraryId,
    status: 'pending',
    before_snapshot: beforeDays,
    after_snapshot: afterDays,
    expected_revisions: proposal.expectedDayRevisions,
    change_summary: proposal.explanation || proposal.title,
  }, {
    onConflict: 'thread_id,turn_id',
    // A replay after confirmation must never turn an applied/rejected proposal
    // back into pending. The first canonical proposal wins for this turn.
    ignoreDuplicates: true,
  })
  if (error) throw error
}

export async function listAssistantProposals(threadId: string): Promise<StoredAssistantProposal[]> {
  const { data, error } = await supabase.from('assistant_proposals').select('*')
    .eq('thread_id', threadId).order('created_at', { ascending: true })
  if (error) throw error
  return (data as Row[]).map((row) => ({
    id: text(row.id),
    threadId: text(row.thread_id),
    turnId: text(row.turn_id),
    itineraryId: text(row.itinerary_id),
    title: '行程修改提案',
    explanation: text(row.change_summary),
    expectedDayRevisions: (row.expected_revisions ?? {}) as Record<string, number>,
    operations: [],
    status: text(row.status) as StoredAssistantProposal['status'],
    createdAt: text(row.created_at),
    beforeDays: (row.before_snapshot ?? []) as TripDay[],
    afterDays: (row.after_snapshot ?? []) as TripDay[],
  }))
}

export async function applyStoredAssistantProposal(id: string, approved: boolean) {
  const { data, error } = await supabase.rpc('apply_assistant_proposal', {
    p_proposal_id: id,
    p_approved: approved,
  })
  if (error) throw error
  const status = (data as { status?: string } | null)?.status
  if (status !== 'applied' && status !== 'expired' && status !== 'rejected') {
    throw new Error('無法確認行程提案狀態')
  }
  return status
}
