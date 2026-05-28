# Rebol API Project Document

## 1. Product Positioning

Rebol API is a personal AI coding model control center.

It is designed for one primary user and provides cloud-synced management for AI subscriptions, API keys, callable models, model endpoints, routing strategies, usage logs, budgets, alerts, and coding workflows.

The product is not a traditional account pool or phone number pool. Its core purpose is to manage and route AI model access across multiple providers and subscriptions.

Core product definition:

```text
Personal AI Model Router + Billing System + Coding Workspace
```

The most important architectural rule:

```text
The scheduling unit is ModelEndpoint = ApiKey + Model
```

This means:

- One API key can call multiple models.
- One model can be available through multiple API keys.
- One model can be available through multiple providers.
- A subscription can contain multiple API keys.
- A provider can expose multiple models.
- Routing, health, cost, quota, fallback, and strategy decisions happen at the model endpoint level.

## 2. Product Boundaries

The system will support official or compatible API access only.

Supported:

- Official API keys.
- OpenAI-compatible providers.
- Anthropic API.
- Gemini API.
- OpenRouter API.
- Other providers with compatible API interfaces.
- Manual subscription and quota management.
- API key model discovery.
- Unified model calling gateway.

Not supported:

- Simulated web login.
- Bypassing provider limits.
- Storing third-party account passwords.
- Reverse-engineering web-only memberships.
- Automatically controlling Cursor, ChatGPT Plus, or Claude web memberships without official APIs.

For web-only subscriptions, the system can still track subscription cost, renewal date, quota notes, and usage manually.

## 3. Target User

The system is designed for personal use by a single owner.

Authentication requirement:

```text
Only the configured owner email can access the application.
```

The application should still use proper user isolation in the database so the system can be expanded later.

## 4. Recommended Tech Stack

```text
Frontend / full stack: Next.js
Language: TypeScript
Auth: Supabase Auth
Database: Supabase PostgreSQL
Authorization: Supabase RLS
Deployment: Vercel
Backend runtime: Next.js API routes / route handlers
API key encryption: server-side encryption
```

