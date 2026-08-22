import { RiverContainer } from '@stball/react-river'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listAssistantMessages: vi.fn(),
  saveAssistantMessage: vi.fn(),
}))

vi.mock('../lib/repositories/assistantRepository', () => mocks)

import type {
  AssistantGraphState,
  AssistantMessage,
  AssistantPendingToolCall,
  AssistantProposal,
} from '../features/assistant/types'
import { userIdProvider } from './authProviders'
import {
  assistantConversationsProvider,
  type AssistantConversationSnapshot,
} from './assistantConversationsProvider'

const message = (
  role: AssistantMessage['role'],
  turnId: string,
  content: string,
): AssistantMessage => ({
  id: `${role}-${turnId}`,
  turnId,
  role,
  content,
  createdAt: `2026-08-22T00:0${role === 'user' ? '1' : '2'}:00.000Z`,
})

const proposal = (): AssistantProposal => ({
  id: 'turn-t1',
  threadId: 'thread-1',
  turnId: 'turn-t1',
  itineraryId: 'trip-1',
  title: '調整行程',
  explanation: '',
  status: 'pending',
  createdAt: '2026-08-22T00:00:00Z',
  expectedDayRevisions: {},
  beforeDays: [],
  afterDays: [],
  proposedTodos: [],
  proposedCategories: [],
})

const pendingToolCall = (): AssistantPendingToolCall => ({
  id: 'tool-1',
  name: 'propose_itinerary_edit',
  proposal: proposal(),
})

const graphState = (
  overrides: Partial<AssistantGraphState> = {},
): AssistantGraphState => ({
  graphVersion: 8,
  summary: '',
  messages: [],
  request: null,
  assistantMessage: null,
  pendingToolCall: null,
  modelMessages: [],
  toolRound: 0,
  ...overrides,
})

let container: RiverContainer

beforeEach(() => {
  vi.clearAllMocks()
  mocks.listAssistantMessages.mockResolvedValue([])
  mocks.saveAssistantMessage.mockResolvedValue(undefined)
})

afterEach(() => {
  container?.dispose()
})

const setup = async (seededMessages: AssistantMessage[] = []) => {
  mocks.listAssistantMessages.mockResolvedValue(seededMessages)
  container = new RiverContainer({
    overrides: [{ original: userIdProvider, create: () => 'user-1' }],
  })
  const provider = assistantConversationsProvider('thread-1')
  await container.read(provider.promise)
  const notifier = container.read(provider.notifier) as any
  return {
    provider,
    notifier,
    snapshot: () => container.read(provider).data as AssistantConversationSnapshot,
  }
}

describe('canonical messages', () => {
  it('loads history on build', async () => {
    const seeded = [message('user', 'turn-1', '問題')]
    const { snapshot } = await setup(seeded)
    expect(snapshot().messages).toEqual(seeded)
    expect(snapshot().turn).toBeNull()
  })

  it('save upserts into cache and persists to repository', async () => {
    const seeded = [message('user', 'turn-1', '問題')]
    const { notifier, snapshot } = await setup(seeded)
    const assistant = message('assistant', 'turn-1', '回答')

    await notifier.save(assistant)

    expect(mocks.saveAssistantMessage).toHaveBeenCalledWith('thread-1', assistant)
    expect(snapshot().messages).toEqual([seeded[0], assistant])
    expect(mocks.listAssistantMessages).toHaveBeenCalledTimes(1)
  })

  it('keeps the in-flight turn when history reloads', async () => {
    const { notifier } = await setup()
    mocks.listAssistantMessages.mockResolvedValue([
      message('user', 'turn-9', '新載入的問題'),
    ])

    notifier.beginTurn()
    notifier.appendDelta('turn-t1', '生成中')

    // build() 的合併結果:新 canonical 訊息 + 保留處理中狀態
    const reloaded = await notifier.build()
    expect(reloaded.messages).toEqual([message('user', 'turn-9', '新載入的問題')])
    expect(reloaded.turn?.phase).toBe('running')
    expect(reloaded.turn?.streaming?.content).toBe('生成中')
  })
})

describe('beginTurn / endTurn', () => {
  it('starts a running overlay with clean fields', async () => {
    const { notifier, snapshot } = await setup()
    notifier.beginTurn()
    const state = snapshot()
    expect(state.turn).toMatchObject({ phase: 'running', streaming: null, error: null })
  })

  it('preserves a pending tool call across beginTurn (resume flow)', async () => {
    const { notifier, snapshot } = await setup()
    await notifier.commitTurn(graphState({ pendingToolCall: pendingToolCall() }))
    notifier.beginTurn()
    expect(snapshot().turn?.phase).toBe('running')
    expect(snapshot().turn?.pendingToolCall?.id).toBe('tool-1')
  })

  it('endTurn is a no-op without an overlay', async () => {
    const { notifier, snapshot } = await setup()
    const before = snapshot()
    notifier.endTurn()
    expect(snapshot()).toBe(before)
  })

  it('endTurn closes a plain running overlay', async () => {
    const { notifier, snapshot } = await setup()
    notifier.beginTurn()
    notifier.endTurn()
    expect(snapshot().turn).toBeNull()
  })

  it('endTurn keeps an errored overlay so the failure stays visible', async () => {
    const { notifier, snapshot } = await setup()
    notifier.beginTurn()
    notifier.fail('產生失敗')
    notifier.endTurn()
    expect(snapshot().turn?.phase).toBe('error')
    expect(snapshot().turn?.error).toBe('產生失敗')
  })
})

