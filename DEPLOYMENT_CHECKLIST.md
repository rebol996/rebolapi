# Rebol API Deployment Checklist

## 0. Current Code Gate

- [x] `npm run typecheck` passes.
- [x] `npm run lint` passes with warnings only.
- [x] `npm run build` passes.
- [x] Gateway API is public-token based and no longer blocked by dashboard auth middleware.
- [x] Gateway API uses Supabase service role on the server side.
- [x] Gateway token rate limiting is implemented.
- [x] Production CORS is controlled by `ALLOWED_ORIGINS`.
- [ ] `npm audit --audit-level=moderate` is clean.

Current audit note: Next.js 16.2.6 depends on a vulnerable PostCSS range. Do not run `npm audit fix --force`; it attempts to downgrade Next.js to an old major version.

## 1. Supabase Project

- [x] Create or select the production Supabase project.
- [x] Open SQL Editor.
- [x] Run `supabase/migrations/00001_initial_schema.sql`.
- [x] Confirm the core tables exist:
  - `providers`
  - `subscriptions`
  - `api_keys`
  - `models`
  - `model_endpoints`
  - `gateway_tokens`
  - `usage_logs`
  - `budgets`
  - `alerts`
  - `task_runs`
- [ ] Confirm RLS is enabled on the tables in the migration.

## 2. Supabase Auth

- [ ] Enable Email auth provider.
- [x] Set Site URL to the production domain.
- [x] Add redirect URLs:
  - `https://ai.rebol.top/auth/callback`
  - `http://localhost:3000/auth/callback`

## 3. Vercel Environment Variables

Set these variables for Production, Preview, and Development as appropriate:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ALLOWED_EMAIL=
ALLOWED_ORIGINS=
API_KEY_ENCRYPTION_SECRET=
```

Important:

- `SUPABASE_SERVICE_ROLE_KEY` must never be exposed in frontend code, screenshots, or Git.
- `API_KEY_ENCRYPTION_SECRET` must be stable after launch. Changing it breaks decryption for stored API keys.
- `ALLOWED_ORIGINS` should be the exact frontend origin, for example `https://example.com`.

Local verification:

- [x] `.env.local` configured.
- [x] Local login works at `http://localhost:3000`.
- [x] Auth callback writes session cookies correctly.

## 4. Vercel Project Settings

- [ ] Framework Preset: Next.js.
- [ ] Build Command: `npm run build`.
- [ ] Install Command: `npm install`.
- [ ] Output Directory: leave empty.
- [ ] Root Directory: repository root for this app, not the parent `01_Active` directory.

## 5. Preview Deployment Smoke Test

- [ ] Open the preview URL.
- [ ] Unauthenticated users redirect to `/auth/login`.
- [ ] The `ALLOWED_EMAIL` account can log in.
- [ ] A non-allowed email is rejected.
- [ ] Create a provider.
- [ ] Add an API key.
- [ ] Discover models.
- [ ] Create or enable a model endpoint.
- [ ] Send a chat request from the dashboard.
- [ ] Create a gateway token.
- [ ] Send a request to `/api/gateway/chat` with the gateway token.

## 6. Gateway Smoke Test

PowerShell example:

```powershell
$headers = @{
  "Authorization" = "Bearer rba_xxx"
  "Content-Type" = "application/json"
}

$body = @{
  messages = @(
    @{
      role = "user"
      content = "Say hello in one sentence."
    }
  )
  strategy = "balanced"
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "https://YOUR_DOMAIN/api/gateway/chat" -Method Post -Headers $headers -Body $body
```

Expected result:

- HTTP 200 for a valid active token with enough quota and a usable endpoint.
- HTTP 401 for invalid or revoked tokens.
- HTTP 403 for insufficient token scopes.
- HTTP 429 after exceeding the token's configured per-minute rate limit.

## 7. Production Release

- [ ] Preview smoke test passed.
- [ ] Production environment variables are configured.
- [ ] Supabase Auth production URL is configured.
- [ ] Production domain is assigned in Vercel.
- [ ] Production login works.
- [ ] Production gateway smoke test works.
- [ ] Post-deploy health check works at `/api/health`.

## 8. Post-Launch Hardening

- [ ] Monitor Next.js release notes and update when the PostCSS advisory is fixed upstream.
- [ ] Migrate `middleware.ts` to `proxy.ts` for Next.js 16 convention.
- [ ] Consider allowing multiple admin emails via a comma-separated env var or database table.
- [ ] Add persistent distributed rate limiting if deploying across multiple serverless regions or providers.
- [ ] Add security event logging for auth failures, token failures, and budget blocks.
