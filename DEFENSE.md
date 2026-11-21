# Defence notes

<!-- DRAFT written with the agent from the project's facts. Rewrite every section in your own
     words before the defence: the committee asks whether the system is yours. -->

## What it does

Students at TU Sofia build their own weekly plan from their faculty's timetable: they import it from the faculty page or a photo (a local model reads it, they review and publish it), pick their group and, per subject, which group's sessions they attend, write their work hours, and see every class in a week calendar marked "can attend", "needs time off" or "email the teacher". They can share a plan read-only; an admin sees every plan.

Demo: sign up, new plan from the sample timetable, group 222, move the УП lab to 221а, add "Работя от 9:00 до 16:30 в делничните дни", show the colours in week 4, add "Отменено" to a class, share with a second account, and open the same plan as a stranger (403).

## The three files I will open

1. `src/services/access.ts`, because it is the one place that decides who may read or change a plan: owner or admin may change, a reader may only read, anyone else gets 403, nobody signed in 401. Every plan, class, note and import goes through it.
2. `src/services/plans.ts`, because it shows the boundary between layers and the model: the chat answer is structured output, checked against a zod schema and against the timetable (`applyChanges`) before `applyModelAnswer` saves it, all or nothing. It knows nothing about HTTP.
3. `mcp-server/server.ts`, because the second front door calls the same services as the routes (`getWeek`, `searchClasses`, `addNote`), acts as one student through `MCP_TOKEN`, and contains no SQL.

## Decisions I can defend

- Stack: Next.js App Router with TypeScript as one server-rendered app on Node 22, PostgreSQL through plain `pg`, Vitest. One codebase for pages and the REST API, deployable as one Docker container on Render. I rejected a separate SPA plus API because it doubles the deploy and the auth. A need for real-time collaboration would change my mind.
- Where the rules live: in `src/services/`, one file per area, each function taking the actor first and checking permissions itself; routes only read the request and map `AppError` to a status; only `src/data/` writes SQL. Hiding a button is never the check: the tests call services and routes directly.
- Authentication and authorization: Better Auth for email and password (scrypt) and Google (state and PKCE, matched on `sub`, linking only while signed in with a verified email). Roles are only `student` and `admin`; per plan there is an owner and read-only readers. I removed a "publisher" role because every student owns their timetable.
- The model, and why that one: Qwen through Ollama on my laptop, because it reads text and images and no timetable or personal instruction leaves my machine. It is called only from the worker, never in a request; every answer must match a JSON schema and is re-checked against real data; with no model a plain parser keeps the labels working and the page says the model is off.
- What the MCP server exposes, and what it deliberately does not: `get_my_week`, `search_classes`, `add_class_note` (plus the two Exercise 1 tools). It acts as one student, refuses an admin token, and cannot import, delete, share or change roles.
- The database shape: `plans` own everything (`entries` with `entry_groups`, `notes`, `imports`, `plan_sources`, `plan_messages`, `plan_shares`); subject choices are a small JSON map on the plan; migrations are numbered files applied once each in a transaction.

## How I know it works

- 160+ tests: every acceptance criterion in SPEC.md has a test whose title names it (the traceability table); service tests use an in-memory fake data layer, API tests send real `Request` objects through the route handlers, the model is a fake client (good, nonsense, timeout, no model).
- Coverage: 100% of `src/services`, about 91% of `src/`. It does not cover `app/` pages or `mcp-server/`, and the data layer is tested with a fake pool, not real PostgreSQL.
- By hand and with Playwright against the running app: every AC flow, the four UI states, keyboard only, 380 px, contrast, `/health` 503 with the database stopped, the Docker image, and real imports with the local model.

## What is wrong with it

1. The model only runs on my laptop; with it off, imports and chat answers wait.
2. The small model reads the faculty page in about 3 minutes and gets lecture weeks wrong; the review step is necessary.
3. The SQL is not tested against a real database automatically.
4. The Google round trip is not tested automatically.
5. Publishing a new import replaces a plan's classes and their notes.

## The thing in this repository I did not write and cannot explain

The shadcn/ui components in `components/ui/` (generated) and the FullCalendar internals: I can explain how I use them and their props, not their implementation.
