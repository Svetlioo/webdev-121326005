# Agent log

One entry per agent session, newest at the bottom. Be honest: what went wrong is the useful part.

## 2026-10-14 · Claude Code, writing the MCP server
- Goal: understand the MCP handshake and get server.js to pass check.mjs
- Delegated: explanations of readline, stderr vs stdout, initialize, tools/list, isError vs error codes
- Checkpoints: I ran check.mjs after steps 2, 3, 5 and 6 (3/8, 9/12, 12/12)
- Went wrong: nothing
- Changed by hand: all of server.js, the tools list with list_lectures, the descriptions

## 2026-10-14 · Gemini CLI, run 1 with the real description
- Goal: have a real agent list and call my tools
- Delegated: one question, "what does lecture 7 cover"
- Checkpoints: /mcp showed my-project ready with 2 tools; Gemini called find_lecture(number: 7)
- Went wrong: Google sign-in is no longer supported for personal accounts, used a free API key instead
- Changed by hand: nothing

## 2026-10-14 · Gemini CLI, run 2 with a vague description
- Goal: the description experiment
- Delegated: the same question
- Checkpoints: Gemini still called find_lecture(number: 7)
- Went wrong: nothing
- Changed by hand: line 17 of server.js, then restored it


## 2026-11-11 · Claude Code, Exercise 3 (week view, MCP tools, model import)
- Goal: finish Exercise 3, kept as small as the checks and the spec allow
- Plan I approved: commit Slice 1 in small steps; numbered migrations; week view (AC-1, 2, 7, 12, 13); MCP tools on the services with MCP_TOKEN through Better Auth (AC-14); the model import with a worker, timeout and fallback (AC-3, 4, 5, 10); architecture note
- Delegated: all code and tests; after each step a separate review agent read the diff, and its findings were fixed before the commit
- Checkpoints: `npm test` and coverage after every step; `node mcp-server/check.mjs` 12/12; Playwright scripts against the running app (week view 13/13, imports 12/12 with a fake Ollama); `node checks/ex3.mjs` 18/18
- Decided by me: dropped AC-6, AC-8, AC-9 and AC-11 from the acceptance criteria (moved to "later" in SPEC.md), keeping 14
- Went wrong: the worker used top-level await and crashed under tsx (CommonJS); only the Playwright run caught it, the unit tests could not. The first review of the MCP server found that one bad input line killed the server and that the user was looked up only once. Both were fixed.
- Not checked: the real Qwen model on a real photo or page (Ollama was not running)
- Changed by hand: nothing yet

## 2026-11-11 – 2026-11-21 · Claude Code, from Exercise 3 to Exercise 4
- Goal: finish Exercise 3, reshape the product to per-student plans, then the Exercise 4 code and documents
- Autonomy: the agent worked alone within one step; I chose the scope at each step (trim ACs, roles, per-subject groups, free rooms removed) and read the summary before each commit
- Checkpoints used: `npm test` and coverage before every commit, a review agent after every step, Playwright runs against the app, the self-checks
- Plan (in steps, each committed): Google sign-in; API tests; FullCalendar week view; my plans (sources, chat, labels, sharing, admin); timetable per plan and roles student/admin; groups, then my group + per-subject choice; chat changes instructions and subjects; Exercise 4 (`/health`, env check, 404, Dockerfile, UI evidence, READINESS)
- Changed in review: the review agents found a worker overwriting newer changes (now saved only while `processing`), a page cut that dropped the whole timetable when a menu tab said "Списъчен състав", an admin MCP token reaching every plan (now refused), a missing keyboard order in the new-plan form, and stale spec rows
- Went wrong: the worker crashed on top-level await (CommonJS); the first real import read only one class (the page cut); the 4B model needs about 3 minutes for the faculty page and times out at 120 s (the thinking variant ignores `think: false`; fixed by switching to `qwen3.8:27b-mlx` without thinking, about 20 s, 19/19)
- Changed by hand: I tested every screen myself and changed what was wrong: "free rooms" made no sense for a student, the instructions and the chat were two places to write, the import needed both a link and a photo, and the group should not be chosen when a plan is created
- A false claim the agent made about the deployment: it said a free Gemini key works with `gemini-2.5-flash`. On the live site the first import failed with "Моделът не е достъпен"; a direct call showed Google answers 404 for that model to new keys. The default is now `gemini-3.8-flash`, which Google listed for the key (at that moment it answered 503 "high demand", so the laptop's model read the import instead)

## 2026-11-21 · Claude Code, model, security fixes, chat UI, runbook
- Goal: make the model usable in the demo (at most a minute), a backup when the laptop is off, Exercise 5's security fixes, and an interface a student understands without help
- Decided by me: Qwen3.8-27B without thinking as the main model; Gemini 2.5 Flash as the backup, accepting that the data then goes to Google; the chat is the only place to write; skipping one class ("Не ходя") from the calendar and from the chat; a plan that is not yours is 404, not 403
- Delegated: all code and tests; a review agent after each step; Playwright runs against the app; real runs with the 27B model
- Checkpoints: `npm test` (184), coverage gates, `checks/ex2–ex5`, MCP check, `docker build`, CI green on PR #1
- Changed in review: the parser read "Вече не работя в петък" as busy all of Friday, counted "до 10. седмица" and "до 20 минути" as times, and kept re-reading old chat messages so × did not remove a busy time; the page stopped polling after 2 minutes while Gemini could still answer; all fixed with tests
- Went wrong: the worker kept running old code after a change, so the first real test of week notes saved nothing (restarting it fixed it); the model answers `"instructions": []` when nothing changed, which would have wiped the student's instructions (an empty list now means "no change")
- Not checked: Gemini against the real API (no key yet); the deployed site
- Changed by hand: from my own testing I changed: the week arrows not to jump to the top, notes that can be removed and show in the calendar, the uploaded photo to be visible, an import to show it came from a link, a photo and instructions, a link to any page instead of TU Sofia only, groups as any letters and digits, and a 404 instead of "not shared with you"

## 2026-11-24 – 2026-11-25 · Claude Code, deploy to Render and Neon
- Goal: the live site, the keys, and the Exercise 4 evidence
- Done: merged the project, Neon database (Frankfurt) with the six migrations, Render web service (Docker, Frankfurt, free), Gemini and Google keys, live URL in `course.json`, me as admin, the live checks (200/400/401/403/404, 503, rollback)
- Changed on the way: the "Свържи Google" button now hides when the account already has Google; a failed import cannot be retried while another one is being read; on the review screen a class can be changed or added by hand; `npm run live:start` / `live:stop` run the laptop's model for the live site
- Went wrong: the first deploy stopped because `BETTER_AUTH_SECRET` was missing (the start-up check named it); Gemini 2.5 Flash is gone for new keys (see the false claim above); the Neon connection string was pasted without quotes once, so the shell cut it at "&"

## What the agent did that I did not ask for
- `test/fakes.ts`, an in-memory data layer so the service tests run without PostgreSQL
- the `MODEL_THINK` setting, after it found that the 4B model ignored `think: false`
- `instrumentation.ts`, which starts the Gemini worker inside the website and checks the environment at start-up
- standalone Next.js output in the Dockerfile, and the 44-pixel touch targets in the CSS
- renamed the confusing test account `publisher@test.bg` to `stranger@test.bg`, and retook the `docs/ui` screenshots
- `docs/RUNBOOK.md`, with diagrams, a demo script and where each exercise requirement is covered
- left the database stopped once, when a screenshot script crashed halfway; it noticed and started it again
