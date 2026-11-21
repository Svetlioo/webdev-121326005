# Instructions for the agent

Read this file at the start of every session. Keep it short and correct; update it when the project changes.

## Project
<!-- One or two sentences: what the app does and for whom. Link SPEC.md. -->
A web app for TU Sofia students: each student keeps their own plans. A plan holds their timetable (imported from the faculty's page and/or a photo by a local model, or copied from a sample), their group and per-subject group choices, personal instructions, and a chat with the model; every class in a week calendar is labelled "can attend", "needs time off" or "email the teacher". Plans can be shared read-only; an admin sees every plan.
See `SPEC.md` for goals, non-goals and acceptance criteria.

## Commands
<!-- How to install, run, test. Keep these exact and working. -->
- Install: `npm install`, then once `cp .env.example .env`
- Run: `npm run db:up && npm run db:setup && npm run dev`, then open http://localhost:3000 (PostgreSQL in Docker on port 5433)
- Google sign-in (optional locally): create an OAuth client (Web application) at console.cloud.google.com, add the redirect URI `http://localhost:3000/api/auth/callback/google` (and the Render one later), and set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`. Without them the app works and "Вход с Google" says it is not set up.
- Make the first admin: `npm run make-admin -- someone@example.com`; after that an admin gives roles on /admin/users
- Import worker (on the laptop, next to Ollama): `npm run worker`
- Test: `npm test`
- Coverage: `npm run coverage`
- MCP server: `npm run mcp`
- MCP token: sign in with `curl -X POST http://localhost:3000/api/auth/sign-in/email -H 'content-type: application/json' -H 'origin: http://localhost:3000' -d '{"email":"...","password":"..."}'` and put the `token` from the answer in `.env` as `MCP_TOKEN`. It expires with the session (7 days).

## Conventions
<!-- Folder layout, naming, where business rules live, how errors are returned to the client. -->
- Stack: Next.js (App Router) + TypeScript on Node 22, PostgreSQL through `pg`, Vitest. One server-rendered app, never a static export.
- Folders:
  - `app/` pages (React). `app/api/**/route.ts` is the HTTP layer.
  - `src/services/` business rules, one file per area (`schedule.ts`, ...).
  - `src/data/` the only place that writes SQL, one file per table group.
  - `src/auth.ts` the Better Auth configuration. Better Auth writes its own tables (`user`, `session`, `account`, `verification`): the one exception to "only `src/data/` writes SQL".
  - `src/model/` the model client (`client.ts`) and the only file that names the provider (`ollama.ts`), with the fallback for no model.
  - `src/worker/` the background import job. It calls `processNextImport` in `src/services/imports.ts` and `processNextPlan` in `src/services/plans.ts`, the service functions with no actor: the plan's owner was checked when the job was queued.
  - `db/migrations/NNN_name.sql` the tables, one numbered file per change, applied once each by `npm run db:setup`. Never edit one that has run: add a new file. `db/seed/` seed data.
  - `test/` Vitest tests, mirroring `src/`.
- Naming: files in kebab-case, functions and variables in camelCase, tables plural and columns in snake_case.
- Every service function takes the acting user (`actor`, or `null` for nobody signed in) as its first argument, and checks permissions itself. Deny by default: an action is allowed only if a rule says so. Hiding a button in the UI is not a permission check.
- Services throw `AppError(status, message)` from `src/services/errors.ts`. Route handlers turn it into that status with `errorResponse` from `app/session.ts`.
- Errors reach the client as JSON `{ "error": "..." }`, a sentence in Bulgarian that a person can read. Never a stack trace or a raw database error.
- The UI is in Bulgarian. Code, identifiers and comments are in English.
- Never import or store the student lists ("Списъчен състав") from faculty pages, and never put personal data in seed data or tests.

## Layers
<!-- Fill in the file or folder for each layer. -->
Requests arrive two ways and both end in the same place:

- HTTP route handler → service → data access → database
- MCP tool → **the same service** → data access → database

A route handler reads the request and turns a result into a status code. A service holds the
rules and knows nothing about HTTP or about MCP. Only the data layer writes SQL. An MCP tool
that talks to the database directly is a second, unguarded way into your data: never add one.

- Route handlers: `app/api/**/route.ts`. Server Components in `app/` may call services directly, never `src/data/`.
- Services: `src/services/`
- Data access: `src/data/`
- Database: PostgreSQL (Docker locally, Neon in production), schema in `db/migrations/`
- MCP tools: `mcp-server/`, calling `src/services/`

## The model feature
<!-- Provider, env var, and the call site. -->
- The providers are named in two files only: `src/model/ollama.ts` (local, on the laptop) and `src/model/gemini.ts` (the hosted backup). Everything else depends on the `ModelClient` interface in `src/model/client.ts`; the prompts are in `src/model/prompts.ts`.
- The model is local (Ollama, `qwen3.8:27b-mlx`, no key), configured by `OLLAMA_URL`, `MODEL_NAME`, `MODEL_TIMEOUT_MS` and `MODEL_THINK`; the laptop's worker (`npm run worker`) uses it. With `GEMINI_API_KEY` set (on Render), the website runs a backup worker with Gemini (`GEMINI_MODEL`, default `gemini-2.5-flash`) that answers only jobs that waited 30 s. Sending data to Gemini is the user-approved exception to "no third-party model".
- Every call has a timeout and a deterministic fallback, so the app still works when the provider is down or rate-limited.
- The model's output is re-checked against real data before anything is saved or shown.
- Model calls (imports and plans) run only in the worker (`src/worker/`), never inside an HTTP request.
- Tests never call the provider: they pass in a fake client.

## The MCP server
<!-- Where it lives and how it authenticates. -->
- Lives in `mcp-server/server.ts` (run with `tsx`), grew out of Exercise 1. `handle(message, actor)` is exported so tests call it directly.
- Every tool calls a service function; none touches the data layer or the database directly.
- It carries a user, and enforces exactly the same authorization rules as the HTTP API. It signs in with `MCP_TOKEN`, a Better Auth session token read through the `bearer` plugin (`actorFromToken` in `src/auth.ts`), so it belongs to one user and grants exactly what that user may do.
- Adding a tool means adding a row to the table in `SPEC.md` too.

## Tests and coverage
- Every acceptance criterion in `SPEC.md` has an id like `AC-3`, and a test whose title contains that id.
- The coverage gate runs in CI: 100% of the service layer, 80% overall.
- A test is evidence. Changing a test so the code passes destroys the evidence.

## Always ask before
- deleting files or folders
- editing a migration that has already run
- installing or removing dependencies
- pushing, tagging or changing CI
- anything that touches secrets or `.env`
- changing an authentication or authorization rule
- adding, renaming or removing an MCP tool
- changing a coverage threshold
- sending user data to a third-party model

## Never
- commit secrets, passwords, API keys or an OAuth client secret
- weaken or delete a test to make it pass
- lower a coverage threshold or switch off a CI job to make the build green
- add an MCP tool that reaches past the service layer
- log a prompt that contains somebody's personal data

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
