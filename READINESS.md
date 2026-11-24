# Readiness

What is true about the deployed app, how I checked each claim, and what is still weak.

## Live URL

- URL: https://tu-programa.onrender.com (also in `course.json` as `liveUrl`). Render, Docker, Frankfurt, free plan; database on Neon (Frankfurt).
- How to verify: `curl -i https://tu-programa.onrender.com/health` answers `200 {"status":"ok","db":"ok"}`; opening https://tu-programa.onrender.com redirects to `/signin`; sign up, create a plan from the sample timetable, choose group 222 and see the week calendar.
- How I checked (live, 2026-11-25), with `curl` against https://tu-programa.onrender.com and three test accounts (an owner, a reader the plan is shared with, a stranger):
  - `GET /health` → **200** `{"status":"ok","db":"ok"}`; `node checks/ex4.mjs` → the live URL and `/health` checks pass
  - `POST /api/plans` with broken JSON → **400** "Името трябва да е между 1 и 100 знака."
  - `POST /api/plans` signed out → **401** "Влезте в профила си."
  - `DELETE /api/plans/2` as the stranger → **404** "Програмата не е намерена."
  - `DELETE /api/plans/2` as the reader → **403** "Само собственикът може да променя тази програма."
  - the plan is still there afterwards (the owner opens `/plans/2`, 200)
- Database down on Render: I set a wrong `DATABASE_URL` and redeployed; `/health` answered **503** `{"status":"error","db":"down"}`; I put the right value back and it answered 200 again.
- Rollback: in Render → Events I rolled back to an earlier live deploy; the site came up with that version and the plans were still there; then "Deploy latest commit" brought the current one back.
- Data survives redeploys: the plans and the imported timetable stayed through every deploy of the day (five merges, the 503 test and the rollback), because they live in Neon, not in the container.
- The first deploy did not start: the start-up check named the missing variable ("Missing environment variables: BETTER_AUTH_SECRET"), which I then added.

## Environment variables

| Variable | Required | Where it is set | What it does |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | Render (Neon connection string), `.env` locally | PostgreSQL connection |
| `BETTER_AUTH_SECRET` | yes | Render, `.env` | signs session cookies; a long random string |
| `BETTER_AUTH_URL` | yes | Render (`https://<service>.onrender.com`), `.env` | the app's public address for Better Auth |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | no | Render, `.env` | Google sign-in; without them the button says it is not set up |
| `OLLAMA_URL` | no | only the laptop's `.env`; **empty on Render** | the local model; empty means "no model" |
| `MODEL_NAME`, `MODEL_TIMEOUT_MS`, `MODEL_THINK` | no | the laptop | which model, its timeout, whether it reasons first |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | no | Render only | the backup model (Gemini 3.8 Flash) when the laptop is off |
| `MCP_TOKEN` | no | the laptop | a student's session token for the MCP server |

- How I checked: `instrumentation.ts` calls `checkEnv` from `src/env.ts` at start; running the image with only `DATABASE_URL` stops with "Missing environment variables: BETTER_AUTH_SECRET, BETTER_AUTH_URL". `.env` is in `.gitignore`; `git log --all -- .env` is empty.

## What happens when things fail

- Database down: `/health` answers `503 {"status":"error","db":"down"}` and the plan pages show "Програмата не може да се зареди" (the admin page "Страницата не може да се зареди") with a retry button. How I checked: I stopped the database container and opened a plan and `/health` (screenshot `docs/ui/error.png`).
- Laptop off: after 30 s the backup worker answers imports and chat with Gemini. With no Gemini key, or Gemini rate-limited too, the site keeps working: busy times come from the plain parser ("Приблизително, без AI"), jobs wait or fail with a reason, and after two minutes the page says "Моделът е изключен в момента". How I checked: no worker running, sent a chat message and waited.
- Model too slow: after `MODEL_TIMEOUT_MS` the import is `failed` with "Моделът не отговори навреме…" and a retry. How I checked: test `AC-4` and a real run with `qwen3-vl:4b` that timed out at 120 s.
- A missing variable: the server does not start and names it (above).
- Broken input: malformed JSON or an empty field gives a 400 with a Bulgarian sentence, never a stack trace. How I checked: `test/api/routes.test.ts` sends `null` and empty bodies through the real route handlers.

## The four states of one screen

The plan page (`app/plans/[id]/page.tsx`): loading (`app/plans/loading.tsx` skeleton), empty ("Програмата още няма разписание…" / "Изберете групата си…"), error (`app/plans/error.tsx`), success (the class crossed out right after a note). How I checked: Playwright screenshots in `docs/ui/` (loading, empty, error, success).

## The request waterfall

