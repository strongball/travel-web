import type { RunnableConfig } from '@langchain/core/runnables'
import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointMetadata,
  type CheckpointTuple,
} from '@langchain/langgraph/web'
import {
  type ChannelVersions,
  type CheckpointListOptions,
  type CheckpointPendingWrite,
  type PendingWrite,
  TASKS,
  WRITES_IDX_MAP,
  maxChannelVersion,
} from '@langchain/langgraph-checkpoint'
import type { SupabaseClient } from '@supabase/supabase-js'

type SerializedValue = {
  type: string
  payload: string
}

type CheckpointRow = {
  thread_id: string
  checkpoint_ns: string
  checkpoint_id: string
  parent_checkpoint_id: string | null
  checkpoint_type: string
  checkpoint_payload: string
  metadata_type: string
  metadata_payload: string
  created_at?: string
}

type WriteRow = {
  thread_id: string
  checkpoint_ns: string
  checkpoint_id: string
  task_id: string
  idx: number
  channel: string
  value_type: string
  value_payload: string
}

export type SupabaseAssistantCheckpointerOptions = {
  checkpointTable?: string
  writesTable?: string
  requestTimeoutMs?: number
  compactHistory?: boolean
}

type AbortableRequest<T> = PromiseLike<T> & {
  abortSignal?: (signal: AbortSignal) => PromiseLike<T>
}

export class AssistantCheckpointTimeoutError extends Error {
  readonly timeoutMs: number

  constructor(timeoutMs: number) {
    super(`儲存對話進度逾時（${Math.ceil(timeoutMs / 1_000)} 秒），這個回合可以安全重試。`)
    this.name = 'AssistantCheckpointTimeoutError'
    this.timeoutMs = timeoutMs
  }
}

export async function withAssistantCheckpointTimeout<T>(
  request: AbortableRequest<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController()
  const activeRequest = typeof request.abortSignal === 'function'
    ? request.abortSignal(controller.signal)
    : request
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort()
      reject(new AssistantCheckpointTimeoutError(timeoutMs))
    }, timeoutMs)
  })
  try {
    return await Promise.race([Promise.resolve(activeRequest), timeout])
  } catch (error) {
    if (controller.signal.aborted && !(error instanceof AssistantCheckpointTimeoutError)) {
      throw new AssistantCheckpointTimeoutError(timeoutMs)
    }
    throw error
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId)
  }
}

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  const chunkSize = 32_768
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

