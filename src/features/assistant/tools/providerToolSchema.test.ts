import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { describe, expect, it, vi } from 'vitest'
import {
  bindAssistantTools,
  mergeAssistantToolResults,
} from '../api/assistantApi'
import {
  langchainAssistantTools,
  proposeTodoListTool,
  shouldContinueAfterAssistantTool,
} from './index'

const unsupportedSchemaKeys = new Set([
  '$schema',
  'additionalProperties',
  'anyOf',
  'allOf',
  'oneOf',
  'pattern',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
])

function collectKeys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectKeys)
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) => [key, ...collectKeys(child)])
}

describe('active Gemini tool declarations', () => {
  it('uses LangChain tools with provider-safe schemas', () => {
    expect(langchainAssistantTools).toHaveLength(2)
    expect(langchainAssistantTools.map((tool) => tool.name)).toEqual([
      'propose_itinerary_edit',
      'propose_todo_list',
    ])
  })

  it('passes the shared schemas through ChatGoogleGenerativeAI without a network call', () => {
    const model = new ChatGoogleGenerativeAI({
      model: 'gemini-2.0-flash',
      apiKey: 'test-key',
    })

    const request = model.invocationParams({
      tools: langchainAssistantTools,
      tool_choice: 'auto',
    })

    const declarations = (request.tools ?? []).flatMap((tool) => (
      'functionDeclarations' in tool ? tool.functionDeclarations ?? [] : []
    ))
    expect(declarations.map((declaration) => declaration.name)).toEqual([
      'propose_itinerary_edit',
      'propose_todo_list',
    ])
    for (const declaration of declarations) {
      expect(collectKeys(declaration.parameters)).not.toEqual(
        expect.arrayContaining([...unsupportedSchemaKeys]),
      )
    }
    expect(request.toolConfig?.functionCallingConfig?.mode).toBe('AUTO')
  })

  it('binds the active tools with LangChain tool-choice config', () => {
    const bindTools = vi.fn(() => ({ invoke: vi.fn() }))
    const bound = bindAssistantTools({ bindTools } as unknown as ChatGoogleGenerativeAI)

    expect(bound).toEqual({ invoke: expect.any(Function) })
    expect(bindTools).toHaveBeenCalledWith(langchainAssistantTools, { tool_choice: 'auto' })
  })

  it('marks proposal tools as terminal and unknown tools as continuing by default', () => {
    expect(shouldContinueAfterAssistantTool('propose_todo_list')).toBe(false)
    expect(shouldContinueAfterAssistantTool('lookup_weather')).toBe(true)
  })
})

describe('LangChain runtime tool validation', () => {
  it('validates actual tool input with the Zod schema', async () => {
    const result = await proposeTodoListTool.invoke({
      reply: '已準備待辦。',
      todos: [{ title: '購買交通卡' }],
    })

    expect(result.proposal?.operations).toEqual([
      { type: 'add_todo', title: '購買交通卡' },
    ])
  })
})

describe('tool call contract', () => {
  it('merges Gemini parallel calls into one validated proposal', async () => {
    const result = mergeAssistantToolResults([
      {
        reply: '已準備新增景點。',
        proposal: {
          title: '新增景點',
          explanation: '行程安排',
          operations: [{
            type: 'add_todo',
            title: '購買交通卡',
          }],
        },
      },
      {
        reply: '已準備待辦。',
        proposal: {
          title: '待辦',
          explanation: '提醒事項',
          operations: [{ type: 'add_todo', title: '預約餐廳' }],
        },
      },
    ])

    expect(result.proposal?.operations).toEqual([
      { type: 'add_todo', title: '購買交通卡' },
      { type: 'add_todo', title: '預約餐廳' },
    ])
  })
})
