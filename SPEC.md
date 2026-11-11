# TU Sofia weekly schedule

<!-- Exercise 2. Write the non-goals first. Every acceptance criterion must be checkable in under a minute.
     Keep these headings exactly as they are: the self-checks look for them by name.
     The full target is on the course site under Resources → The course project. -->

## Project option
<!-- One line: lab booking, study groups, club events, or the own project the lecturer approved. -->
Own project, approved by the lecturer on 2026-10-28: a web app that makes the TU Sofia weekly schedule easy to read and search, and turns it into a personal plan for each student.

## Goals
- A student makes their own plan, like a small project: they import their timetable from a photo or a page (the local model reads it, they review and publish it), or start from the sample ФКСТ КСИ timetable, and pick their group.
- The plan shows exactly which classes happen in a given week, when and in which room, with odd and even weeks and each course's start week already applied, as a week calendar.
- The student adds sources (instructions in plain words, such as work hours and meetings, and photos, such as a shift rota) and talks to the model in a chat, and every class is marked "can attend", "needs time off" or "email the teacher". They can add notes to classes, such as "Отменено".
- A student shares a plan read-only with other students, who see it under "Shared with me"; an admin can see and change every plan, and gives roles.
- Anyone who may read a plan can search its timetable by course, room or group, and find the rooms that are free at a given time.

## Non-goals
- No automatic polling of faculty websites: a timetable is read only when a student imports it into their plan.
- No student lists or names from faculty pages: the app imports the timetable only, never the "Списъчен състав" section.
- No emails sent to teachers: the plan marks the classes worth emailing about, and the student writes the email themselves.
- No notifications of any kind (email, push or SMS) when a schedule changes.
- No calendar export or sync (.ics, Google Calendar, Outlook).
- No exam session schedules and no academic calendar, only the weekly schedule.
- No hosted model provider: no schedule, note or personal instruction is sent to a third-party model.

## Constraints
- The model runs only on my laptop (MacBook M5 Max, 64 GB) through Ollama. The deployed app on Render cannot reach it, so the deployed app must work fully without the model.
- Imports that need the model run on my laptop and write to the same Neon database the deployed app reads, so a version published from the laptop is visible on the live site.
- Free tiers only: Render for the web service (it sleeps when idle) and Neon for PostgreSQL.
- The repository is public: no keys or secrets, and no personal data from faculty pages in the code, the seed data or the tests.
- The UI is in Bulgarian, because the schedules and their users are.
- The first schedule supported is the ФКСТ КСИ master's winter 2026/27 schedule (groups 221а, 221б, 222) from https://cs.fcst.bg/page.php?id=89. Other faculties' layouts may need prompt changes.

## The model feature
<!-- Which model, which modality, and what it does for a user.
     Name three things or the check fails: the input it receives, the output it produces,
     and what happens when the model is slow, rate-limited or wrong. -->
