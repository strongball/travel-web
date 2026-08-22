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
  title: string
  summary: string
  updatedAt: string
}

export type StoredAssistantProposal = AssistantProposal

type Row = Record<string, unknown>
const text = (value: unknown) => typeof value === 'string' ? value : ''
const threadFields = 'id,title,summary,updated_at'

const mapThread = (row: Row): AssistantThread => ({
  id: text(row.id),
  title: text(row.title),
  summary: text(row.summary),
  updatedAt: text(row.updated_at),
})

export async function listAssistantThreads(itineraryId: string): Promise<AssistantThread[]> {
  const { data, error } = await supabase.from('assistant_threads').select(threadFields)
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
  }).select(threadFields).single()
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
  const { data, error } = await supabase.from('assistant_messages')
    .select('id,turn_id,role,content,metadata,created_at')
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
      attachments: (metadata.attachments as AssistantMessage['attachments']) ?? null,
    }
  })
}

export async function saveAssistantMessage(threadId: string, message: AssistantMessage) {
  const metadata: Record<string, unknown> = {}
  if (message.proposal) metadata.proposal = message.proposal
  if (message.grounding) metadata.grounding = message.grounding
  if (message.codeExecutions) metadata.codeExecutions = message.codeExecutions
  if (message.attachments) metadata.attachments = message.attachments

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
