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
