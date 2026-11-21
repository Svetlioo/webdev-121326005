# Usage

One row per agent session. In Gemini CLI, type `/stats` before you quit and copy the input and output tokens. Copilot shows credits instead of tokens: write those in the credits column. The free tier charges nothing, so record what the session **would cost at the provider's published list price**, and note once below the table which price list you used. Leave the cost empty for rows that only show credits.

| Date | Tool | Input tokens | Output tokens | Credits (if no tokens) | List-price cost |
|---|---|---|---|---|---|
| 2026-10-14 | Claude Code (Fable 5.1, high effort) | 39.9k | 46.9k | | $7.08 |
| 2026-10-14 | Gemini CLI | 26,630 | 122 | | $0.01 |
| 2026-10-14 | Gemini CLI | 2,665 | 31 | | $0.00 |
| 2026-10-28 | Claude Code (Opus 5.5), the project idea and plan | 40.72M (40.10M of them cache reads, 0.62M cache writes) | 181.1k | | $14.75 |
| 2026-10-28 | Claude Code on the local Ollama model (qwen3.8:27b-mlx), trial | 2.09M | 975 | | $0 (local) |
| 2026-10-28 | Claude Code on the local Ollama model (qwen3.8:27b-mlx), second trial | 117.8k | 0 | | $0 (local) |
| 2026-11-11 | Claude Code (Opus 5.5), Exercise 3 and the plans redesign | 155.84M (155.09M cache reads, 0.75M cache writes) | 468.6k | | $44.13 |
| 2026-11-21 | Claude Code (Opus 5.5), Exercise 4, security fixes R1–R4, the model, the chat UI, the runbook | 132.09M (130.88M cache reads, 1.21M cache writes) | 245.2k | | $37.11 |
| 2026-11-11 – 2026-11-21 | Claude Code review and research subagents (16; Opus 5.5, 5 requests on Haiku 5.5) | 13.34M (12.20M cache reads, 1.13M cache writes) | 156.6k | | $11.24 |

Claude Code ran on the paid Max plan with Fable 5.1 at high effort; the plan is a flat subscription, and the cost shown is the API list price Claude Code reports for the session. Gemini CLI ran on a free API key, so nothing was charged; its cost is an estimate at Gemini Flash list price. The third row is a session where the model requests failed and no tool was called.

From 2026-10-28 the numbers are summed from Claude Code's own session logs (`~/.claude/projects/<this project>/*.jsonl`, the `usage` of every request, each request counted once), not typed by hand; the 2026-11-21 row stops when this row was written. Claude Code ran on the paid Max plan, so nothing was charged per token; the cost is the Anthropic API list price for Claude Opus 5.5: $4 per million input tokens, $5 for cache writes, $0.20 for cache reads, $20 for output. Almost all input is cache reads, because Claude Code sends the whole conversation again on every step. The subagent row is priced at Opus rates (its 5 Haiku requests cost almost nothing). The local Ollama sessions cost nothing but electricity.
