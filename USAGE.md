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
| 2026-11-11 – 2026-11-21 | Claude Code (Opus 5.5), Exercises 3–5 and the project, with its subagents | 315.9M (312.8M cache reads, 3.1M cache writes, 7.0k uncached) | 881.0k | | $101.75 |
| 2026-11-11 – 2026-11-21 | Claude Code (Haiku 5.5), the same session's small helper calls | 248.1k (51.7k cache reads, 70.3k cache writes, 126.1k uncached) | 38.4k | | $0.04 |

Claude Code ran on the paid Max plan with Fable 5.1 at high effort; the plan is a flat subscription, and the cost shown is the API list price Claude Code reports for the session. Gemini CLI ran on a free API key, so nothing was charged; its cost is an estimate at Gemini Flash list price. The third row is a session where the model requests failed and no tool was called.

The two 2026-11-11 – 2026-11-21 rows are copied from Claude Code's `/usage` screen for that session (7 h 36 min wall time, 2 h 25 min of API time, 5,590 lines added, 520 removed; it includes the subagents). The 2026-10-28 rows are summed from Claude Code's session logs (`~/.claude/projects/<this project>/*.jsonl`, the `usage` of every request, each request counted once). Claude Code ran on the paid Max plan, so nothing was charged per token; the cost is the Anthropic API list price for Claude Opus 5.5: $4 per million input tokens, $5 for cache writes, $0.20 for cache reads, $20 for output. Almost all input is cache reads, because Claude Code sends the whole conversation again on every step. The local Ollama sessions cost nothing but electricity.
