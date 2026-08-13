import { describe, expect, it, vi } from 'vitest'
import {
  AssistantCheckpointTimeoutError,
  SupabaseAssistantCheckpointer,
  withAssistantCheckpointTimeout,
} from './assistantCheckpointer'

describe('assistant checkpoint request timeout', () => {
  it('aborts and rejects a checkpoint request that never responds', async () => {
    vi.useFakeTimers()
    const pending = new Promise<never>(() => {})
    const abortSignal = vi.fn((_signal: AbortSignal) => pending)
    const result = withAssistantCheckpointTimeout({
      then: pending.then.bind(pending),
      abortSignal,
    }, 12_000)
    const expectation = expect(result).rejects.toBeInstanceOf(AssistantCheckpointTimeoutError)
    await vi.advanceTimersByTimeAsync(12_000)
    await expectation
    expect(abortSignal.mock.calls[0]?.[0].aborted).toBe(true)
    vi.useRealTimers()
  })

  it('returns a successful request before the deadline', async () => {
    await expect(withAssistantCheckpointTimeout(Promise.resolve({ ok: true }), 12_000))
      .resolves.toEqual({ ok: true })
  })
})

describe('assistant checkpoint retention', () => {
  it('uses the single-latest checkpoint RPC by default', async () => {
    const rpc = vi.fn(async () => ({ data: { checkpoint_id: 'checkpoint-2' }, error: null }))
    const client = {
      rpc,
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
          }),
        }),
      }),
    }
    const saver = new SupabaseAssistantCheckpointer(client as never)
    await saver.put({ configurable: { thread_id: 'thread-1' } }, {
      v: 4,
      id: 'checkpoint-2',
      ts: '2026-08-13T00:00:00.000Z',
      channel_values: { messages: ['latest'] },
      channel_versions: { messages: 1 },
      versions_seen: {},
    }, { source: 'loop', step: 1, parents: {} }, { messages: 1 })
    expect(rpc).toHaveBeenCalledWith('assistant_replace_checkpoint', expect.objectContaining({
      p_parent_checkpoint_id: null,
      p_expected_latest_checkpoint_id: null,
    }))
  })

  it('falls back safely while the compacting RPC migration is rolling out', async () => {
    const rpc = vi.fn(async (name: string) => name === 'assistant_replace_checkpoint'
      ? { data: null, error: { code: 'PGRST202', message: 'assistant_replace_checkpoint was not found' } }
      : { data: { checkpoint_id: 'checkpoint-1' }, error: null })
    const client = {
      rpc,
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
          }),
        }),
      }),
    }
    const saver = new SupabaseAssistantCheckpointer(client as never)
    await saver.put({ configurable: { thread_id: 'thread-1' } }, {
      v: 4,
      id: 'checkpoint-1',
      ts: '2026-08-13T00:00:00.000Z',
      channel_values: { messages: ['latest'] },
      channel_versions: { messages: 1 },
      versions_seen: {},
    }, { source: 'loop', step: 1, parents: {} }, { messages: 1 })
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      'assistant_replace_checkpoint',
      'assistant_put_checkpoint',
    ])
  })
})
