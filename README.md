# Travel Web

Mobile-first travel expense editor with Gemini receipt OCR. The browser owns
the editable draft; scanning never writes data automatically.

## Stack

- Vite, React 19, TypeScript
- MUI for touch-friendly UI
- Jotai atoms for shared app state
- Supabase Auth, Postgres, Storage, and Edge Functions
- Official `@google/genai` SDK in the browser
- GitHub Pages for the static frontend

The browser uses `@google/genai` with a custom base URL. Receipt prompts, JSON
Schema, response validation, and total calculation stay in React. The
authenticated `gemini-proxy` Edge Function only forwards the allowed Gemini
REST request and replaces the placeholder browser key with `GEMINI_API_KEY`.
It does not know about receipts, use a service-role key, or access Database or
Storage.

## Local development

Requires Node 24 (the same version used by CI).

```sh
cp .env.example .env.local
npm ci
npm run dev
```

Only the Supabase project URL, publishable key, browser-restricted Google Maps
key, and non-secret model name belong in `VITE_` variables. Enable Maps
JavaScript API, Places API, and Routes API for the Google Cloud project, and
restrict the browser key to the local and production web origins.
Never put `GEMINI_API_KEY`, a Supabase secret key, or a service-role key in the
frontend environment.

Verification:

```sh
npm run lint
npm test
npm run build
```

## Supabase

See [`supabase/README.md`](supabase/README.md). The short version is:

1. Apply the additive receipt-items migration.
2. Set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` as Supabase secrets.
3. Keep `VITE_GEMINI_MODEL` equal to `GEMINI_MODEL`, then deploy
   `gemini-proxy` with JWT verification enabled.
4. Release the web client.
5. Apply the private Storage migration only after every supported client can
   resolve canonical `storage://` references.

## GitHub Pages

The Vite base path is `/travel-web/`. If the repository is renamed, update
`base` in `vite.config.ts`.

In GitHub:

1. Select **Settings → Pages → Source → GitHub Actions**.
2. Add Actions repository variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_GOOGLE_MAPS_API_KEY`
3. In Supabase Auth URL configuration, allow:
   `https://<github-user>.github.io/travel-web/`
4. Enable the Google Auth provider. In Google Cloud, set the authorized redirect
   URI to `https://kqmuljpahdyyiecorkbn.supabase.co/auth/v1/callback`; in
   Supabase, add the GitHub Pages URL above to the redirect allow list.
5. Push to `main`; `.github/workflows/deploy.yml` tests, builds, and deploys
   `dist` automatically.

This app does not need client-side pathname routing, so GitHub Pages refreshes
do not require a `404.html` workaround.
