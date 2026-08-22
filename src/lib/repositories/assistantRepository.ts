import type {
  AssistantCodeExecution,
  AssistantGroundingMetadata,
  AssistantMessage,
  AssistantProposal,
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

export type StoredAssistantProposal = AssistantProposal

type Row = Record<string, unknown>
const text = (value: unknown) => typeof value === 'string' ? value : ''

const mapThread = (row: Row): AssistantThread => ({
  id: text(row.id),
  itineraryId: text(row.itinerary_id),
  ownerId: text(row.owner_id),
  title: text(row.title),
  summary: text(row.summary),
  graphVersion: typeof row.graph_version === 'number' ? row.graph_version : ASSISTANT_GRAPH_VERSION,
  latestCheckpointId: typeof row.latest_checkpoint_id === 'string' ? row.latest_checkpoint_id : null,
  createdAt: text(row.created_at),
  updatedAt: text(row.updated_at),
})

export async function listAssistantThreads(itineraryId: string): Promise<AssistantThread[]> {
  const { data, error } = await supabase.from('assistant_threads').select('*')
    .eq('itinerary_id', itineraryId).order('updated_at', { ascending: false })
  if (error) throw error
  return (data as Row[]).map(mapThread)
}

export async function createAssistantThread(itineraryId: string, ownerId: string): Promise<AssistantThread> {
  const { data, error } = await supabase.from('assistant_threads').insert({
    itinerary_id: itineraryId,
    owner_id: ownerId,
    title: '新對話',
    graph_version: ASSISTANT_GRAPH_VERSION,
  }).select('*').single()
  if (error) throw error
  return mapThread(data as Row)
}

export async function getAssistantThread(id: string): Promise<AssistantThread | null> {
  const { data, error } = await supabase.from('assistant_threads').select('*')
    .eq('id', id).maybeSingle()
  if (error) throw error
  return data ? mapThread(data as Row) : null
}

export async function saveAssistantThread(thread: {
  id: string
  itineraryId: string
  ownerId: string
  title: string
  summary: string
  latestCheckpointId?: string | null
}) {
  const { error } = await supabase.from('assistant_threads').upsert({
    id: thread.id,
    itinerary_id: thread.itineraryId,
    owner_id: thread.ownerId,
    title: thread.title,
    summary: thread.summary,
    graph_version: ASSISTANT_GRAPH_VERSION,
    latest_checkpoint_id: thread.latestCheckpointId ?? null,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
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
  return (data as Row[]).map((row) => {
    const metadata = row.metadata && typeof row.metadata === 'object'
      ? row.metadata as Record<string, unknown>
      : {}
    return {
      id: text(row.id),
      turnId: text(row.turn_id),
      role: row.role === 'assistant' ? 'assistant' : 'user',
      content: text(row.content),
      createdAt: text(row.created_at),
      proposal: metadata.proposal as AssistantProposal | undefined,
      grounding: metadata.grounding as AssistantGroundingMetadata | undefined,
      codeExecutions: metadata.codeExecutions as AssistantCodeExecution[] | undefined,
    }
  })
}

export async function saveAssistantMessage(threadId: string, message: AssistantMessage) {
  const metadata: Record<string, unknown> = {}
  if (message.proposal) metadata.proposal = message.proposal
  if (message.grounding) metadata.grounding = message.grounding
  if (message.codeExecutions) metadata.codeExecutions = message.codeExecutions

  const { error } = await supabase.from('assistant_messages').upsert({
    id: message.id,
    thread_id: threadId,
    turn_id: message.turnId,
    role: message.role,
    content: message.content,
    metadata,
    created_at: message.createdAt,
  }, { onConflict: 'thread_id,turn_id,role' })
  if (error) throw error
}

export async function applyAssistantOperations(
  threadId: string,
  proposal: AssistantProposal,
) {
  const { data, error } = await supabase.rpc('apply_assistant_operations', {
    p_thread_id: threadId,
    p_turn_id: proposal.turnId,
    p_itinerary_id: proposal.itineraryId,
    p_expected_revisions: proposal.expectedDayRevisions,
    p_after_snapshot: proposal.afterDays,
    p_proposed_todos: proposal.proposedTodos,
    p_proposed_categories: proposal.proposedCategories,
  })
  if (error) throw error
  const status = (data as { status?: string } | null)?.status
  if (status !== 'applied' && status !== 'expired') {
    throw new Error('無法確認行程操作狀態')
  }
  return status
}
