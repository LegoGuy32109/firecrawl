# LLM Proxy — Full Design Spec

Local LLM testing infrastructure for the Firecrawl playground. Enables AI-powered API testing (scrape with `json`/`summary`/`interact` formats) without external API keys, using Codex or Claude CLI running locally or in Docker.

---

## Problem

The playground needs to exercise AI-powered Firecrawl APIs (browser agent, `generateObject`, `generateText` with tools). All `getModel()` call sites hardcode external providers (OpenAI, Google, Groq, Vertex). No API keys = no test coverage.

The user has enterprise subscriptions to Codex (OpenAI) and Claude (Anthropic) running as local CLI tools. Goal: route all Firecrawl AI calls through a subprocess wrapper backed by one of these CLIs, with no API keys required.

---

## Architecture Decisions

### 1. Service location: Separate `apps/llm-proxy/`

Own Docker container, own port, own concerns. Playwright-service handles browsers; llm-proxy handles AI calls. Clean separation means Claude can be swapped for Codex without touching browser code. The Docker portability story requires the auth volume to live with the proxy service.

### 2. `POST /complete` — Typed envelope response

Request:

```ts
{
  messages: LanguageModelV1Message[],  // full conversation history
}
```

Response — one of two shapes:

```ts
{ type: "text", text: string }
{ type: "tool_call", name: string, args: object }
```

The proxy spawns the subprocess, gets text back, tries `JSON.parse` on the response. If it parses and has `tool` + `args` fields → `type: "tool_call"`. Otherwise → `type: "text"`.

Rationale: proxy detects tool calls in one place; provider never handles raw tool-call-shaped strings.

### 3. `getModel()` intercepts ALL calls

In `apps/api/src/lib/generic-ai.ts`, add an early return at the top of `getModel()`:

```ts
export function getModel(name: string, provider: Provider = defaultProvider) {
  if (config.LOCAL_LLM_PROXY_URL) {
    return createLocalProxyProvider(config.LOCAL_LLM_PROXY_URL)(name);
  }
  // ... existing logic
}
```

This intercepts all ~25 call sites regardless of hardcoded provider (`"google"`, `"groq"`, `"vertex"`, etc.). The proxy ignores the model name and uses its configured model. Zero changes to call sites.

Env var: `LOCAL_LLM_PROXY_URL=http://localhost:3001`

### 4. Text-based tool call protocol

The custom `LanguageModelV1` provider handles all AI SDK protocol translation before POSTing:

- **Tool definitions**: serialized into the system prompt as JSON schema with an instruction like:
  ```
  You have access to these tools. To call a tool, respond ONLY with:
  {"tool": "<name>", "args": <args object>}
  Available tools: <tool definitions JSON>
  ```
- **`generateObject` schema**: provider sees `mode: { type: 'object-json', schema }`, prepends:
  ```
  Respond ONLY with valid JSON matching this schema: <schema JSON>
  ```
  The proxy never receives a schema field — it only receives messages.

The proxy's job: spawn subprocess, get text, detect tool call JSON, return typed envelope.

### 5. One subprocess per AI SDK step + timeout

```
PROXY_TIMEOUT_MS=30000  (default: 30s per step)
```

`generateText` with `maxSteps: 25` = up to 25 sequential subprocess calls. Typical browser agent runs finish in 3-8 steps (~20-50s at the ~5-6s/step floor). Acceptable for demo purposes — the diagnostics waterfall shows per-step timing, making the latency visible rather than opaque.

No persistent subprocess / daemon mode: `codex exec` doesn't support it and piping stdin/stdout is fragile.

### 6. Docker named volume for auth

```yaml
volumes:
  codex-auth:

services:
  llm-proxy:
    volumes:
      - codex-auth:/root/.codex
```

New user setup (one-time):

```sh
docker run -it --volume codex-auth:/root/.codex <codex-image> codex login
```

**Do NOT use bind mounts** (`~/.codex:/root/.codex`). Bind mounts run as root in Docker, corrupt host `~/.codex` ownership, and Codex migrates auth to encrypted storage deleting `auth.json`. Named volume is isolated and safe.

**Auth error handling**:

- Startup: run a test `codex exec` call, detect auth error in output, log a clear warning to Docker logs with the login command
- Request time: when subprocess fails with auth error, `POST /complete` returns:
  ```json
  {
    "error": "CODEX_NOT_AUTHENTICATED",
    "message": "Codex is not logged in. Run: docker run -it --volume codex-auth:/root/.codex <image> codex login"
  }
  ```
