# Agent Guidelines & Technical Invariants

This document outlines architectural rules, technical constraints, and invariants for AI agents working in this codebase.

---

## 1. Gemini Structured Outputs (`responseSchema`) Guidelines & Limitations

When implementing or modifying Gemini API calls that use Structured Outputs (`responseSchema` from `@google/genai` or `@google/generative-ai`):

### 1.1 Strict Prohibition: Do NOT Use `nullable: true`
- **Issue**: In the Gemini API (REST `v1beta` endpoint), specifying `nullable: true` on primitive properties (such as `Type.STRING`, `Type.NUMBER`, `Type.INTEGER`, etc.) causes an immediate **`HTTP 400 Bad Request: INVALID_ARGUMENT (Unknown name "nullable")`**.
- **Rule**: Never set `nullable: true` on fields in `responseSchema`.

### 1.2 How to Define Optional vs Required Properties
- In Gemini's OpenAPI 3.0 schema subset, **all properties are optional by default**.
- **Optional fields**: Simply define the property with its `type` (and `description`), but **omit** its key from the parent object's `required: [...]` array.
- **Required fields**: Only fields that the model *must* always output should be listed in `required: ['field1', 'field2']`.

```ts
// ❌ WRONG: Will trigger HTTP 400 Bad Request from Gemini API
export const badSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    price: { type: Type.NUMBER, nullable: true }, // ❌ Causes 400 error
  },
  required: ['title'],
}

// ✅ CORRECT: price is optional by omitting it from required
export const goodSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: 'Title of the product' },
    price: { type: Type.NUMBER, description: 'Unit price if printed on receipt' },
  },
  required: ['title'], // price is optional and safely omitted when null
}
```

### 1.3 Schema Complexity & Unsupported Features
- **Allowed Types**: `Type.OBJECT`, `Type.ARRAY`, `Type.STRING`, `Type.NUMBER`, `Type.INTEGER`, `Type.BOOLEAN`.
- **Avoid Unsupported Constructs**: Do not use `additionalProperties`, `anyOf`, `oneOf`, `$ref`, or validation constraints like `minLength`/`pattern` in `responseSchema`. Keep schemas clean and declarative.

### 1.4 Client-Side Resilience (Zod + JSON Extraction)
- Always pair structured outputs with client-side **Zod** (`safeParse`) validation:
  1. Use `extractJsonFromText(response.text)` to safely extract JSON even if fenced in markdown (```json ... ```).
  2. Use Zod `.nullish().transform(...)` to normalize omitted keys or explicit `null` values into consistent application defaults.
  3. Coerce numeric strings or missing translations safely.

### 1.5 Error Propagation & Inheritance
- Custom error classes extending `Error` (e.g. `ReceiptScanError`) must execute `Object.setPrototypeOf(this, CustomError.prototype)` and set `this.name` to ensure `instanceof Error` checks succeed across asynchronous module boundaries.
- Error handling in workflows (such as River mutation `onError`) must inspect `error.message` on error-like objects to avoid masking upstream messages behind generic errors ("發生未預期的錯誤").

---

## 2. Architecture & State Management

- **State Management**: Uses `@stball/react-river`. Follow reactive provider conventions and avoid imperative mutations outside notifier actions.
- **Offline-First Synchronization**: Mutations must support offline persistence through IndexedDB (`enqueueOfflineMutation`) with optimistic state updates.
- **Agent Assistant Guidelines**: See detailed LangGraph HITL rules in [langgraph_assistant_guidelines.md](file://.agents/rules/langgraph_assistant_guidelines.md).