describe('streaming deltas', () => {
  it('creates then appends streaming text for the same turn', async () => {
    const { notifier, snapshot } = await setup()
    notifier.beginTurn()
    notifier.appendDelta('t1', '你好')
    notifier.appendDelta('t1', ',東京')
    expect(snapshot().turn?.streaming).toMatchObject({
      id: 'streaming-t1',
      turnId: 't1',
      content: '你好,東京',
    })
  })

  it('switches to a fresh draft when the turn changes', async () => {
    const { notifier, snapshot } = await setup()
    notifier.beginTurn()
    notifier.appendDelta('t1', 'A')
    notifier.appendDelta('t2', 'B')
    expect(snapshot().turn?.streaming?.turnId).toBe('t2')
    expect(snapshot().turn?.streaming?.content).toBe('B')
  })

  it('ignores empty deltas', async () => {
    const { notifier, snapshot } = await setup()
    notifier.beginTurn()
    const before = snapshot()
    notifier.appendDelta('t1', '')
    expect(snapshot()).toBe(before)
  })
})

describe('progress labels', () => {
  it('sets and clears labels while a turn is active', async () => {
    const { notifier, snapshot } = await setup()
    notifier.beginTurn()
    notifier.setProgress('套用中')
    expect(snapshot().turn?.progressLabel).toBe('套用中')
    notifier.setProgress(null)
    expect(snapshot().turn?.progressLabel).toBeNull()
  })
})

describe('commitTurn', () => {
  it('pauses with a pending tool call and clears streaming', async () => {
    const { notifier, snapshot } = await setup()
    notifier.beginTurn()
    notifier.appendDelta('t1', '部分文字')
    await notifier.commitTurn(graphState({ pendingToolCall: pendingToolCall() }))
    const state = snapshot()
    expect(state.turn?.phase).toBe('paused')
    expect(state.turn?.pendingToolCall?.proposal.id).toBe('turn-t1')
    expect(state.turn?.streaming).toBeNull()
  })

  it('finishes atomically: message enters canonical history and overlay ends', async () => {
    const seeded = [message('user', 'turn-u1', '問題')]
    const { notifier, snapshot } = await setup(seeded)
    notifier.beginTurn()
    notifier.appendDelta('turn-u1', '部分')

    const completed = message('assistant', 'turn-u1', '完整回答')
    const returned = await notifier.commitTurn(graphState({
      assistantMessage: completed,
      messages: [seeded[0], completed],
    }))

    expect(returned).toEqual(completed)
    expect(mocks.saveAssistantMessage).toHaveBeenCalledWith('thread-1', completed)
    const state = snapshot()
    expect(state.messages).toEqual([seeded[0], completed])
    expect(state.turn).toBeNull()
  })

  it('closes the overlay when the result has neither message nor proposal', async () => {
    const { notifier, snapshot } = await setup()
    notifier.beginTurn()
    await notifier.commitTurn(graphState())
    expect(snapshot().turn).toBeNull()
  })
})

describe('restore from checkpoint', () => {
  it('rebuilds a paused card when no overlay exists yet', async () => {
    const { notifier, snapshot } = await setup()
    notifier.restore(graphState({ pendingToolCall: pendingToolCall() }))
    expect(snapshot().turn?.phase).toBe('paused')
    expect(snapshot().turn?.pendingToolCall?.proposal.id).toBe('turn-t1')
  })

  it('clears stale cards when the checkpoint has none', async () => {
    const { notifier, snapshot } = await setup()
    await notifier.commitTurn(graphState({ pendingToolCall: pendingToolCall() }))
    notifier.restore(graphState())
    expect(snapshot().turn?.pendingToolCall).toBeNull()
  })

  it('does nothing on an idle conversation without checkpoint data', async () => {
    const { notifier, snapshot } = await setup()
    const before = snapshot()
    notifier.restore(null)
    expect(snapshot()).toBe(before)
  })
})

describe('patchPendingProposal', () => {
  it('optimistically updates the matching proposal status', async () => {
    const { notifier, snapshot } = await setup()
    await notifier.commitTurn(graphState({ pendingToolCall: pendingToolCall() }))
    notifier.patchPendingProposal('turn-t1', 'approved')
    expect(snapshot().turn?.pendingToolCall?.proposal.status).toBe('approved')
  })

  it('ignores unrelated proposals', async () => {
    const { notifier, snapshot } = await setup()
    await notifier.commitTurn(graphState({ pendingToolCall: pendingToolCall() }))
    const before = snapshot()
    notifier.patchPendingProposal('other', 'rejected')
    expect(snapshot()).toBe(before)
  })
})