- Opening a plan is one server-rendered HTML request: the page reads the plan, its timetable and notes from the database on the server and sends finished HTML; the calendar script then draws in the browser. There is no client-side fetch chain.
- Chat and imports do not wait for the model in the request: the POST returns at once (201) and the page refreshes every 3 s for at most two minutes.
- How I checked: locally the dev server logged `GET /health 200 in 46ms` and the plan page around 100–200 ms; the measurement on Render (cold start after sleeping on the free plan is the slow part, about 30–60 s) is to be done after the deploy.

## Security basics

- Passwords hashed with scrypt by Better Auth; sessions in `HttpOnly`, `SameSite=Lax` cookies, `Secure` in production.
- Every service function checks the actor itself (deny by default): a reader who tries to change a plan gets 403, for a stranger the plan does not exist (404, so ids reveal nothing), nobody signed in 401. How I checked: tests `AC-10`, `AC-18`, `AC-19`, `AC-20`, `AC-21` (service and API) and curl against the running app.
- No SQL outside `src/data/`, every query parameterised (`$1`); the MCP server calls services only and refuses an admin token.
- Uploaded photos: only PNG/JPEG/WebP, at most 10 MB, served with their type and `nosniff`.
- Timetable links (any public page): the worker refuses addresses in its own machine or network (localhost, private and link-local ranges, `.local` names, and names whose DNS points there), checks every redirect again (at most 3), and reads at most 2 MB of HTML or text in 20 seconds. How I checked: `test/services/imports.test.ts` (R1 tests) and real fetches of cs.fcst.bg, tu-sofia.bg (http → https redirect), Wikipedia and example.com; localhost, 127.0.0.1, 192.168.1.1, 169.254.169.254, [::1] and an image URL were refused.
- No secrets in the repository: `.env` ignored, `.env.example` has placeholders only.

## Known gaps, ranked by risk

1. When the laptop is off or busy, jobs go to Gemini, so the timetable, instructions, photos and chat leave the app for Google (free tier: may be used for training). Without the laptop and without Gemini (no key, or rate-limited) imports and chat answers wait.
2. A real import depends on the model: `qwen3.8:27b-mlx` (the one I use) took about 20 s and got all 19 classes right; the lighter `qwen3-vl:4b-instruct` got 16 of 19. A photo or another faculty's layout may still be read wrongly, so the student reviews the draft before "Публикувай".
3. Data-layer tests use a fake pool, so the SQL is checked by hand and by the browser runs, not by automated tests against PostgreSQL.
4. The Google sign-in round trip is not tested automatically (only up to the redirect with state and PKCE).
5. Publishing a new import replaces a plan's classes and their notes; there are no versions.
6. A link can point anywhere public, so the page's text may hold names the cleaner does not recognise (it drops a student list section, e-mails, phones and faculty numbers, not every name). With the laptop's model that text stays on the laptop; with Gemini it goes to Google. The model's answer cannot carry names (its schema has none), and the student reviews the draft.

## The model feature in production

- Data that leaves the app: for a job the laptop answers, none: the worker reads jobs from Neon and calls Ollama on `localhost`. When the laptop is off or busy, the website's backup worker sends a job that has waited 30 s to Google's Gemini API: the timetable text or photo, and for a plan the personal instructions, photos and chat. On the free tier Google may use that data to improve its products; the plan page tells the student.
- Cost: $0 per call with the local model. Gemini 3.8 Flash on the free tier is $0 within its daily limits (a 429 marks the job failed); on the paid tier one import (about 1,700 input and 2,000 output tokens) is well under one cent at Google's list price. One import of the faculty page is about 1,700 prompt tokens and 2,000 output tokens, about 20 s on the laptop with `qwen3.8:27b-mlx`.
- When it is down or slow: 120 s timeout per call, the job is `failed` with a readable reason, the parser fallback keeps the labels working, and the page says when the model is off. Answers are checked against a JSON schema and real data before they are saved.
- How I checked: tests with a fake client (good answer, nonsense answer, timeout, no model) and a real import of https://cs.fcst.bg/page.php?id=89 with `qwen3.8:27b-mlx`, compared class by class with the sample timetable (19/19 fully right in 20 s).

## The MCP server in production

- Not deployed: it is a stdio server started on the laptop (`npm run mcp`) by an agent such as Claude Code.
- Who may call it: whoever holds `MCP_TOKEN`, a Better Auth session token of one student. Each tool acts as that student, through the same services as the website: their own plans and plans shared with them; an admin's token is refused.
- How I checked: `node mcp-server/check.mjs -- npm run --silent mcp` passes 12/12; tests `AC-14` and the admin-token test in `test/mcp-server.test.ts`.
