import { toJsonSchema } from '@langchain/core/utils/json_schema'
import type { StructuredToolInterface } from '@langchain/core/tools'

/**
 * Gemini Function Calling API 不支援的 OpenAPI / JSON Schema 屬性關鍵字清單。
 * 包含多型聯合（anyOf/oneOf/allOf）、正則（pattern）、字串長度（minLength/maxLength）、
 * 數值極值（minimum/maximum/multipleOf）與後設資料（$schema/additionalProperties）。
 */
export const GEMINI_UNSUPPORTED_SCHEMA_KEYS = new Set([
  '$schema',
  'additionalProperties',
  'anyOf',
  'allOf',
  'oneOf',
  'not',
  '$ref',
  'definitions',
  '$defs',
  'pattern',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
  'multipleOf',
])

export interface GeminiSchemaIssue {
  path: string
  keyword: string
  message: string
}

/**
 * 遞迴檢查 JSON Schema 物件中是否含有 Gemini 不相容的關鍵字
 */
export function findGeminiSchemaIssues(
  value: unknown,
  currentPath = '',
): GeminiSchemaIssue[] {
  const issues: GeminiSchemaIssue[] = []

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const itemPath = currentPath ? `${currentPath}[${index}]` : `[${index}]`
      issues.push(...findGeminiSchemaIssues(item, itemPath))
    })
    return issues
  }

  if (!value || typeof value !== 'object') {
    return issues
  }

  for (const [key, child] of Object.entries(value)) {
    const keyPath = currentPath ? `${currentPath}.${key}` : key
    if (GEMINI_UNSUPPORTED_SCHEMA_KEYS.has(key)) {
      issues.push({
        path: keyPath,
        keyword: key,
        message: `Gemini 不支援 '${key}' 屬性，請簡化或移除該約束。`,
      })
    }
    issues.push(...findGeminiSchemaIssues(child, keyPath))
  }

  return issues
}

/**
 * 模擬 @langchain/google-genai 在送出至 Google 前自動移除的後設屬性 ($schema, additionalProperties, strict)
 */
export function removeGenAiMetadataProperties(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(removeGenAiMetadataProperties)
  if (!obj || typeof obj !== 'object') return obj

  const cleaned: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (key === '$schema' || key === 'additionalProperties' || key === 'strict') {
      continue
    }
    cleaned[key] = removeGenAiMetadataProperties(value)
  }
  return cleaned
}

/**
 * 從 LangChain Tool 實例中解析出對應的 JSON Schema（並還原 provider 送出的最終結構）
 */
export function extractToolJsonSchema(tool: unknown): unknown {
  if (!tool || typeof tool !== 'object') return tool

  // 若為 LangChain StructuredToolInterface (具備 schema 屬性)
  if ('schema' in tool && tool.schema) {
    const rawSchema = tool.schema
    // 若為 Zod schema，透過 toJsonSchema 轉換為 JSON Schema
    const jsonSchema = (typeof rawSchema === 'object' && '_def' in rawSchema)
      ? toJsonSchema(rawSchema as Parameters<typeof toJsonSchema>[0])
      : rawSchema
    return removeGenAiMetadataProperties(jsonSchema)
  }

  // 若已經是 FunctionDeclaration 形式（包含 parameters 屬性）
  if ('parameters' in tool && tool.parameters) {
    return removeGenAiMetadataProperties(tool.parameters)
  }

  return tool
}

/**
 * 驗證單一 Tool 或 Schema 是否完全相容於 Gemini
 */
export function validateGeminiToolSchema(toolOrSchema: unknown): GeminiSchemaIssue[] {
  const schema = extractToolJsonSchema(toolOrSchema)
  return findGeminiSchemaIssues(schema)
}

/**
 * 批次驗證工具清單，回傳以 tool.name 為 key 的問題表（若全數合規，回傳空物件 `{}`）
 */
export function validateAllGeminiTools(
  tools: Array<StructuredToolInterface | { name: string; schema?: unknown } | unknown>,
): Record<string, GeminiSchemaIssue[]> {
  const issuesByTool: Record<string, GeminiSchemaIssue[]> = {}

  tools.forEach((tool, idx) => {
    const name = (tool && typeof tool === 'object' && 'name' in tool && typeof tool.name === 'string')
      ? tool.name
      : `tool_${idx}`

    const issues = validateGeminiToolSchema(tool)
    if (issues.length > 0) {
      issuesByTool[name] = issues
    }
  })

  return issuesByTool
}

/**
 * 斷言所有工具皆完全相容於 Gemini，若有任何不相容屬性則拋出帶有具體路徑的詳細錯誤
 */
export function assertGeminiTools(
  tools: Array<StructuredToolInterface | { name: string; schema?: unknown } | unknown>,
): void {
  const issuesByTool = validateAllGeminiTools(tools)
  const failedNames = Object.keys(issuesByTool)

  if (failedNames.length > 0) {
    const details = failedNames
      .map((name) => {
        const toolIssues = issuesByTool[name]
        const formatted = toolIssues
          .map((i) => `    - [${i.path}] (${i.keyword}): ${i.message}`)
          .join('\n')
        return `  • 工具 [${name}] 發現 ${toolIssues.length} 處不相容：\n${formatted}`
      })
      .join('\n')

    throw new Error(`發現不相容於 Gemini 的 Tool Schema 定義：\n${details}`)
  }
}