Required environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ALLOWED_EMAIL=
API_KEY_ENCRYPTION_SECRET=
```

## 5. Core Entities

The main system entities are:

```text
User
Provider
Subscription
ApiKey
Model
ModelEndpoint
ModelDiscovery
PromptTemplate
TaskRun
UsageLog
Budget
Alert
GatewayToken
```

All user-owned tables should include:

```text
id
user_id
created_at
updated_at
```

## 6. Authentication and Access Control

The application uses Supabase Auth.

Login flow:

```text
1. User opens the application.
2. User signs in with email.
3. Supabase authenticates the user.
4. Application checks user.email against ALLOWED_EMAIL.
5. If matched, user enters the app.
6. If not matched, user is signed out and access is denied.
```

Database rules:

```text
RLS must be enabled.
Rows must be restricted by user_id = auth.uid().
Service-role access is used only in trusted server-side code.
```

## 7. Provider System

Providers must not be hardcoded only as OpenAI, Anthropic, or Gemini. The system should use a provider abstraction layer.

Provider fields:

```text
name
slug
provider_type
base_url
models_endpoint
chat_endpoint
auth_type
default_headers
status
notes
```

Provider types:

```text
openai_compatible
anthropic
gemini
custom
```

Examples:

```text
OpenAI
Anthropic
Gemini
OpenRouter
DeepSeek
Moonshot
SiliconFlow
Together
Groq
Custom OpenAI-compatible endpoint
```

Each provider type should have request and response adapters for:

```text
Model list discovery
Chat completion
Token usage extraction
Error normalization
Cost calculation support
```

## 8. Subscription Management

Subscriptions represent paid or manually tracked memberships, plans, balances, or access sources.

The system must support multiple subscriptions for the same platform, same plan, or same model.

Examples:

```text
Claude Max - Main
Claude Max - Backup
OpenAI API - Main Key
OpenRouter - Balance Account
Cursor Pro - Main
Cursor Pro - Backup
```

Subscription fields:

```text
platform
plan_name
alias
account_label
price
currency
billing_cycle
renewal_date
auto_renew
status
quota_type
quota_total
quota_used
reset_cycle
reset_date
notes
```

Subscription statuses:

```text
active
paused
canceled
expired
trial
unknown
```

Quota types:

```text
token
request
credit
message
hour
daily_limit
monthly_limit
unlimited
unknown
```

## 9. API Key Management

Each subscription can have zero or more API keys.

Each API key can call multiple models.

API key fields:

```text
subscription_id
provider_id
key_alias
encrypted_key
key_preview
base_url
status
allowed_tasks
blocked_tasks
monthly_budget
single_call_budget
rate_limit_per_minute
max_parallel_requests
last_used_at
last_checked_at
failure_count
notes
```

Security requirements:

```text
API keys must be encrypted before storage.
The frontend must never receive the full plaintext key.
Only the server can decrypt keys for provider calls.
Only a short preview such as sk-...abcd can be shown.
Keys can be disabled, deleted, and rotated.
```

## 10. Model Directory

Models are global per user and can be connected to multiple API keys.

Model fields:

```text
provider_id
provider_model_id
display_name
family
context_length
input_price
output_price
currency
supports_tools
supports_structured_output
supports_vision
supports_streaming
quality_level
speed_level
cost_level
task_tags
notes
```

Model price changes should be handled with a price history table later if needed:

```text
model_prices
model_id
input_price
output_price
effective_from
effective_to
```

## 11. Model Endpoint Pool

ModelEndpoint is the most important operational entity.

Definition:

```text
ModelEndpoint = ApiKey + Model
```

Model endpoint fields:

```text
api_key_id
model_id
provider_model_id
is_available
enabled
priority
quota_type
quota_total
quota_used
reset_cycle
reset_date
low_quota_alert
allowed_tasks
blocked_tasks
success_count
failure_count
consecutive_failures
avg_latency_ms
last_success_at
last_error_at
last_error_message
health_score
discovered_at
last_seen_at
disabled_at
notes
```

Routing, fallback, budget checks, health checks, and usage tracking all operate on model endpoints.

## 12. API Key Model Discovery

The system must detect which models a key can call.

User flow:

```text
1. User adds or updates an API key.
2. User clicks "Discover Models".
3. Server calls the provider model list endpoint using that key.
4. System parses the returned model list.
5. Unknown models are added to the model directory.
6. ModelEndpoint rows are created or updated.
7. Models not seen in the latest scan are marked unavailable, not deleted.
8. Discovery result is logged.
```

Provider discovery examples:

```text
OpenAI-compatible: GET /v1/models
OpenRouter: GET /v1/models
Anthropic: GET /v1/models
Gemini: GET /v1beta/models
```

Discovery log fields:

```text
api_key_id
provider_id
status
discovered_count
added_count
updated_count
unavailable_count
error_message
raw_response_summary
created_at
```

Important distinction:

```text
Discovery means the model appears in the model list.
Validation means an actual lightweight call succeeds.
```

The first version should support discovery and single-model test calls.

## 13. Unified Calling Gateway

The system must provide a unified model calling layer.

Core endpoints:

```text
POST /api/chat
POST /api/coding/analyze
POST /api/coding/review
POST /api/coding/plan
POST /api/coding/refactor
POST /api/gateway/chat
```

Manual call mode:

```text
provider_id
api_key_id
model_id
model_endpoint_id
```

Automatic call mode:

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

Before calling a model, the gateway should check:

```text
endpoint enabled
endpoint health
quota remaining
budget remaining
task allowed
rate limit
estimated token count
estimated cost
sensitive information scan result
```

After calling a model, the gateway should update:

```text
usage logs
task run status
token usage
estimated or actual cost
latency
endpoint health
subscription quota
API key last_used_at
alerts if thresholds are crossed
```

## 14. Fallback Routing

Fallback is required for reliability.

Example fallback chain:

```text
Claude Sonnet via Anthropic Key A
Claude Sonnet via OpenRouter Key B
GPT-5 via OpenAI Key A
Gemini Pro via Gemini Key A
```

Fallback should trigger on:

```text
provider error
rate limit
timeout
quota exceeded
model unavailable
endpoint disabled
budget exceeded
```

Every fallback attempt must be logged with:

```text
attempt number
endpoint used
error type
HTTP status code
latency
final selected endpoint
final result
```

## 15. Coding Workspace

The Coding Workspace is a primary UI surface.

It should support structured coding tasks:

```text
Requirement breakdown
Architecture planning
Code review
Bug diagnosis
Refactor planning
Test generation
Security review
Performance analysis
PR description
Commit message
Multi-model comparison
```

Each task can have:

```text
task_type
prompt_template
default_strategy
default_temperature
output_format
save_policy
preferred_models
blocked_models
```

The workspace should allow:

```text
Prompt input
Code or error paste
File upload later
Model strategy selection
Manual endpoint selection
Multi-model comparison
Saving useful outputs
Rating model results
Viewing past task runs
```

## 16. Prompt Templates

Prompt templates should be reusable and task-specific.

Fields:

```text
name
task_type
system_prompt
user_prompt_template
variables
default_strategy
default_temperature
default_save_policy
status
notes
```

Template examples:

```text
Review this code for bugs and regressions.
Create an implementation plan.
Generate tests for this function.
Explain this error and propose fixes.
Write a PR description.
Create a commit message.
Compare two architecture options.
```

## 17. Usage Logs and Task Runs

Every model call should create a task run and one or more usage log records.

Task run fields:

```text
task_type
title
input_summary
strategy
status
selected_endpoint_id
final_endpoint_id
total_input_tokens
total_output_tokens
total_cost
total_latency_ms
save_policy
rating
notes
```

Usage log fields:

```text
task_run_id
subscription_id
api_key_id
model_id
model_endpoint_id
provider_id
request_type
input_tokens
output_tokens
total_tokens
estimated_cost
actual_cost
latency_ms
status
error_type
error_message
http_status
fallback_attempt
created_at
```

Save policies:

```text
metadata_only
summary
full
```

## 18. Cost and Budget Management

The system should track both fixed subscription costs and API usage costs.

Budget scopes:

```text
global
provider
subscription
api_key
model
model_endpoint
task_type
```

Budget fields:

```text
scope
scope_id
period
amount
currency
warning_threshold
hard_limit
status
```

The gateway should enforce:

```text
single-call cost limit
monthly budget limit
task-type budget limit
endpoint budget limit
```

Cost estimation should happen before calls when possible.

## 19. Alerts

The first version should support in-app alerts.

Alert types:

```text
subscription_renewal
low_quota
budget_warning
budget_exceeded
api_key_failure
model_unavailable
endpoint_health_low
cost_spike
unused_subscription
```

Alert fields:

```text
type
severity
title
message
entity_type
entity_id
status
created_at
resolved_at
```

Alert statuses:

```text
open
acknowledged
resolved
ignored
```

## 20. Sensitive Information Protection

Prompts may contain secrets or private data.

Before sending, scan for:

```text
API keys
private keys
database URLs
tokens
password-like values
email addresses
phone numbers
credentials
```

If sensitive information is detected, allow:

```text
cancel
send anyway
redact and send
```

The system should also allow choosing a default log save policy:

```text
metadata_only
summary
full
```

## 21. Gateway Tokens

External tools should be able to call Rebol API through a local platform token.

Gateway token fields:

```text
name
token_hash
scopes
rate_limit_per_minute
status
last_used_at
created_at
revoked_at
```

Token rules:

```text
Only show plaintext token once at creation.
Store only token hash.
Allow revocation.
Allow scope restrictions.
```

Example scopes:

```text
chat:write
coding:write
logs:read
models:read
```

## 22. Import and Export

The system should support cloud sync but still provide data portability.

Required exports:

```text
Full JSON backup
Subscriptions CSV
Usage logs CSV
Billing CSV
Prompt templates JSON
Provider configuration JSON
```

Required imports:

```text
Full JSON restore
Provider configuration JSON
Prompt templates JSON
Subscriptions CSV
```

## 23. Dashboard

Dashboard should show:

```text
Monthly total cost
Fixed subscription cost
API usage cost
Upcoming renewals
Low quota subscriptions
Budget warnings
API key health
Model endpoint health ranking
Model call counts
Average model cost
Average model rating
Recommended model endpoints
Unused or wasteful subscriptions
Recent task runs
Open alerts
```

## 24. UI Pages

Recommended pages:

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

## 25. Development Order

Development should proceed in dependency order:

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

## 26. Acceptance Criteria

The project is acceptable when:

```text
The owner can sign in with the configured email.
Other emails cannot access the app.
The owner can create multiple subscriptions.
The owner can create multiple API keys under one subscription.
One API key can discover and bind multiple models.
One model can be available through multiple API keys.
The system can call a chosen model endpoint.
The system can auto-select a model endpoint by strategy.
The system can fallback after endpoint failure.
Every call records usage, cost, tokens, latency, and errors.
API keys are encrypted and never exposed in full to the frontend.
Dashboard shows costs, renewals, quota, endpoint health, and alerts.
Coding workspace supports structured coding tasks.
External tools can call the gateway with a gateway token.
Data can be exported and imported.
RLS prevents cross-user data access.
```

## 27. Initial Provider Support

Recommended first provider support:

```text
OpenAI-compatible
OpenRouter
Anthropic
Gemini
```

OpenAI-compatible support should cover many additional providers through configurable base URLs.

## 28. Naming

Working project name:

```text
Rebol API
```

Internal concept names:

```text
ModelEndpoint
Model Endpoint Pool
Key Model Discovery
Unified Gateway
Coding Workspace
```

## 29. Summary

Rebol API should be built as a serious personal model operations platform.

The system is not only a subscription tracker and not only a chat UI. Its durable foundation is the model endpoint pool:

```text
ModelEndpoint = ApiKey + Model
```

Once this foundation is correct, routing, fallback, budgets, usage logs, model discovery, and coding workflows can all build on top of it cleanly.