- Playground UI surfaces this as a banner in the LLM settings panel

### 7. Backend abstraction

```
PROXY_BACKEND=codex|claude  (default: codex)
```

Each backend implements one interface:

```ts
interface LLMBackend {
  complete(messages: Message[]): Promise<string>;
}
```

**Codex backend** — verified optimal flags:

```sh
codex exec --json \
  --skip-git-repo-check \
  --ephemeral \
  --ignore-rules \
  --ignore-user-config \
  -c 'model="gpt-5.5"' \
  -c 'model_reasoning_effort="low"'
```

- `--skip-git-repo-check`: required in Docker (no git repo in container)
- `--ephemeral`: no session persistence
- `--ignore-rules`: skip `.codex/rules.md`
- `--ignore-user-config`: avoid defaulting back to `xhigh` reasoning effort
- `model_reasoning_effort="low"`: ~42 reasoning tokens vs 14+ for `xhigh`. Cannot go lower — `minimal` is blocked by hardcoded `web_search` tool in Codex.
- `gpt-5.4-mini` **rejected** — ChatGPT subscription only supports ChatGPT-specific models (`gpt-5.5`, `gpt-5.4`, `gpt-5.4-mini` not available via subscription)
- Measured latency: ~5-6s/call, irreducible. 12k input token overhead on first call (cached on subsequent).

**Claude backend** — same subprocess pattern:

```sh
claude --output-format json --prompt "<prompt>"
```

JSONL output, same parsing pattern as Codex.

### 8. Playground UI — LLM settings panel

Collapsible section in the playground header/sidebar showing:

- Provider name (codex / claude)
- Connection status (connected / not configured / auth error)
- Model in use and reasoning effort level
- Estimated latency per step (~5-6s for codex)
- Setup instructions with exact `docker run` login command
- Links to download Codex / Claude CLI

When `LOCAL_LLM_PROXY_URL` is not set, the panel shows "LLM proxy not configured" with setup instructions. AI-powered formats still show in the UI but fail with a clear error pointing to the panel.

---

## PR Sequencing

### PR 1: `apps/llm-proxy/` service

Files changed:

- `apps/llm-proxy/` — new service (Express, TypeScript)
  - `src/index.ts` — server entry, `POST /complete` route, auth health check
  - `src/backends/codex.ts` — Codex subprocess backend
  - `src/backends/claude.ts` — Claude subprocess backend
  - `src/backends/index.ts` — backend factory (`PROXY_BACKEND` env var)
  - `package.json`, `tsconfig.json`, `Dockerfile`
- `apps/api/src/lib/generic-ai.ts` — add `LOCAL_LLM_PROXY_URL` guard + `createLocalProxyProvider`
- `apps/api/src/config.ts` — add `LOCAL_LLM_PROXY_URL` env var
- `docker-compose.yaml` — add `llm-proxy` service + `codex-auth` named volume
- `docker-compose.dev.yaml` — expose proxy port
- Playground UI — add LLM settings panel

Testable without `onStep` wiring: make a scrape request with `formats: ["json"]` or `formats: ["summary"]` and verify it completes through the proxy.

### PR 2: `onStep` diagnostics wiring

Files changed:

- `apps/api/src/lib/scrape-interact/browser-agent.ts` — add `onStep?: (step: DiagnosticStep) => void` parameter to `executePromptViaBrowserAgent`; call it inside `browserTool.execute()` after each command
- `apps/api/src/controllers/v2/scrape-browser.ts` — pass `(step) => r.step(step, "actions")` as the `onStep` callback

Uses PR 1's proxy for test coverage. Test: POST to `/v2/scrape` with `interact`, verify `diagnostics.actions` populated in response.

---

## Key Constraints

- **No bind mounts for `~/.codex`** — destroys host auth. Named volume only.
- **No `minimal` reasoning effort** — Codex hardcodes `web_search` tool which blocks `minimal`.
- **No standard OpenAI API models via Codex** — ChatGPT subscription rejects `gpt-4o-mini`, `o4-mini`, etc. Use `gpt-5.5` only.
- **`CODEX_ACCESS_TOKEN` env var is for agent identity JWTs** — not the ChatGPT OAuth token. Don't attempt env-var auth.
- **Tool call route naming**: proxy uses `POST /complete`, NOT `/v1/chat/completions` — avoids confusion with Firecrawl's own `/v0/`, `/v1/`, `/v2/` API versioning.
- **`knip` must pass before commit** — never use `--no-verify`. Fix unused exports/files before committing.
