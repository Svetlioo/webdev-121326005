# Defence notes

## What it does

ТУ Програма lets a TU Sofia student build their own weekly plan from a timetable. I import the timetable from a link to any web page, from a photo, or both; a model reads it, I review the draft and publish it. Then I pick my group and, for every subject, which group's sessions I attend or that I don't take it. In a chat I tell the model when I'm busy ("Работя от 9:00 до 16:30 в делничните дни") and what changes in a given week ("В 6. седмица не ходя на КЗ упражнението"). The week calendar marks every class "Може да присъства", "Трябва отпуска" or "Пишете на преподавателя". I can share a plan read-only by e-mail; an admin sees and changes every plan.

Demo: sign in, new plan from the sample timetable, group 222, move the УП lab to 221а, write my work hours in the chat and show the colours, write "В 6. седмица не ходя на КЗ упражнението" and show week 6, add "Отменено" to a class, share with a second account, open the same plan as a stranger (404), then ask Claude through the MCP server what I have in week 3.

## The three files I will open

1. `src/services/access.ts`, because it is the one place that decides who may read or change a plan: the owner or an admin may change it, a reader may only read it (403 for a change), for anyone else the plan does not exist (404, the same answer as a wrong id, so ids reveal nothing), and nobody signed in gets 401. Every plan, class, note and import goes through it.
2. `src/services/plans.ts`, because it shows the boundary between my code and the model: the chat answer is structured output, checked against a zod schema and then against the real timetable (does the group have that subject, does the plan have that class in that week) before `applyModelAnswer` saves it, all or nothing. It knows nothing about HTTP.
3. `mcp-server/server.ts`, because the second front door calls the same services as the routes (`getWeek`, `searchClasses`, `addNote`), acts as one student through `MCP_TOKEN`, refuses an admin token, and contains no SQL.

## Decisions I can defend

- Stack: Next.js App Router with TypeScript as one server-rendered app on Node 22, PostgreSQL through plain `pg`, Vitest. One codebase for the pages and the REST API, deployed as one Docker container on Render with the database on Neon. I rejected a separate SPA plus API because it doubles the deploy and the auth. A need for real-time collaboration would change my mind.
- Where the rules live: in `src/services/`, one file per area; every function takes the actor first and checks permissions itself; routes only read the request and turn an `AppError` into a status; only `src/data/` writes SQL. Hiding a button is never the check: the tests call the services and the routes directly.
- Authentication and authorization: Better Auth for e-mail and password (scrypt) and Google (state and PKCE, matched on `sub`, linking only while signed in and only with a verified e-mail). Roles are only `student` and `admin`; per plan there is an owner and read-only readers. I dropped a "publisher" role because every student owns their own timetable.
- The model, and why that one: Qwen3.8-27B through Ollama on my laptop, without its thinking step. It reads text and images, reads the faculty page in about 20 seconds with all 19 classes right, and nothing leaves my machine. A smaller 4B model with thinking took about 3 minutes and timed out. Gemini 3.8 Flash is the backup when the laptop is off or busy (it only takes a job that has waited 30 seconds), and the page tells the student that their data then goes to Google. The model is called only from a background worker, never inside a request; every answer must match a JSON schema and is re-checked against real data; with no model a plain parser keeps the busy times approximately right and the page says so.
- Reading a link: the worker downloads any public page with `fetch`, never an address in its own machine or network (it checks the name in DNS and every redirect), and cleans it without depending on the site: no code or menus, table rows kept as lines, and no student list, e-mails, phone numbers or faculty numbers before the text reaches the model.
- What the MCP server exposes, and what it deliberately does not: `get_my_week`, `search_classes`, `add_class_note` (plus the two Exercise 1 tools). It acts as one student, refuses an admin token, and cannot import, delete, share or change roles.
- The database shape: `plans` own everything (`entries` with `entry_groups`, `notes`, `imports`, `plan_sources`, `plan_messages`, `plan_shares`); subject choices are a small JSON map on the plan; photos are stored in PostgreSQL, because Render's disk is wiped on every deploy; migrations are numbered files, each applied once in a transaction.

## How I know it works

- 187 tests: every acceptance criterion in SPEC.md has a test whose title names it (the traceability table). Service tests use an in-memory fake data layer, API tests send real `Request` objects through the route handlers, and the model is a fake client (good answer, nonsense, timeout, no model).
- Coverage: 100% of `src/services` (lines and branches) and about 92% of `src/`; CI fails below 100% / 80%. It does not cover the `app/` pages or `mcp-server/`, and the data layer is tested with a fake pool, not a real PostgreSQL.
- In the browser, by hand and with Playwright: every flow, the four UI states, keyboard only, 380 px, contrast, `/health` 503 with the database stopped, the Docker image, and real imports and chats with the 27B model.
- Security review: four findings fixed as a failing test first and then the fix (R1–R4): which pages may be fetched, request size limits, sharing that does not reveal whether an e-mail is registered, and an MCP log without arguments.

## What is wrong with it

1. With the laptop off, Gemini answers, so the data goes to Google; with neither running, imports and chat answers wait.
2. A link can point anywhere, so names that are not in a student list section can still reach the model; its answer cannot contain names (the schema has none), and I review every draft.
3. The SQL is not tested against a real database automatically.
4. The Google sign-in round trip is not tested automatically.
5. Publishing a new import replaces a plan's classes and their notes.
6. Moving one class to another day or time for one week is only a note ("Преместено в четвъртък"); the box stays where the timetable puts it, and a class cannot be added by hand, only through an import.

## The thing in this repository I did not write and cannot explain

The shadcn/ui components in `components/ui/` (generated) and the FullCalendar internals: I can explain how I use them and their props, not their implementation.
