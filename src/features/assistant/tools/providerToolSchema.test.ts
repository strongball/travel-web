import { ChatGoogleGenerativeAI } from '@langchain/google-genai'
import { describe, expect, it, vi } from 'vitest'
import { bindAssistantTools } from '../services/assistantApi'
import {
  assistantCallableTools,
  assistantBuiltinTools,
  langchainAssistantTools,
  proposeTodoListTool,
  findGeminiSchemaIssues,
} from './index'

describe('active Gemini tool declarations', () => {
  it('uses LangChain tools with provider-safe schemas', () => {
    expect(assistantCallableTools).toHaveLength(7)
    expect(assistantCallableTools.map((tool) => tool.name)).toEqual([
      'propose_itinerary_edit',
      'propose_todo_list',
      'ask_clarifying_question',
      'view_itinerary',
      'view_todo_categories',
      'view_todo_list',
      'search_web_information',
    ])
    expect(assistantBuiltinTools).toEqual([
      { urlContext: {} },
      { codeExecution: {} },
    ])
    expect(langchainAssistantTools).toHaveLength(9)
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
      'ask_clarifying_question',
      'view_itinerary',
      'view_todo_categories',
      'view_todo_list',
      'search_web_information',
    ])
    const issues: Record<string, string[]> = {}
    for (const declaration of declarations) {
      const toolIssues = findGeminiSchemaIssues(declaration.parameters)
      if (toolIssues.length > 0) {
        issues[declaration.name] = toolIssues.map((i) => `${i.path} (${i.keyword})`)
      }
    }
    expect(issues).toEqual({})
    expect(request.toolConfig?.functionCallingConfig?.mode).toBe('AUTO')
  })

  it('binds the active tools with LangChain tool-choice config', () => {
    const bindTools = vi.fn(() => ({ invoke: vi.fn() }))
    const bound = bindAssistantTools({ bindTools } as unknown as ChatGoogleGenerativeAI)

    expect(bound).toEqual({ invoke: expect.any(Function) })
    expect(bindTools).toHaveBeenCalledWith(langchainAssistantTools, { tool_choice: 'auto' })
  })
})

describe('LangChain runtime tool validation', () => {
  it('requires graph turn context before creating a proposal', async () => {
    await expect(proposeTodoListTool.invoke({
      reply: '已準備待辦。',
      todos: [{ title: '購買交通卡' }],
    })).rejects.toThrow('Proposal tool requires a turn id')
  })
})
