import { describe, expect, it } from 'vitest'
import { tool } from '@langchain/core/tools'
import { z } from 'zod'
import {
  assertGeminiTools,
  findGeminiSchemaIssues,
  validateAllGeminiTools,
  validateGeminiToolSchema,
  GEMINI_UNSUPPORTED_SCHEMA_KEYS,
} from './schemaValidator'
import { assistantCallableTools } from './index'

describe('schemaValidator', () => {
  it('detects unsupported Gemini schema keys in nested structures', () => {
    const rawSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1 },
        time: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
        count: { type: 'integer', minimum: 0, maximum: 100 },
        unionField: { anyOf: [{ type: 'string' }, { type: 'null' }] },
      },
      additionalProperties: false,
      $schema: 'http://json-schema.org/draft-07/schema#',
    }

    const issues = findGeminiSchemaIssues(rawSchema)
    const keywords = issues.map((i) => i.keyword)

    expect(keywords).toContain('minLength')
    expect(keywords).toContain('pattern')
    expect(keywords).toContain('minimum')
    expect(keywords).toContain('maximum')
    expect(keywords).toContain('anyOf')
    expect(keywords).toContain('additionalProperties')
    expect(keywords).toContain('$schema')
  })

  it('validates a LangChain tool with an incompatible Zod schema', () => {
    const invalidTool = tool(async () => 'ok', {
      name: 'invalid_dummy_tool',
      description: 'A tool with unsupported Zod constraints',
      schema: z.object({
        id: z.string().min(1),
        code: z.string().regex(/^[A-Z]{3}$/),
        age: z.number().int().min(18).max(99),
        tag: z.union([z.literal('a'), z.literal('b')]),
      }),
    })

    const issues = validateGeminiToolSchema(invalidTool)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues.some((i) => i.keyword === 'minLength')).toBe(true)
    expect(issues.some((i) => i.keyword === 'pattern')).toBe(true)
    expect(issues.some((i) => i.keyword === 'minimum')).toBe(true)
    expect(issues.some((i) => i.keyword === 'maximum')).toBe(true)
    expect(issues.some((i) => i.keyword === 'anyOf')).toBe(true)
  })

  it('assertGeminiTools throws informative error when invalid tools are passed', () => {
    const invalidTool = tool(async () => 'ok', {
      name: 'broken_tool',
      description: 'broken',
      schema: z.object({
        title: z.string().min(1),
      }),
    })

    expect(() => assertGeminiTools([invalidTool])).toThrowError(
      /發現不相容於 Gemini 的 Tool Schema 定義.*broken_tool.*minLength/s,
    )
  })

  it('passes all active assistant callable tools without any issues', () => {
    const issuesByTool = validateAllGeminiTools(assistantCallableTools)
    expect(issuesByTool).toEqual({})
    expect(() => assertGeminiTools(assistantCallableTools)).not.toThrow()
  })

  it('exports the full set of unsupported keys', () => {
    expect(GEMINI_UNSUPPORTED_SCHEMA_KEYS.has('anyOf')).toBe(true)
    expect(GEMINI_UNSUPPORTED_SCHEMA_KEYS.has('minLength')).toBe(true)
    expect(GEMINI_UNSUPPORTED_SCHEMA_KEYS.has('pattern')).toBe(true)
    expect(GEMINI_UNSUPPORTED_SCHEMA_KEYS.has('minimum')).toBe(true)
  })
})
