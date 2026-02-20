# Project Guidelines

## Code Style

- TypeScript + React (Next.js **pages** router). Keep changes consistent with existing patterns in [pages/index.tsx](pages/index.tsx) and [components/Chat/Chat.tsx](components/Chat/Chat.tsx).
- Formatting is Prettier-driven (single quotes, trailing commas, Tailwind class sorting) via [prettier.config.js](prettier.config.js). Prefer running `npm run format` after non-trivial edits.
- Tailwind CSS is used for styling; see [tailwind.config.js](tailwind.config.js). Avoid introducing new styling approaches.

## Architecture

- UI state + persistence orchestration lives in [pages/index.tsx](pages/index.tsx); presentational chat UI is in [components/Chat](components/Chat).
- Server/API boundary is via Next API routes under [pages/api](pages/api):
  - Streaming chat (Edge runtime) in [pages/api/chat.ts](pages/api/chat.ts)
  - Model list (Edge runtime) in [pages/api/models.ts](pages/api/models.ts)
  - Token/cost (Edge runtime) in [pages/api/cost.ts](pages/api/cost.ts)
  - Google search plugin (Node runtime) in [pages/api/google.ts](pages/api/google.ts)
  - Usage persistence (Node runtime) in [pages/api/usage.ts](pages/api/usage.ts)
- Server-only utilities are in [utils/server](utils/server). Do **not** import these into client components (they rely on `process.env`, Edge/Node runtime behavior, and optional Cosmos).
- Conversations/prompts/folders are persisted in `localStorage` (no DB) via helpers in [utils/app](utils/app) and schema in [types/storage.ts](types/storage.ts).

## Build and Test

- Install: `npm ci` (or `npm install`)
- Dev server: `npm run dev`
- Production build: `npm run build` (then `npm run start`)
- Lint: `npm run lint`
- Format: `npm run format`
- Tests: `npm test` (Vitest watch mode; press `q` to quit) / One-shot: `npm run coverage` (Vitest run)
- Docker (Makefile): `make build`, `make run`, `make logs` (reads env vars from `.env`; see [Makefile](Makefile))

## Project Conventions

- Models are configured by `LLM_MODELS_JSON` (required). It is parsed/validated in [utils/server/llmModels.ts](utils/server/llmModels.ts) and surfaced to the UI via [pages/api/models.ts](pages/api/models.ts). `DEFAULT_MODEL` is optional and must match a configured model id.
- Provider routing:
  - `provider: "anthropic"` (or an endpoint containing `/anthropic/v1`) uses Anthropic Messages streaming in [utils/server/index.ts](utils/server/index.ts).
  - Otherwise the model config is treated as OpenAI-compatible Chat Completions and sent to the configured `endpoint`.
- API key precedence for chat: the UI-supplied key (`ChatBody.key`) overrides the per-model `apiKey`; see [utils/server/index.ts](utils/server/index.ts).
- `NEXT_PUBLIC_DEFAULT_SYSTEM_PROMPT` controls the default system prompt in [utils/app/const.ts](utils/app/const.ts). The Docker image uses a placeholder replacement at runtime in [dockerScripts/entrypoint.sh](dockerScripts/entrypoint.sh).
- Note: [docker-compose.yml](docker-compose.yml) and [k8s/chatbot-ui.yaml](k8s/chatbot-ui.yaml) currently only set `OPENAI_API_KEY`, but the chat UI requires `LLM_MODELS_JSON` for model listing and routing.

## Integration Points

- Optional Cosmos DB logging/persistence is implemented in [steffes-packages/chat-logger/index.ts](steffes-packages/chat-logger/index.ts) and used by [pages/api/chat.ts](pages/api/chat.ts) and [pages/api/usage.ts](pages/api/usage.ts). It is best-effort (UI should not break if Cosmos is unavailable). Env vars: `COSMOS_ENDPOINT`, `COSMOS_KEY` (required), `COSMOS_DATABASE_ID`, `COSMOS_CONTAINER_ID` (optional).
- Google Search plugin requires `GOOGLE_API_KEY` + `GOOGLE_CSE_ID` (or client-provided equivalents) and runs through [pages/api/google.ts](pages/api/google.ts). The LLM call in that route uses `OPENAI_API_KEY`/`OPENAI_API_HOST` (see [utils/app/const.ts](utils/app/const.ts)).
- i18n uses next-i18next config in [next-i18next.config.js](next-i18next.config.js) and locale files under [public/locales](public/locales).

## Security

- The UI can store API keys in `localStorage` (LLM key and Google plugin keys). Avoid adding logs that might capture keys or full prompts/responses.
- There is no strict auth gate; identity is best-effort from `x-ms-client-principal-*` headers in [utils/server/identity.ts](utils/server/identity.ts) and is used for attribution in [pages/api/usage.ts](pages/api/usage.ts).
- Keep secrets on the server: avoid moving `process.env` access into client code; prefer routing through API routes.
