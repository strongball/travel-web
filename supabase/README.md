# Supabase backend rollout

The browser uses `@google/genai` and points its base URL at the authenticated
`gemini-proxy` Edge Function. The function is a constrained HTTP proxy with no
receipt prompt/schema and no Database or Storage access. Gemini credentials
stay on Supabase and must never use a `VITE_` prefix or be committed to GitHub.

```sh
supabase secrets set GEMINI_API_KEY=...
supabase functions deploy gemini-proxy
```

The proxy dynamically forwards authenticated requests for standard Gemini models (such as `gemini-3.7-flash` or `gemini-3.5-flash-lite`) to `v1beta/models/<MODEL>:generateContent` and `v1beta/models/<MODEL>:streamGenerateContent?alt=sse`. You configure the desired model on the frontend via `VITE_GEMINI_MODEL` (defaults to `gemini-3.7-flash`). Setting `GEMINI_MODEL` as a Supabase secret is optional and only needed if you want to strictly lock the proxy to a single model.

## Migration order

1. Apply `20260812012713_add_receipt_ocr_items.sql`. It is additive and creates
   receipt metadata, normalized expense items, owner-only RLS, and the atomic
   `save_expense_with_items` RPC.
2. Release clients that understand `storage://travel_images/<object-path>` and
   resolve private objects with short-lived signed URLs.
3. Verify every supported client has upgraded and back up the database.
4. Only then apply `20260812012714_privatize_travel_images.sql`. It validates
   user folders and stored references before canonicalizing expense/todo image
   references, making the bucket private, and replacing its Storage policies.

The private Storage migration is intentionally rollout-gated and must not be
applied with the initial backend release.