- Model: Qwen3.8-27B (https://huggingface.co/Qwen/Qwen3.8-27B), tag `qwen3.8:27b-mlx`, run locally through Ollama on my laptop. Chosen because it reads both text and images, scores 91.1 on OmniDocBench (document reading), fits in 64 GB, and keeps every schedule and personal instruction on my machine.
- Input: for an import, the source of one schedule version (the text of an HTML page, a photo or a rendered PDF page) plus the student's extra instructions. For a plan, the plan's sources (instructions in plain words and photos) and the chat messages.
- Output: for an import, a list of draft classes (course, type, groups, day, start and end time, room, odd/even/every week, start week) as JSON. For a plan, the student's busy time windows (day, from, to, what) and a short reply for the chat, as JSON that must match a schema (structured output, the same for imports). The label of each class ("can attend", "needs time off" or "email the teacher") is computed by the server from those windows, not chosen by the model.
- Data that leaves the app: none. Every model call goes to localhost.
- When it fails: each call has a 120-second timeout and runs in a background job, so nobody waits on a frozen screen. If the model is down, times out or returns something that is not valid JSON, the import is marked `failed` with the reason, and the student can retry. The plan's current classes stay as they were. The server re-checks every draft class against real data (one of the 14 TU Sofia periods, Monday to Saturday, a group that exists in the schedule), and an invalid class cannot be published. For a plan, the windows are first read from the instructions by a plain parser (times like "9:00 до 16:30" and day words like "делничните дни"), so the plan works at once and with no model at all, labelled "Изчислено без модела"; the model's windows replace them when the worker has run. An answer that does not match the schema is rejected and the parser's windows stay. A class that overlaps a work window is never shown as "can attend", whatever the model says.

## Auth
<!-- Local sign-in plus at least one provider. Say how an account signing in both ways stays one account. -->
- Local: email and password through Better Auth, with the password hashed (scrypt). Sessions are rows in the `session` table keyed by a random token in a cookie that is `HttpOnly`, `Secure` in production, `SameSite=Lax` and has a `Max-Age`, so signing out takes effect on the next request.
- Provider: Google sign-in (OAuth 2.0 / OpenID Connect, with `state` and PKCE). A returning Google user is matched on Google's `sub`, never on the email.
- Linking: a Google account is linked to a password account only while the user is signed in with their password and presses "Свържи Google", and only if Google reports the email as verified. If someone signs in with Google and a password account with the same email already exists, no second account is created: they are told to sign in with their password first and connect Google from there. If Google does not report the email as verified, the sign-in is refused.
- Roles: `student` (the default) and `admin`. A student sees and changes only their own plans, and reads the plans other students shared with them. An admin sees and changes every plan and is the only one who changes roles. On a plan: its `owner` (may change, share and delete it) and the `readers` it is shared with (may only read it). There is no shared schedule and no publisher: every timetable belongs to a plan.

## MCP tools
<!-- At least three tools your own MCP server exposes over this project's data.
     Each tool calls the same service functions the HTTP API calls, so the same rules apply.
     A description shorter than 20 characters is not a description. -->
| Tool | What it does | Who may call it |
| --- | --- | --- |
| `get_my_week` | Returns the classes of one of the caller's plans for a given week number, for the plan's group, with odd/even weeks, start weeks and class notes applied, the same as the plan page | any signed-in user, for a plan they own, that is shared with them, or (an admin) any plan |
| `search_classes` | Searches the timetable of one of the caller's plans by course abbreviation, room number or group, and returns the matching classes with day, time, room and weeks | anyone who may read that plan |
| `find_free_rooms` | Lists the rooms from the timetable of one of the caller's plans that have no class on a given day and period range in a given week | anyone who may read that plan |
| `add_class_note` | Adds a note to one class of a plan, such as "cancelled in week 6" or "mandatory lecture", that everyone who reads the plan then sees | the plan's owner or an admin; anyone else gets the same refusal as the HTTP API |

## UI
<!-- Stack, and the three or more screens. The graded checklist lives in docs/UI.md. -->
- Stack: Next.js (App Router) with TypeScript on Node 22, as one server-rendered app (a Node server, not a static export): React pages for the UI, and Route Handlers under `/api` as the REST API, which call services in `src/services`, which call the data layer in `src/data` (plain SQL with `pg`). PostgreSQL on Neon. The import job runs as a separate Node worker (`npm run worker`) on my laptop, next to the model. Tests with Vitest. Deployed on Render as one web service.
- Screens:
  1. Sign in / sign up: email and password, or Google.
  2. My plans: my plans, the plans shared with me, and (for an admin) everyone else's; a form for a new plan (name, group, start from the sample timetable or empty).
  3. A plan: on the left the timetable import (a photo or a page address, its status, review), the sources (instructions and photos) and the busy times; on the right a chat with the model and the week calendar with every class labelled "can attend", "needs time off" or "email the teacher", marked as a suggestion. The owner shares it by email.
  4. All classes of a plan: the whole timetable (the owner can delete a class), search by course, room or group, and free rooms.
  5. Review of an import: the draft classes, invalid ones marked, remove and publish.
  6. Users (admins only): every user with their role, and a way to change it.

## Architecture
<!-- Exercise 3. One request traced through every layer, naming the file for each one,
     plus one place where your own code does not match this layering. -->
One request: the owner of a plan marks the Saturday КЗ lab of 222 as "Отменено" for week 6 (AC-7).

1. UI: `app/plans/note-form.tsx` (a client component inside the class dialog of `app/plans/week-calendar.tsx`) sends `POST /api/notes` with `{ entryId, week, text }`.
2. Route handler: `app/api/notes/route.ts` reads the JSON body and asks `getActor()` in `app/session.ts` who is calling.
3. Authentication: `actorFromHeaders` in `src/auth.ts` lets Better Auth check the session cookie against the `session` table and returns `{ id, role }`, or null.
4. Service: `addNote` in `src/services/schedule.ts` finds the class's plan (404 if there is none) and asks `editablePlan` in `src/services/access.ts` whether the caller is its owner or an admin (403 for a reader or anyone else), then checks the text (1–500 characters) and the week (1–15). It knows nothing about HTTP.
5. Data access: `findEntryPlan` in `src/data/entries.ts`, `findPlan` and `isSharedWith` in `src/data/plans.ts` and `insertNote` in `src/data/notes.ts` are the only places with SQL.
6. Database: the `notes` table from `db/migrations/002_notes_imports.sql`. The route turns the result into 201, or an `AppError` into its status with a Bulgarian `{ "error": ... }` through `errorResponse`.

The second front door: the MCP tool `add_class_note` in `mcp-server/server.ts` resolves `MCP_TOKEN` through the same `src/auth.ts` (Better Auth `bearer` plugin) and calls the same `addNote`, so a reader gets the same refusal.

Where my code does not match the layering: `processNextImport` in `src/services/imports.ts` is a service function with no actor, because only the worker (`src/worker/index.ts`) calls it and the plan's owner was checked when the import was queued. It also fetches the schedule page itself (`fetchPage`), so this service does network I/O instead of only holding rules. Server Components such as `app/plans/[id]/page.tsx` call services directly, without a route handler, which AGENTS.md allows.

## Acceptance criteria
<!-- Every criterion carries an id. A test proves it by naming that id in its title, for example
     test('AC-3 a booking that overlaps another is refused with 409', ...).
     Say who acts, what they see, and what must be true in the database. -->
- [AC-1] A student whose plan for group 222 starts from the sample timetable sees, in week 3, the УП lab on Monday 13:45–16:30 in room 705; in week 4 (even) and week 1 (before УП labs start) that lab is not shown.
- [AC-2] In a plan for group 221а from the sample timetable, week 1 does not show the ПИ lab on Wednesday 07:30, because ПИ labs start in week 2; week 3 shows it in room 1211.
- [AC-3] A student who imports a photo of their timetable into their plan sees it as "queued" right away, then "ready for review"; no row is added to `entries` until they press "Publish", and then only that plan's classes change.
- [AC-4] When the model does not answer within 120 seconds, the student sees "Моделът не отговори навреме. Опитайте отново или въведете занятията ръчно.", the import has status `failed`, and the plan's classes are unchanged.
- [AC-5] When the model returns a class that starts at a time which is not one of the 14 TU Sofia periods, or a group that is not a TU Sofia group number (such as 222 or 221а), the review screen marks that class as invalid and the "Publish" button stays disabled until it is fixed or removed.
- [AC-7] The owner of a plan who adds the note "Отменено" to the Saturday КЗ lab of group 222 for week 6 sees that class as cancelled in week 6 and as normal in week 8, and so does everyone the plan is shared with.
- [AC-10] A student who sends `POST /api/plans/:id/imports` for a plan that is not theirs gets 403, and no row is added to `imports`.
- [AC-12] In a plan from the sample timetable, searching for "1211" lists the ПИ labs on Wednesday and Thursday and the КЗ lab on Saturday, and nothing else.
- [AC-13] In a plan from the sample timetable, looking for free rooms on Monday 07:30–10:15 in week 3 does not list room 1216, where the ОИТ lecture is.
- [AC-14] The MCP tool `get_my_week`, called with a student's token and their plan's id for week 3, returns the same classes the plan page shows for week 3; `add_class_note` on a class of someone else's plan is refused and no row is added to `notes`.

### Slice 1: sign-in and the schedule list
- [AC-15] A visitor who is not signed in and opens `/plans` is redirected to `/signin`.
- [AC-16] A student who signs up, signs in and creates a plan from the sample timetable sees its 19 classes under "Всички занятия", read from the `entries` table and sorted by day and time.
- [AC-17] A student who signs in with a wrong password sees "Грешен имейл или парола", and no session cookie is set.
- [AC-18] The owner of a plan who deletes a class from "Всички занятия" no longer sees it after a reload, and its row is gone from `entries`; someone the plan is shared with sees no delete button, and a `DELETE` request from them gets 403 and removes nothing.

### Slice 2: my plan, sharing and roles
- [AC-8] A student in group 222 whose plan starts from the sample timetable and who adds the instruction "Работя от 9:00 до 16:30 в делничните дни" sees, in week 4, the Monday КЗ lecture at 16:45 and the Saturday КЗ lab marked "Може да присъства", and no class between 9:00 and 16:30 on a weekday marked so.
- [AC-9] With no model running, the student from AC-8 gets the same labels right after adding the instruction, marked "Изчислено без модела", and the plan waits for the worker with `model_status` = `queued`.
- [AC-19] The owner of a plan who shares it with another student's email makes it appear under that student's "Споделени с мен"; that student can read it, and when they add a source or a message they get 403 and no row is added.
- [AC-20] A student who opens or changes a plan that is neither theirs nor shared with them gets 403, and somebody who is not signed in gets 401; deleting someone else's plan gets 403 and the plan stays. An admin can open and change any plan.
- [AC-21] An admin who makes a student an admin changes that user's `role`; a student who sends the same request gets 403 and the role stays the same.
- [AC-22] When the model answers a plan with something that does not match the schema (such as day 9 or "25:00"), the answer is rejected, the plan's `model_status` becomes `failed`, and the plan keeps the windows computed without the model.

## Traceability
<!-- Filled in from Exercise 3 onward: each AC id, and the test that names it. -->
| Criterion | Test |
| --- | --- |
| AC-1 | `test/services/week.test.ts`: "AC-1 group 222 sees the УП lab on Monday 13:45 in 705 in week 3, not in week 4 (even) or week 1 (before it starts)" |
| AC-2 | `test/services/week.test.ts`: "AC-2 group 221а does not see the Wednesday ПИ lab in week 1, and sees it in room 1211 in week 3" |
| AC-3 | `test/services/imports.test.ts`: "AC-3 a publisher who imports a photo sees "queued" at once, then "ready", and entries change only on Publish" |
| AC-4 | `test/services/imports.test.ts`: "AC-4 when the model does not answer in time the import fails with the message, and nothing is published"; `test/model/ollama.test.ts`: "AC-4 a model that never answers is stopped by the timeout" |
| AC-5 | `test/services/imports.test.ts`: "AC-5 a class at a time that is not a TU Sofia period, or for a group that does not exist, is invalid and blocks Publish" |
| AC-7 | `test/services/week.test.ts`: "AC-7 a publisher who adds "Отменено" to the Saturday КЗ lab of 222 for week 6 cancels it in week 6 only" |
| AC-10 | `test/services/imports.test.ts`: "AC-10 a student who starts an import gets 403 and no row is added to imports" |
| AC-12 | `test/services/week.test.ts`: "AC-12 searching for "1211" lists the ПИ labs on Wednesday and Thursday and the КЗ lab on Saturday, and nothing else" |
| AC-13 | `test/services/week.test.ts`: "AC-13 free rooms on Monday 07:30–10:15 in week 3 do not include 1216, where the ОИТ lecture is" |
| AC-14 | `test/mcp-server.test.ts`: "AC-14 get_my_week with a student token for week 3 returns the same classes as the week view" and "AC-14 add_class_note called by a student is refused and no note is added" |
| AC-15 | `test/proxy.test.ts`: "AC-15 a visitor who is not signed in and opens /schedule is redirected to /signin" |
| AC-16 | `test/services/schedule.test.ts`: "AC-16 a signed-in student gets the classes from entries, sorted by day and time" |
| AC-17 | `test/auth.test.ts`: "AC-17 a wrong password is refused with "Грешен имейл или парола" and no session is created" |
| AC-18 | `test/services/schedule.test.ts`: "AC-18 a publisher deletes a class..." and "AC-18 a student who tries to delete a class gets 403..." |
| AC-8 | `test/services/plans.test.ts`: "AC-8 with "Работя от 9:00 до 16:30 в делничните дни", the Monday КЗ lecture and the Saturday КЗ lab can be attended, and no weekday class between 9:00 and 16:30" |
| AC-9 | `test/services/plans.test.ts`: "AC-9 with no model, the labels are there at once, computed without the model, and the plan waits for the worker" |
| AC-19 | `test/services/plans.test.ts`: "AC-19 a plan shared with Boris shows under his shared plans; ..."; `test/api/plans.test.ts`: "AC-19 a reader who posts a message or a source gets 403 and nothing is added" |
| AC-20 | `test/services/plans.test.ts`: "AC-20 someone the plan is not shared with gets 403 ..."; `test/api/plans.test.ts`: "AC-20 deleting someone else's plan gets 403, and signed out 401; the plan stays" |
| AC-21 | `test/services/users.test.ts`: "AC-21 an admin makes a student a publisher; ..."; `test/api/plans.test.ts`: "AC-21 an admin changes a role (204); a publisher gets 403 and nothing changes" |
| AC-22 | `test/services/plans.test.ts`: "AC-22 an answer that does not match the schema is rejected and the windows without the model stay" |

## Spec vs result
<!-- After the agent builds the slice: which criteria passed, which it missed or reinterpreted, and what you changed in this spec because of it. -->
- Passes: every acceptance criterion above has a test whose title names it, and `npm test` passes.
- Reinterpreted: AC-5 says "fixed or removed"; the review screen removes a class, and there is no form to edit one. AC-17's message comes from the sign-in page translating Better Auth's `INVALID_EMAIL_OR_PASSWORD` code.
- Not built: importing from a PDF (a photo or a page address only); earlier versions of a timetable (publishing replaces a plan's classes and their notes); an automated test of the whole Google sign-in round trip.
- Change to the spec: every timetable belongs to a student's plan, and the roles are `student` and `admin`.
