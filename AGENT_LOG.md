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

