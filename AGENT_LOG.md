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

## 2026-11-11 – 2026-11-21 · Claude Code, from Exercise 3 to Exercise 4 (DRAFT: rewrite in your own words)
- Goal: finish Exercise 3, reshape the product to per-student plans, then the Exercise 4 code and documents
- Autonomy: the agent worked alone within one step; I chose the scope at each step (trim ACs, roles, per-subject groups, free rooms removed) and read the summary before each commit
- Checkpoints used: `npm test` and coverage before every commit, a review agent after every step, Playwright runs against the app, the self-checks
- Plan (in steps, each committed): Google sign-in; API tests; FullCalendar week view; my plans (sources, chat, labels, sharing, admin); timetable per plan and roles student/admin; groups, then my group + per-subject choice; chat changes instructions and subjects; Exercise 4 (`/health`, env check, 404, Dockerfile, UI evidence, READINESS)
- Changed in review: the review agents found a worker overwriting newer changes (now saved only while `processing`), a page cut that dropped the whole timetable when a menu tab said "Списъчен състав", an admin MCP token reaching every plan (now refused), a missing keyboard order in the new-plan form, and stale spec rows
- Went wrong: the worker crashed on top-level await (CommonJS); the first real import read only one class (the page cut); the 4B model needs about 3 minutes for the faculty page and times out at 120 s
- Changed by hand: (fill in)

## What the agent did that I did not ask for
- (fill in after reading `git diff --stat 0a2a0a9 HEAD`) e.g. a `test/fakes.ts` in-memory data layer, the `MODEL_THINK` setting, `instrumentation.ts`, standalone Next output in the Dockerfile, the touch-target CSS
