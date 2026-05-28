# Rebol API - Development Guide

## Tech Stack
- Next.js 16 + TypeScript + Tailwind CSS
- Supabase (Auth, PostgreSQL, RLS)
- Server-side AES-256-GCM encryption for API keys

## Commands
```bash
npm run dev        # Start dev server
npm run build      # Production build
npm run start      # Start production server
npm run lint       # Run ESLint
npm run typecheck  # TypeScript type checking
```

## Environment Variables
```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ALLOWED_EMAIL=
API_KEY_ENCRYPTION_SECRET=
```

## Database Setup
Run `supabase/migrations/00001_initial_schema.sql` in your Supabase SQL editor.

## Architecture
- `src/types/database.ts` - TypeScript types for all entities
- `src/lib/crypto.ts` - API key encryption/decryption
- `src/lib/token.ts` - Gateway token hashing
- `src/lib/sensitive-scanner.ts` - Detect sensitive info in prompts
- `src/lib/providers/` - Provider adapter pattern (OpenAI, Anthropic, Gemini, OpenRouter)
- `src/lib/supabase/` - Server and client Supabase clients
- `src/middleware.ts` - Auth + ALLOWED_EMAIL whitelist
- `src/app/api/` - All API routes
- `src/app/(dashboard)/` - All dashboard pages
- `src/app/auth/` - Login + callback pages
- `src/components/` - Shared components (NavSidebar)

## Core Concept
ModelEndpoint = ApiKey + Model
All routing, health, quota, cost, and fallback decisions operate on ModelEndpoint.

## Provider Adapters
Each provider type has an adapter that implements:
- discoverModels() - Fetch available models
- chatCompletion() - Make a chat request
- parseError() - Normalize errors

## API Routes
- `/api/providers` - Provider CRUD
- `/api/subscriptions` - Subscription CRUD
- `/api/api-keys` - API key CRUD (keys encrypted, never exposed)
- `/api/api-keys/[id]/discover` - Model discovery for a key
- `/api/models` - Model CRUD
- `/api/model-endpoints` - Endpoint CRUD + health
- `/api/chat` - Unified chat gateway (manual + auto routing)
- `/api/gateway/chat` - External gateway (token auth)
- `/api/coding/[task]` - Coding task shortcuts
- `/api/prompt-templates` - Template CRUD
- `/api/usage-logs` - Usage log queries
- `/api/budgets` - Budget CRUD
- `/api/alerts` - Alert management
- `/api/gateway-tokens` - Gateway token CRUD
- `/api/data/export` - Import/Export

## Pages
Dashboard, Subscriptions, API Keys, Providers, Models, Model Endpoints, Chat, Coding Workspace, Prompt Templates, Usage Logs, Budgets, Alerts, Gateway Tokens, Settings
