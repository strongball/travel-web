# Gemini Structured Outputs (`responseSchema`) Rules & Invariants

## 1. Schema Compatibility Rules
- **No `nullable: true`**: Gemini REST API rejects `nullable: true` on primitive fields (`Type.STRING`, `Type.NUMBER`, `Type.INTEGER`, `Type.BOOLEAN`) with `HTTP 400 Bad Request: INVALID_ARGUMENT`. Never set `nullable: true`.
- **Optional vs Required**:
  - In Gemini OpenAPI Schema, all fields are optional by default.
  - To mark a field as optional, omit it from the `required` array.
  - Only specify fields in `required: [...]` if they must always be present in the output.
- **Allowed Schema Types**: Only use `Type.OBJECT`, `Type.ARRAY`, `Type.STRING`, `Type.NUMBER`, `Type.INTEGER`, `Type.BOOLEAN`.
- **Disallowed Schema Features**: Do not use `additionalProperties`, `anyOf`, `oneOf`, `$ref`, `minLength`, `pattern`.

## 2. Client-Side Post-Processing
- **JSON Markdown Stripping**: Always strip markdown fences (`extractJsonFromText`) before running `JSON.parse`.
- **Runtime Validation**: Validate with **Zod** (`safeParse`) to coerce numbers, provide fallbacks, and handle missing/nullish fields safely.

## 3. Error Handling
- Custom errors extending `Error` must call `Object.setPrototypeOf(this, Class.prototype)` to maintain `instanceof Error` across dynamic chunk imports.
- Never mask upstream error messages behind generic UI errors without checking `error.message`.
