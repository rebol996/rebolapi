# Rebol API Development Prompt

You are a senior full-stack engineer. Build the project described in `PROJECT.md` in this repository.

## Project Goal

Build **Rebol API**, a personal AI Coding Model Control Center.

It is a cloud-synced personal platform for managing:

- AI subscriptions
- API keys
- callable models
- model endpoints
- model discovery
- routing strategies
- fallback chains
- usage logs
- token and cost tracking
- budgets
- alerts
- gateway tokens
- coding workflows

The core architectural rule is:

```text
ModelEndpoint = ApiKey + Model
```

Do not design routing around only a model or only an API key. All calling, health, quota, cost, and fallback decisions must operate on `ModelEndpoint`.

## Product Boundaries

Support official or compatible APIs only.

Do not implement:

- simulated web login
- provider limit bypassing
- reverse-engineered web membership access
- third-party password storage
- automated use of web-only memberships without official APIs

Web-only subscriptions can be tracked manually for cost, renewal, quota notes, and status.

## Required Tech Stack

Use:

```text
Next.js
TypeScript
Supabase Auth
Supabase PostgreSQL
Supabase RLS
Next.js route handlers
Server-side API key encryption
```

Prefer a clean, maintainable implementation over a quick demo.

## Required Environment Variables

Design the app around these variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ALLOWED_EMAIL=
API_KEY_ENCRYPTION_SECRET=
```

## Authentication

Implement single-owner login.

Requirements:

- Supabase Auth email login.
- Only `ALLOWED_EMAIL` can enter the app.
- Non-allowed emails must be denied and signed out.
- Database tables must use `user_id`.
- Enable RLS policies so users can only access their own rows.

## Core Data Model

Implement database schema for:

```text
providers
subscriptions
api_keys
models
model_endpoints
model_discoveries
prompt_templates
task_runs
usage_logs
budgets
alerts
gateway_tokens
```

All user-owned tables should include:

```text
id
user_id
created_at
updated_at
```

## Provider Abstraction

Do not hardcode only one provider.

Implement provider types:

```text
openai_compatible
anthropic
gemini
custom
```

Each provider must support:

- model list discovery
- chat request adaptation
- response adaptation
- usage extraction
- normalized error handling

Initial provider support:

```text
OpenAI-compatible
OpenRouter
Anthropic
Gemini
```

OpenAI-compatible providers should be configurable by base URL.

## API Key Management

API keys must be encrypted server-side before storage.

Requirements:

- Never return full plaintext API keys to the frontend.
- Show only a key preview.
- Support create, update, disable, delete, rotate, and test connection.
- One subscription can have multiple API keys.
- One API key can call multiple models.

## Key Model Discovery

Implement "Discover Models" for each API key.

Flow:

1. User selects an API key.
2. Server decrypts the key.
3. Server calls the provider model-list endpoint.
4. Unknown models are inserted into `models`.
5. Existing models are updated.
6. `model_endpoints` are created or updated for each callable model.
7. Previously seen but now missing endpoints are marked unavailable, not deleted.
8. A row is written to `model_discoveries`.

Important:

```text
Discovery means the model appears in the provider model list.
Validation means a real lightweight model call succeeds.
```

Support both discovery and single-model validation.

## Unified Gateway

Implement unified calling endpoints:

```text
POST /api/chat
POST /api/gateway/chat
POST /api/coding/analyze
POST /api/coding/review
POST /api/coding/plan
POST /api/coding/refactor
```

Support manual mode:

```text
provider_id
api_key_id
model_id
model_endpoint_id
```

Support automatic mode:

```text
task_type
strategy
```

Strategies:

```text
manual
best_quality
lowest_cost
fastest
most_quota_left
balanced
fallback_chain
```

Before each call, check:

- endpoint enabled
- endpoint health
- quota remaining
- budget remaining
- task restrictions
- rate limits
- estimated token count
- estimated cost
- sensitive information scan result

After each call, update:

- task run
- usage log
- token usage
- estimated or actual cost
- latency
- endpoint health
- subscription quota
- API key last used time
- alerts if thresholds are crossed

## Fallback

Implement fallback routing.

Fallback should trigger on:

- provider error
- rate limit
- timeout
- quota exceeded
- model unavailable
- endpoint disabled
- budget exceeded

Log every fallback attempt with:

- attempt number
- endpoint used
- error type
- HTTP status
- latency
- final endpoint
- final result

## Coding Workspace

Build a main Coding Workspace page.

It should support:

- requirement breakdown
- architecture planning
- code review
- bug diagnosis
- refactor planning
- test generation
- security review
- performance analysis
- PR description
- commit message
- multi-model comparison

Each task type can use:

- prompt template
- default model strategy
- temperature
- output format
- save policy
- preferred models
- blocked models

## Usage Logging

Every model call must create task and usage records.

Track:

- task type
- provider
- subscription
- API key
- model
- model endpoint
- input tokens
- output tokens
- total tokens
- estimated cost
- actual cost if available
- latency
- status
- error type
- error message
- HTTP status
- fallback attempt
- rating if provided

Support save policies:

```text
metadata_only
summary
full
```

## Budgets and Alerts

Implement budgets for:

```text
global
provider
subscription
api_key
model
model_endpoint
task_type
```

Implement in-app alerts for:

- subscription renewal
- low quota
- budget warning
- budget exceeded
- API key failure
- model unavailable
- endpoint health low
- cost spike
- unused subscription

## Sensitive Information Protection

Scan prompts before sending for:

- API keys
- private keys
- database URLs
- tokens
- passwords
- credentials
- emails
- phone numbers

Allow the user to:

- cancel
- send anyway
- redact and send

## Gateway Tokens

External tools must be able to call Rebol API with gateway tokens.

Requirements:

- Show plaintext token only once at creation.
- Store only token hash.
- Support scopes.
- Support rate limits.
- Support revocation.

Example scopes:

```text
chat:write
coding:write
logs:read
models:read
```

## UI Pages

Create these pages:

```text
Dashboard
Subscriptions
API Keys
Providers
Models
Model Endpoints
Coding Workspace
Chat
Prompt Templates
Usage Logs
Budgets
Alerts
Gateway Tokens
Settings
```

Design should be practical, dense, and operational. This is a personal control center, not a marketing site.

## Development Order

Work in this dependency order:

```text
1. Project initialization
2. Supabase connection
3. Authentication
4. Owner email whitelist
5. Database schema
6. RLS policies
7. Provider configuration
8. Subscription management
9. API key encryption and management
10. Model directory
11. Key model discovery
12. Model endpoint pool
13. Provider request adapters
14. Unified chat gateway
15. Usage logs
16. Token and cost tracking
17. Coding workspace
18. Prompt templates
19. Fallback routing
20. Budgets
21. Alerts
22. Dashboard
23. Sensitive information scanner
24. Gateway tokens
25. Import and export
26. Deployment configuration
27. End-to-end testing
```

## Acceptance Criteria

The app is complete when:

- The owner can sign in with the configured email.
- Other emails cannot access the app.
- The owner can create multiple subscriptions.
- The owner can create multiple API keys under one subscription.
- One API key can discover and bind multiple models.
- One model can be available through multiple API keys.
- The system can call a chosen model endpoint.
- The system can auto-select a model endpoint by strategy.
- The system can fallback after endpoint failure.
- Every call records usage, cost, tokens, latency, and errors.
- API keys are encrypted and never exposed in full to the frontend.
- Dashboard shows costs, renewals, quota, endpoint health, and alerts.
- Coding workspace supports structured coding tasks.
- External tools can call the gateway with a gateway token.
- Data can be exported and imported.
- RLS prevents cross-user data access.

## Engineering Expectations

Before coding, inspect the repository and existing files.

Preserve existing user changes.

Use clear TypeScript types.

Keep provider-specific logic isolated behind adapters.

Keep security-sensitive operations on the server.

Add tests for:

- API key encryption/decryption
- owner email access control
- provider adapters
- model discovery
- endpoint routing
- fallback behavior
- gateway token hashing
- usage logging

When uncertain, prioritize the architecture in `PROJECT.md`.
