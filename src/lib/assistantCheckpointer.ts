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

export class SupabaseAssistantCheckpointer extends BaseCheckpointSaver {
  private readonly client: SupabaseClient
  private readonly checkpointTable: string
  private readonly writesTable: string

  constructor(
    client: SupabaseClient,
    options: SupabaseAssistantCheckpointerOptions = {},
  ) {
    super()
    this.client = client
    this.checkpointTable = options.checkpointTable ?? 'assistant_graph_checkpoints'
    this.writesTable = options.writesTable ?? 'assistant_graph_writes'
  }

  private async serialize(value: unknown): Promise<SerializedValue> {
    const [type, bytes] = await this.serde.dumpsTyped(value)
    return { type, payload: bytesToBase64(bytes) }
  }

  private deserialize<T>(type: string, payload: string): Promise<T> {
    return this.serde.loadsTyped(type, base64ToBytes(payload)) as Promise<T>
  }

  private async pendingWrites(row: CheckpointRow): Promise<CheckpointPendingWrite[]> {
    const { data, error } = await this.client
      .from(this.writesTable)
      .select('task_id,idx,channel,value_type,value_payload')
      .eq('thread_id', row.thread_id)
      .eq('checkpoint_ns', row.checkpoint_ns)
      .eq('checkpoint_id', row.checkpoint_id)
      .order('task_id', { ascending: true })
      .order('idx', { ascending: true })
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
      .select('*')
      .eq('thread_id', threadId)
      .eq('checkpoint_ns', namespace)
    const checkpointId = config.configurable?.checkpoint_id
    query = typeof checkpointId === 'string' && checkpointId
      ? query.eq('checkpoint_id', checkpointId)
      : query.order('checkpoint_id', { ascending: false }).limit(1)
    const { data, error } = await query.maybeSingle()
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
    const storedCheckpoint: Checkpoint = {
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
      parent_checkpoint_id: typeof config.configurable?.checkpoint_id === 'string'
        ? config.configurable.checkpoint_id
        : null,
      checkpoint_type: serializedCheckpoint.type,
      checkpoint_payload: serializedCheckpoint.payload,
      metadata_type: serializedMetadata.type,
      metadata_payload: serializedMetadata.payload,
    }
    const metadataRecord = metadata as unknown as Record<string, unknown>
    const turnId = typeof metadataRecord.turn_id === 'string' ? metadataRecord.turn_id : null
    let expectedLatestCheckpointId = row.parent_checkpoint_id
    if (expectedLatestCheckpointId === null) {
      const { data: latest, error: latestError } = await this.client
        .from(this.checkpointTable)
        .select('checkpoint_id')
        .eq('thread_id', row.thread_id)
        .eq('checkpoint_ns', row.checkpoint_ns)
        .order('checkpoint_id', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (latestError) throw latestError
      expectedLatestCheckpointId = typeof latest?.checkpoint_id === 'string'
        ? latest.checkpoint_id
        : null
    }
    const { error } = await this.client.rpc('assistant_put_checkpoint', {
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
    })
    if (error) {
      // A response can be lost after the RPC commits. Treat an identical row
      // as an idempotent retry; a different/missing row remains a CAS failure.
      const { data: existing, error: readError } = await this.client
        .from(this.checkpointTable)
        .select('checkpoint_type,checkpoint_payload,metadata_type,metadata_payload,parent_checkpoint_id')
        .eq('thread_id', row.thread_id)
        .eq('checkpoint_ns', row.checkpoint_ns)
        .eq('checkpoint_id', row.checkpoint_id)
        .maybeSingle()
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
    const { error } = await this.client
      .from(this.writesTable)
      .upsert(rows, { onConflict: 'thread_id,checkpoint_ns,checkpoint_id,task_id,idx' })
    if (error) throw error
  }

  async deleteThread(threadId: string): Promise<void> {
    if (!threadId) throw new Error('Missing LangGraph thread_id')
    const writesResult = await this.client.from(this.writesTable).delete().eq('thread_id', threadId)
    if (writesResult.error) throw writesResult.error
    const checkpointResult = await this.client.from(this.checkpointTable).delete().eq('thread_id', threadId)
    if (checkpointResult.error) throw checkpointResult.error
  }
}
