# Usage

One row per agent session. In Gemini CLI, type `/stats` before you quit and copy the input and output tokens. Copilot shows credits instead of tokens: write those in the credits column. The free tier charges nothing, so record what the session **would cost at the provider's published list price**, and note once below the table which price list you used. Leave the cost empty for rows that only show credits.

| Date | Tool | Input tokens | Output tokens | Credits (if no tokens) | List-price cost |
|---|---|---|---|---|---|
| 2026-10-14 | Claude Code (Fable 5.1, high effort) | 39.9k | 46.9k | | $7.08 |
| 2026-10-14 | Gemini CLI | 26,630 | 122 | | $0.01 |
| 2026-10-14 | Gemini CLI | 2,665 | 31 | | $0.00 |

Claude Code ran on the paid Max plan with Fable 5.1 at high effort; the plan is a flat subscription, and the cost shown is the API list price Claude Code reports for the session. Gemini CLI ran on a free API key, so nothing was charged; its cost is an estimate at Gemini Flash list price. The third row is a session where the model requests failed and no tool was called.