const base64ToBytes = (value: string): Uint8Array => {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

const requiredConfigValue = (config: RunnableConfig, key: 'thread_id' | 'checkpoint_id') => {
  const value = config.configurable?.[key]
  if (typeof value !== 'string' || !value) {
    throw new Error(`Missing LangGraph ${key}`)
  }
  return value
}

const checkpointNamespace = (config: RunnableConfig) => {
  const value = config.configurable?.checkpoint_ns
  return typeof value === 'string' ? value : ''
}

const matchesMetadata = (
  metadata: CheckpointMetadata,
  filter: Record<string, unknown> | undefined,
) => !filter || Object.entries(filter).every(([key, value]) =>
  JSON.stringify((metadata as unknown as Record<string, unknown>)[key]) === JSON.stringify(value))

const missingReplaceCheckpointRpc = (error: unknown) => {
  if (!error || typeof error !== 'object') return false
  const record = error as { code?: unknown; message?: unknown }
  return record.code === 'PGRST202' ||
    (typeof record.message === 'string' && record.message.includes('assistant_replace_checkpoint'))
}

export class SupabaseAssistantCheckpointer extends BaseCheckpointSaver {
  private readonly client: SupabaseClient
  private readonly checkpointTable: string
  private readonly writesTable: string
  private readonly requestTimeoutMs: number
  private readonly compactHistory: boolean

  constructor(
    client: SupabaseClient,
    options: SupabaseAssistantCheckpointerOptions = {},
  ) {
    super()
    this.client = client
    this.checkpointTable = options.checkpointTable ?? 'assistant_graph_checkpoints'
    this.writesTable = options.writesTable ?? 'assistant_graph_writes'
    this.requestTimeoutMs = options.requestTimeoutMs ?? 12_000
    this.compactHistory = options.compactHistory ?? true
  }

  private async serialize(value: unknown): Promise<SerializedValue> {
    const [type, bytes] = await this.serde.dumpsTyped(value)
    return { type, payload: bytesToBase64(bytes) }
  }

  private deserialize<T>(type: string, payload: string): Promise<T> {
    return this.serde.loadsTyped(type, base64ToBytes(payload)) as Promise<T>
  }

  private async pendingWrites(row: CheckpointRow): Promise<CheckpointPendingWrite[]> {
    const { data, error } = await withAssistantCheckpointTimeout(this.client
      .from(this.writesTable)
      .select('task_id,idx,channel,value_type,value_payload')
      .eq('thread_id', row.thread_id)
      .eq('checkpoint_ns', row.checkpoint_ns)
      .eq('checkpoint_id', row.checkpoint_id)
      .order('task_id', { ascending: true })
      .order('idx', { ascending: true }), this.requestTimeoutMs)
    if (error) throw error
    return Promise.all(((data ?? []) as WriteRow[]).map(async (write) => [
      write.task_id,
      write.channel,
      await this.deserialize(write.value_type, write.value_payload),
    ]))
  }

  private async tuple(row: CheckpointRow): Promise<CheckpointTuple> {
    const [storedCheckpoint, metadata, pendingWrites] = await Promise.all([
      this.deserialize<Checkpoint>(row.checkpoint_type, row.checkpoint_payload),
      this.deserialize<CheckpointMetadata>(row.metadata_type, row.metadata_payload),
      this.pendingWrites(row),
    ])
    const config: RunnableConfig = {
      configurable: {
        thread_id: row.thread_id,
        checkpoint_ns: row.checkpoint_ns,
        checkpoint_id: row.checkpoint_id,
      },
    }
    let checkpoint = storedCheckpoint
    if (row.parent_checkpoint_id) {
      const parentTuple = await this.getTuple({
        configurable: {
          thread_id: row.thread_id,
          checkpoint_ns: row.checkpoint_ns,
          checkpoint_id: row.parent_checkpoint_id,
        },
      })
      if (parentTuple) {
        const inheritedValues = Object.fromEntries(
          Object.keys(checkpoint.channel_versions)
            .filter((channel) => !(channel in checkpoint.channel_values) &&
              channel in parentTuple.checkpoint.channel_values)
            .map((channel) => [channel, parentTuple.checkpoint.channel_values[channel]]),
        )
        checkpoint = {
          ...checkpoint,
          channel_values: { ...inheritedValues, ...checkpoint.channel_values },
        }
        if (checkpoint.v < 4) {
          const pendingSends = (parentTuple.pendingWrites ?? [])
            .filter(([, channel]) => channel === TASKS)
            .map(([, , value]) => value)
          if (pendingSends.length > 0) {
            const versions = Object.values(checkpoint.channel_versions)
            checkpoint = {
              ...checkpoint,
              channel_values: { ...checkpoint.channel_values, [TASKS]: pendingSends },
              channel_versions: {
                ...checkpoint.channel_versions,
                [TASKS]: this.getNextVersion(
                  versions.length > 0 ? maxChannelVersion(...versions) as number : undefined,
                ),
              },
            }
          }
        }
      }
    }
    return {
      config,
      checkpoint,
      metadata,
      parentConfig: row.parent_checkpoint_id
        ? {
            configurable: {
              thread_id: row.thread_id,
              checkpoint_ns: row.checkpoint_ns,
              checkpoint_id: row.parent_checkpoint_id,
            },
          }
        : undefined,
      pendingWrites,
    }
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const configuredThreadId = config.configurable?.thread_id
    if (typeof configuredThreadId !== 'string' || !configuredThreadId) return undefined
    const threadId = configuredThreadId
    const namespace = checkpointNamespace(config)
    let query = this.client
      .from(this.checkpointTable)
      .select('thread_id,checkpoint_ns,checkpoint_id,parent_checkpoint_id,checkpoint_type,checkpoint_payload,metadata_type,metadata_payload')
      .eq('thread_id', threadId)
      .eq('checkpoint_ns', namespace)
    const checkpointId = config.configurable?.checkpoint_id
    query = typeof checkpointId === 'string' && checkpointId
      ? query.eq('checkpoint_id', checkpointId)
      : query.order('checkpoint_id', { ascending: false }).limit(1)
    const { data, error } = await withAssistantCheckpointTimeout(
      query.maybeSingle(),
      this.requestTimeoutMs,
    )
    if (error) throw error
    return data ? this.tuple(data as CheckpointRow) : undefined
  }

  async *list(
    config: RunnableConfig,
    options: CheckpointListOptions = {},
  ): AsyncGenerator<CheckpointTuple> {
    const configuredThreadId = config.configurable?.thread_id
    let query = this.client
      .from(this.checkpointTable)
      .select('*')
      .order('checkpoint_id', { ascending: false })
    if (typeof configuredThreadId === 'string' && configuredThreadId) {
      query = query.eq('thread_id', configuredThreadId)
    }
    const namespace = config.configurable?.checkpoint_ns
    if (typeof namespace === 'string') query = query.eq('checkpoint_ns', namespace)
    const beforeId = options.before?.configurable?.checkpoint_id
    if (typeof beforeId === 'string' && beforeId) query = query.lt('checkpoint_id', beforeId)
    const { data, error } = await query
    if (error) throw error
    let emitted = 0
    for (const row of (data ?? []) as CheckpointRow[]) {
      const tuple = await this.tuple(row)
      if (!matchesMetadata(tuple.metadata ?? {} as CheckpointMetadata, options.filter)) continue
      yield tuple
      emitted += 1
      if (options.limit !== undefined && emitted >= options.limit) return
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    newVersions: ChannelVersions,
  ): Promise<RunnableConfig> {
    const threadId = requiredConfigValue(config, 'thread_id')
    const namespace = checkpointNamespace(config)
    // The product only needs the latest resumable state. Production stores a
    // complete snapshot so old parent checkpoints can be deleted atomically;
    // conformance mode can retain LangGraph's delta/history contract.
    const storedCheckpoint: Checkpoint = this.compactHistory
      ? checkpoint
      : {
          ...checkpoint,
          channel_values: Object.fromEntries(
            Object.entries(checkpoint.channel_values)
              .filter(([channel]) => Object.hasOwn(newVersions, channel)),
          ),
        }
    const [serializedCheckpoint, serializedMetadata] = await Promise.all([
      this.serialize(storedCheckpoint),
      this.serialize(metadata),
    ])
    const row: CheckpointRow = {
      thread_id: threadId,
      checkpoint_ns: namespace,
      checkpoint_id: checkpoint.id,
      parent_checkpoint_id: !this.compactHistory && typeof config.configurable?.checkpoint_id === 'string'
        ? config.configurable.checkpoint_id
        : null,
      checkpoint_type: serializedCheckpoint.type,
      checkpoint_payload: serializedCheckpoint.payload,
      metadata_type: serializedMetadata.type,
      metadata_payload: serializedMetadata.payload,
    }
    const metadataRecord = metadata as unknown as Record<string, unknown>
    const turnId = typeof metadataRecord.turn_id === 'string' ? metadataRecord.turn_id : null
    let expectedLatestCheckpointId = typeof config.configurable?.checkpoint_id === 'string'
      ? config.configurable.checkpoint_id
      : null
    if (expectedLatestCheckpointId === null) {
      const { data: latest, error: latestError } = await withAssistantCheckpointTimeout(this.client
        .from(this.checkpointTable)
        .select('checkpoint_id')
        .eq('thread_id', row.thread_id)
        .eq('checkpoint_ns', row.checkpoint_ns)
        .order('checkpoint_id', { ascending: false })
        .limit(1)
        .maybeSingle(), this.requestTimeoutMs)
      if (latestError) throw latestError
      expectedLatestCheckpointId = typeof latest?.checkpoint_id === 'string'
        ? latest.checkpoint_id
        : null
    }
    const rpcName = this.compactHistory
      ? 'assistant_replace_checkpoint'
      : 'assistant_put_checkpoint'
    const rpcParameters = {
      p_thread_id: row.thread_id,
      p_checkpoint_ns: row.checkpoint_ns,
      p_checkpoint_id: row.checkpoint_id,
      p_parent_checkpoint_id: row.parent_checkpoint_id,
      p_checkpoint_type: row.checkpoint_type,
      p_checkpoint_payload: row.checkpoint_payload,
      p_metadata_type: row.metadata_type,
      p_metadata_payload: row.metadata_payload,
      p_turn_id: turnId,
      p_expected_latest_checkpoint_id: expectedLatestCheckpointId,
    }
    let { error } = await withAssistantCheckpointTimeout(
      this.client.rpc(rpcName, rpcParameters),
      this.requestTimeoutMs,
    )
    if (this.compactHistory && missingReplaceCheckpointRpc(error)) {
      // Allows the new browser bundle to keep working while the migration is
      // rolling out. It still stores a full snapshot, but history is only
      // pruned after assistant_replace_checkpoint becomes available.
      const fallback = await withAssistantCheckpointTimeout(
        this.client.rpc('assistant_put_checkpoint', rpcParameters),
        this.requestTimeoutMs,
      )
      error = fallback.error
    }
    if (error) {
      // A response can be lost after the RPC commits. Treat an identical row
      // as an idempotent retry; a different/missing row remains a CAS failure.
      const { data: existing, error: readError } = await withAssistantCheckpointTimeout(this.client
        .from(this.checkpointTable)
        .select('checkpoint_type,checkpoint_payload,metadata_type,metadata_payload,parent_checkpoint_id')
        .eq('thread_id', row.thread_id)
        .eq('checkpoint_ns', row.checkpoint_ns)
        .eq('checkpoint_id', row.checkpoint_id)
        .maybeSingle(), this.requestTimeoutMs)
      if (readError || !existing ||
        existing.checkpoint_type !== row.checkpoint_type ||
        existing.checkpoint_payload !== row.checkpoint_payload ||
        existing.metadata_type !== row.metadata_type ||
        existing.metadata_payload !== row.metadata_payload ||
        existing.parent_checkpoint_id !== row.parent_checkpoint_id) {
        throw error
      }
    }
    return {
      configurable: {
        ...config.configurable,
        thread_id: threadId,
        checkpoint_ns: namespace,
        checkpoint_id: checkpoint.id,
      },
    }
  }

  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
  ): Promise<void> {
    if (writes.length === 0) return
    const threadId = requiredConfigValue(config, 'thread_id')
    const checkpointId = requiredConfigValue(config, 'checkpoint_id')
    const namespace = checkpointNamespace(config)
    const rows: WriteRow[] = await Promise.all(writes.map(async ([channel, value], index) => {
      const serialized = await this.serialize(value)
      return {
        thread_id: threadId,
        checkpoint_ns: namespace,
        checkpoint_id: checkpointId,
        task_id: taskId,
        idx: WRITES_IDX_MAP[channel] ?? index,
        channel,
        value_type: serialized.type,
        value_payload: serialized.payload,
      }
    }))
    const { error } = await withAssistantCheckpointTimeout(this.client
      .from(this.writesTable)
      .upsert(rows, { onConflict: 'thread_id,checkpoint_ns,checkpoint_id,task_id,idx' }), this.requestTimeoutMs)
    if (error) throw error
  }

  async deleteThread(threadId: string): Promise<void> {
    if (!threadId) throw new Error('Missing LangGraph thread_id')
    const writesResult = await withAssistantCheckpointTimeout(
      this.client.from(this.writesTable).delete().eq('thread_id', threadId),
      this.requestTimeoutMs,
    )
    if (writesResult.error) throw writesResult.error
    const checkpointResult = await withAssistantCheckpointTimeout(
      this.client.from(this.checkpointTable).delete().eq('thread_id', threadId),
      this.requestTimeoutMs,
    )
    if (checkpointResult.error) throw checkpointResult.error
  }

  /**
   * Old delta checkpoints require two Data API reads per ancestor. Discard a
   * legacy/multi-row runtime before a normal turn; canonical messages and the
   * thread summary are sufficient to rebuild it. Pending proposals never call
   * this path because the composer is locked until the decision is persisted.
   */
  async discardLegacyHistory(threadId: string): Promise<boolean> {
    if (!threadId) throw new Error('Missing LangGraph thread_id')
    const { data, error } = await withAssistantCheckpointTimeout(this.client
      .from(this.checkpointTable)
      .select('checkpoint_id,parent_checkpoint_id')
      .eq('thread_id', threadId)
      .eq('checkpoint_ns', '')
      .order('checkpoint_id', { ascending: false })
      .limit(2), this.requestTimeoutMs)
    if (error) throw error
    const rows = (data ?? []) as Pick<CheckpointRow, 'checkpoint_id' | 'parent_checkpoint_id'>[]
    if (rows.length <= 1 && !rows[0]?.parent_checkpoint_id) return false
    await this.deleteThread(threadId)
    return true
  }
}
