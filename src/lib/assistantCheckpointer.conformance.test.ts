import type { SupabaseClient } from '@supabase/supabase-js'
import { validate } from '@langchain/langgraph-checkpoint-validation'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest'
import { SupabaseAssistantCheckpointer } from './assistantCheckpointer'

Object.assign(globalThis, {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
})

type Row = Record<string, unknown>
type QueryResult = { data: Row[] | Row | null; error: Error | null }
type Filter = { column: string; operation: 'eq' | 'lt'; value: unknown }
type Ordering = { column: string; ascending: boolean }

const primaryKey = (table: string, row: Row) => {
  if (table === 'assistant_graph_checkpoints') {
    return `${row.thread_id}|${row.checkpoint_ns}|${row.checkpoint_id}`
  }
  return `${row.thread_id}|${row.checkpoint_ns}|${row.checkpoint_id}|${row.task_id}|${row.idx}`
}

class FakeQuery implements PromiseLike<QueryResult> {
  private readonly database: FakeSupabase
  private readonly table: string
  private readonly filters: Filter[] = []
  private readonly orderings: Ordering[] = []
  private maximumRows: number | null = null
  private mode: 'select' | 'delete' = 'select'

  constructor(
    database: FakeSupabase,
    table: string,
  ) {
    this.database = database
    this.table = table
  }

  select(_columns = '*') {
    return this
  }

  delete() {
    this.mode = 'delete'
    return this
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, operation: 'eq', value })
    return this
  }

  lt(column: string, value: unknown) {
    this.filters.push({ column, operation: 'lt', value })
    return this
  }

  order(column: string, options: { ascending: boolean }) {
    this.orderings.push({ column, ascending: options.ascending })
    return this
  }

  limit(value: number) {
    this.maximumRows = value
    return this
  }

  async maybeSingle(): Promise<QueryResult> {
    const result = await this.execute()
    const rows = Array.isArray(result.data) ? result.data : []
    return { data: rows[0] ?? null, error: result.error }
  }

  async upsert(value: Row | Row[], _options: { onConflict: string }): Promise<QueryResult> {
    const rows = Array.isArray(value) ? value : [value]
    const tableRows = this.database.rows(this.table)
    for (const row of rows) tableRows.set(primaryKey(this.table, row), structuredClone(row))
    return { data: null, error: null }
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private matches(row: Row) {
    return this.filters.every(({ column, operation, value }) => operation === 'eq'
      ? row[column] === value
      : String(row[column]) < String(value))
  }

  private async execute(): Promise<QueryResult> {
    const tableRows = this.database.rows(this.table)
    let rows = [...tableRows.values()].filter((row) => this.matches(row))
    if (this.mode === 'delete') {
      for (const [key, row] of tableRows) {
        if (this.matches(row)) tableRows.delete(key)
      }
      return { data: null, error: null }
    }
    rows.sort((first, second) => {
      for (const ordering of this.orderings) {
        const comparison = String(first[ordering.column]).localeCompare(String(second[ordering.column]))
        if (comparison !== 0) return ordering.ascending ? comparison : -comparison
      }
      return 0
    })
    if (this.maximumRows !== null) rows = rows.slice(0, this.maximumRows)
    return { data: structuredClone(rows), error: null }
  }
}

class FakeSupabase {
  private readonly tables = new Map<string, Map<string, Row>>()
  private readonly latestCheckpointByThread = new Map<string, string | null>()

  rows(table: string) {
    let rows = this.tables.get(table)
    if (!rows) {
      rows = new Map()
      this.tables.set(table, rows)
    }
    return rows
  }

  from(table: string) {
    return new FakeQuery(this, table)
  }

  async rpc(name: string, parameters: Row): Promise<QueryResult> {
    if (name !== 'assistant_put_checkpoint') {
      return { data: null, error: new Error(`Unknown RPC: ${name}`) }
    }
    const threadId = String(parameters.p_thread_id)
    const namespace = String(parameters.p_checkpoint_ns ?? '')
    const latestKey = `${threadId}|${namespace}`
    const expected = parameters.p_expected_latest_checkpoint_id === null
      ? null
      : String(parameters.p_expected_latest_checkpoint_id)
    const current = this.latestCheckpointByThread.get(latestKey) ?? null
    if (current !== expected) {
      return { data: null, error: new Error('Assistant thread changed on another device') }
    }
    const row: Row = {
      thread_id: threadId,
      checkpoint_ns: parameters.p_checkpoint_ns,
      checkpoint_id: parameters.p_checkpoint_id,
      parent_checkpoint_id: parameters.p_parent_checkpoint_id,
      checkpoint_type: parameters.p_checkpoint_type,
      checkpoint_payload: parameters.p_checkpoint_payload,
      metadata_type: parameters.p_metadata_type,
      metadata_payload: parameters.p_metadata_payload,
      turn_id: parameters.p_turn_id,
    }
    this.rows('assistant_graph_checkpoints').set(primaryKey('assistant_graph_checkpoints', row), row)
    this.latestCheckpointByThread.set(latestKey, String(parameters.p_checkpoint_id))
    return { data: { checkpoint_id: parameters.p_checkpoint_id }, error: null }
  }
}

validate({
  checkpointerName: 'SupabaseAssistantCheckpointer',
  createCheckpointer() {
    const client = new FakeSupabase() as unknown as SupabaseClient
    return new SupabaseAssistantCheckpointer(client)
  },
})
