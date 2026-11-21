# TU Sofia weekly schedule

<!-- Exercise 2. Write the non-goals first. Every acceptance criterion must be checkable in under a minute.
     Keep these headings exactly as they are: the self-checks look for them by name.
     The full target is on the course site under Resources → The course project. -->

## Project option
<!-- One line: lab booking, study groups, club events, or the own project the lecturer approved. -->
Own project, approved by the lecturer on 2026-10-28: a web app that makes the TU Sofia weekly schedule easy to read and search, and turns it into a personal plan for each student.

## Goals
- A student makes their own plan, like a small project: they import their timetable from a page address, a photo or both (the app downloads the page's text, the local model reads it, they review and publish it; publishing replaces the plan's classes and their notes), or start from the sample ФКСТ КСИ timetable.
- The student chooses their group, and for every subject which group's sessions they attend: their own group by default, another group that has the same subject, or none. A subject their group does not have is not taken until they choose a group for it.
- The plan shows exactly which classes happen in a given week, when and in which room, with odd and even weeks and each course's start week already applied, as a week calendar.
- On the left the student keeps their personal instructions (work hours, meetings, which subjects they take with which group) and photos (such as a shift rota). The model reads them into busy times, and the app marks every class: "Може да присъства" when it overlaps no busy time, "Трябва отпуска" for a lab or seminar that overlaps one, "Пишете на преподавателя" for a lecture that overlaps one; a cancelled class has no label.
- In the chat the student says anything; the model answers and may change the personal instructions, the subject choices and the busy times, and the server checks each change before it is saved. Notes on classes, such as "Отменено", are added from the calendar.
- A student shares a plan read-only with other students, who see it under "Споделени с мен": the whole plan (calendar, instructions, photos, chat), but they cannot change it; the owner can remove a reader. An admin can see and change every plan, and gives roles.
- Anyone who may read a plan can search its timetable by course, room or group.

## Non-goals
- No automatic polling of faculty websites: a timetable is read only when a student imports it into their plan.
- No student lists or names from faculty pages: the app imports the timetable only, never the "Списъчен състав" section.
- No emails sent to teachers: the plan marks the classes worth emailing about, and the student writes the email themselves.
- No notifications of any kind (email, push or SMS) when a schedule changes.
- No calendar export or sync (.ics, Google Calendar, Outlook).
- No exam session schedules and no academic calendar, only the weekly schedule.
- No hosted model while the laptop's model is on: Gemini answers only a job that has waited 30 seconds, and only when `GEMINI_API_KEY` is set.

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
- Model: Qwen3.8-27B (https://huggingface.co/Qwen/Qwen3.8-27B), tag `qwen3.8:27b-mlx`, run locally through Ollama on my laptop, without its "thinking" step. Chosen because it reads both text and images, fits in 64 GB, keeps every timetable and personal instruction on my machine, and reads the faculty page in about 20 seconds with every class right.
- Input: for an import, the text of the timetable page (downloaded by the worker, without menus and without the student lists), a photo of the timetable, or both, plus the student's extra instructions. For a plan, the personal instructions and photos, the chat messages, the plan's group, and the subjects of its timetable with the groups that have each one and the current choices.
- Output: for an import, a list of draft classes (course, type, groups, day, start and end time, room, odd/even/every week, start week) as JSON. For a plan, as JSON that must match a schema (structured output, the same for imports): a short reply for the chat, the student's busy time windows (day, from, to, what), and, when the student asked for it, the new list of personal instructions and changed subject choices (subject, type and group, or none). The label of each class ("can attend", "needs time off" or "email the teacher") is computed by the server from those windows, not chosen by the model.
- Data that leaves the app: with the laptop's model on, none (every call goes to localhost). When it is off and the backup answers, the job's data goes to Google's Gemini API (`gemini-2.5-flash`): the timetable text or photo, and for a plan the personal instructions, photos and chat. On Google's free tier that data may be used to improve Google's products; the plan page says so.
- When it fails: each call has a 120-second timeout and runs in a background job, so nobody waits on a frozen screen. The laptop's worker answers at once; a backup worker on the website answers with Gemini any job that has waited 30 seconds (the laptop is off). If neither answers, or Gemini is rate-limited (429), the job is marked `failed` with the reason. If the model is down, times out or returns something that is not valid JSON, the import is marked `failed` with the reason, and the student can retry. The plan's current classes stay as they were. The server re-checks every draft class against real data (one of the 14 TU Sofia periods, Monday to Saturday, a TU Sofia group number such as 222 or 221а), and an invalid class cannot be published. For a plan, the busy times come from the model; until it has answered, or when there is no model at all (as on Render), a plain parser reads them from the instructions (times like "9:00 до 16:30" and day words like "делничните дни"), labelled "Приблизително, без AI". An answer that does not match the schema, or that moves a subject to a group that does not have it, is rejected as a whole, so the plan keeps what it had. A class that overlaps a busy time is never shown as "can attend", whatever the model says.

## Auth
<!-- Local sign-in plus at least one provider. Say how an account signing in both ways stays one account. -->
- Local: email and password through Better Auth, with the password hashed (scrypt). Sessions are rows in the `session` table keyed by a random token in a cookie that is `HttpOnly`, `Secure` in production, `SameSite=Lax` and has a `Max-Age`, so signing out takes effect on the next request.
- Provider: Google sign-in (OAuth 2.0 / OpenID Connect, with `state` and PKCE). A returning Google user is matched on Google's `sub`, never on the email.
- Linking: a Google account is linked to a password account only while the user is signed in with their password and presses "Свържи Google", and only if Google reports the email as verified. If someone signs in with Google and a password account with the same email already exists, no second account is created: they are told to sign in with their password first and connect Google from there. If Google does not report the email as verified, the sign-in is refused.
- Roles: `student` (the default) and `admin`. A student sees and changes only their own plans, and reads the plans other students shared with them. An admin sees and changes every plan and is the only one who changes roles. On a plan: its `owner` (may change, share and delete it) and the `readers` it is shared with (may only read it).

## MCP tools
<!-- At least three tools your own MCP server exposes over this project's data.
     Each tool calls the same service functions the HTTP API calls, so the same rules apply.
     A description shorter than 20 characters is not a description. -->
| Tool | What it does | Who may call it |
| --- | --- | --- |
| `get_my_week` | Returns the classes of one of the caller's plans for a given week number, for the subjects and groups the plan follows, with odd/even weeks, start weeks and class notes applied, the same as the plan page | the token's user, for a plan they own or that is shared with them; `MCP_TOKEN` is a student's session, and an admin's token is refused |
| `search_classes` | Searches the timetable of one of the caller's plans by course abbreviation, room number or group, and returns the matching classes with day, time, room and weeks | anyone who may read that plan |
| `add_class_note` | Adds a note to one class of a plan, such as "cancelled in week 6" or "mandatory lecture", that everyone who reads the plan then sees | the plan's owner or an admin; anyone else gets the same refusal as the HTTP API |

## UI
<!-- Stack, and the three or more screens. The graded checklist lives in docs/UI.md. -->
- Stack: Next.js (App Router) with TypeScript on Node 22, as one server-rendered app (a Node server, not a static export): React pages for the UI, and Route Handlers under `/api` as the REST API, which call services in `src/services`, which call the data layer in `src/data` (plain SQL with `pg`). PostgreSQL on Neon. The import job runs as a separate Node worker (`npm run worker`) on my laptop, next to the model. Tests with Vitest. Deployed on Render as one web service.
- Screens:
  1. Sign in / sign up: email and password, or Google.
  2. My plans: my plans, the plans shared with me, and (for an admin) everyone else's; a form for a new plan (a name, and whether to start from the sample timetable).
  3. A plan: on the left the timetable import (a page address, a photo or both, its status, review), "My group and subjects" (the group, and for every subject a choice of the groups that have it, or none), and the personal instructions with photos and the busy times read from them; on the right a chat with the model, and the week calendar with every class labelled "can attend", "needs time off" or "email the teacher", marked as a suggestion; the model's status ("моделът чете…", or that it failed) and "Приблизително, без AI" while the busy times come from the parser. The owner shares it by email.
  4. All classes of a plan: the whole timetable (the owner can delete a class), and search by course, room or group.
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
7. Back in the browser: `app/plans/note-form.tsx` keeps the text and the error in React state; on 201 it calls `router.refresh()`, so the Server Component `app/plans/[id]/page.tsx` asks `getWeek` again and passes the classes as props to `app/plans/week-calendar.tsx`, which draws the class crossed out with "Отменено".

The second front door: the MCP tool `add_class_note` in `mcp-server/server.ts` resolves `MCP_TOKEN` through the same `src/auth.ts` (Better Auth `bearer` plugin) and calls the same `addNote`, so a reader gets the same refusal.

Where my code does not match the layering: `processNextImport` in `src/services/imports.ts` and `processNextPlan` in `src/services/plans.ts` are service functions with no actor, because only the worker (`src/worker/index.ts`) calls them and the plan's owner was checked when the import was queued. It also fetches the schedule page itself (`fetchPage`), so this service does network I/O instead of only holding rules. Server Components such as `app/plans/[id]/page.tsx` call services directly, without a route handler, which AGENTS.md allows.


Where each screen is rendered:

| Screen | Rendered | Why | While it waits |
| --- | --- | --- | --- |
| Sign in (`app/signin/page.tsx`) | browser | a form with no data to load; Better Auth's client sets the cookie | the button says "Моля, изчакайте…" |
| My plans (`app/plans/page.tsx`) | server | the lists come from the database and must not show to a stranger | the skeleton in `app/plans/loading.tsx` |
| A plan (`app/plans/[id]/page.tsx`) | server, with client islands for the forms, the chat and the calendar | the access check and the labels are computed on the server; FullCalendar needs the browser | the skeleton, then "Моделът мисли…" / "в опашката" for model work, refreshing every 3 s |
| All classes (`app/plans/[id]/classes/page.tsx`) | server | a read-only list with search through the URL | the skeleton |
| Import review (`app/plans/[id]/imports/[importId]/page.tsx`) | server | the draft is checked against the rules on the server | the skeleton |
| Users (`app/admin/users/page.tsx`) | server | admins only, checked on the server | the skeleton; the select is disabled while saving |

## Acceptance criteria
<!-- Every criterion carries an id. A test proves it by naming that id in its title, for example
     test('AC-3 a booking that overlaps another is refused with 409', ...).
     Say who acts, what they see, and what must be true in the database. -->
- [AC-1] A student whose plan starts from the sample timetable and whose group is 222 sees, in week 3, the УП lab on Monday 13:45–16:30 in room 705; in week 4 (even) and week 1 (before УП labs start) that lab is not shown.
- [AC-2] In a plan from the sample timetable whose group is 221а, week 1 does not show the ПИ lab on Wednesday 07:30, because ПИ labs start in week 2; week 3 shows it in room 1211.
- [AC-3] A student who imports a photo of their timetable into their plan sees it as "в опашката" right away, then "готово за преглед"; no row is added to `entries` until they press "Публикувай", and then that plan's `entries` are exactly the published classes.
- [AC-4] When the model does not answer within `MODEL_TIMEOUT_MS` (120 seconds; set it to 1000 to check this quickly), the student sees "Моделът не отговори навреме. Опитайте отново или въведете занятията ръчно.", the import has status `failed`, and the plan's classes are unchanged.
- [AC-5] When the model returns a class that starts at a time which is not one of the 14 TU Sofia periods, or a group that is not a TU Sofia group number (such as 222 or 221а), the review screen marks that class as invalid and the "Publish" button stays disabled until it is fixed or removed.
- [AC-7] The owner of a plan who adds the note "Отменено" to the Saturday КЗ lab of group 222 for week 6 sees that class crossed out with "Отменено" in week 6 and as normal in week 8, and so does everyone the plan is shared with.
- [AC-10] A student who sends `POST /api/plans/:id/imports` for a plan that is not theirs gets 403, and no row is added to `imports`.
- [AC-12] In a plan from the sample timetable, searching for "1211" lists the ПИ labs on Wednesday and Thursday and the КЗ lab on Saturday, and nothing else.
- [AC-13] A student in group 222 who sets the УП lab to group 221а sees, in week 3, the УП lab on Thursday 10:30–13:15 in room 705 instead of the Monday one; a subject set to "Не го взимам" disappears from every week; and choosing group 221б for МСВИВИ, which 221б does not have, is refused with 400 and nothing changes.
- [AC-14] The MCP tool `get_my_week`, called with a student's token and their plan's id for week 3, returns the same classes the plan page shows for week 3; `add_class_note` on a class of someone else's plan is refused and no row is added to `notes`.

### Slice 1: sign-in and the schedule list
- [AC-15] A visitor who is not signed in and opens `/plans` is redirected to `/signin`.
- [AC-16] A student who signs up, signs in and creates a plan from the sample timetable sees its 19 classes under "Всички занятия", read from the `entries` table and sorted by day and time.
- [AC-17] A student who signs in with a wrong password sees "Грешен имейл или парола", and no session cookie is set.
- [AC-18] The owner of a plan who deletes a class from "Всички занятия" no longer sees it after a reload, and its row is gone from `entries`; someone the plan is shared with sees no delete button, and a `DELETE` request from them gets 403 and removes nothing.

### Slice 2: my plan, sharing and roles
- [AC-8] A student whose plan starts from the sample timetable and whose group is 222, and who adds the instruction "Работя от 9:00 до 16:30 в делничните дни" sees, in week 4, the Monday КЗ lecture at 16:45 and the Saturday КЗ lab marked "Може да присъства", no class between 9:00 and 16:30 on a weekday marked so, and the Tuesday МСКМ lecture at 10:30 marked "Пишете на преподавателя".
- [AC-9] With no model running, the student from AC-8 gets the same labels right after adding the instruction, marked "Приблизително, без AI", and the plan waits for the worker with `model_status` = `queued`.
- [AC-19] The owner of a plan who shares it with another student's email makes it appear under that student's "Споделени с мен"; that student can read it, and when they add a source or a message they get 403 and no row is added.
- [AC-20] A student who opens or changes a plan that is neither theirs nor shared with them gets 403, and somebody who is not signed in gets 401; deleting someone else's plan gets 403 and the plan stays. An admin can open and change any plan.
- [AC-21] An admin who makes a student an admin changes that user's `role`; a student who sends the same request gets 403 and the role stays the same.
- [AC-22] When the model answers a plan with something that does not match the schema (such as day 9 or "25:00"), the answer is rejected, the plan's `model_status` becomes `failed`, and the plan keeps the windows computed without the model.
- [AC-23] When the student writes in the chat "Вече не работя в петък" and the model answers with a new list of instructions without Friday, the left panel shows that list and Friday's classes are "can attend"; when the model asks to move a subject to a group that does not have it, the whole answer is rejected and the instructions and choices stay as they were.

## Traceability
<!-- Filled in from Exercise 3 onward: each AC id, and the test that names it. -->
| Criterion | Test |
| --- | --- |
| AC-1 | `test/services/schedule.test.ts`: "AC-1 group 222 sees the УП lab on Monday 13:45 in 705 in week 3, not in week 4 (even) or week 1 (before it starts)" |
| AC-2 | `test/services/schedule.test.ts`: "AC-2 group 221а does not see the Wednesday ПИ lab in week 1, and sees it in room 1211 in week 3" |
| AC-3 | `test/api/routes.test.ts`: "AC-3 the owner gets 201 and the import is "queued""; `test/services/imports.test.ts`: "AC-3 a student who imports a photo into their plan sees "queued" at once, then "ready", and entries change only on Publish" |
| AC-4 | `test/model/ollama.test.ts`: "AC-4 a model that never answers is stopped by the timeout"; `test/services/imports.test.ts`: "AC-4 when the model does not answer in time the import fails with the message, and nothing is published" |
| AC-5 | `test/api/routes.test.ts`: "AC-5 publishing a draft with a class outside the 14 periods is refused with 400 and nothing is published"; `test/services/imports.test.ts`: "AC-5 a class at a time that is not a TU Sofia period, or for a group that is not a TU group number, is invalid and blocks Publish" |
| AC-7 | `test/api/routes.test.ts`: "AC-7 the owner adds a note and gets 201"; `test/services/schedule.test.ts`: "AC-7 the owner adds "Отменено" to the Saturday КЗ lab for week 6: cancelled in week 6, normal in week 8, the same for a reader" |
| AC-10 | `test/api/routes.test.ts`: "AC-10 a student who sends POST /api/plans/:id/imports for a plan that is not theirs gets 403 and no row is added to imports"; `test/services/imports.test.ts`: "AC-10 a student who starts an import for a plan that is not theirs gets 403 and no row is added to imports" |
| AC-12 | `test/services/schedule.test.ts`: "AC-12 searching for "1211" lists the ПИ labs on Wednesday and Thursday and the КЗ lab on Saturday, and nothing else" |
| AC-13 | `test/services/schedule.test.ts`: "AC-13 setting the УП lab to group 221а shows it on Thursday 10:30 in 705 instead of Monday; "not taken" hides a subject; a group without the subject is 400" |
| AC-14 | `test/mcp-server.test.ts`: "AC-14 get_my_week with a student token and their plan id for week 3 returns the same classes as the plan page"; `test/mcp-server.test.ts`: "AC-14 add_class_note on a class of someone else's plan is refused and no note is added" |
| AC-15 | `test/proxy.test.ts`: "AC-15 a visitor who is not signed in and opens /plans is redirected to /signin" |
| AC-16 | `test/services/schedule.test.ts`: "AC-16 a plan from the sample timetable has its 19 classes, sorted by day and time" |
| AC-17 | `test/auth.test.ts`: "AC-17 a wrong password is refused with "Грешен имейл или парола" and no session is created" |
| AC-18 | `test/api/routes.test.ts`: "AC-18 a reader gets 403, nobody signed in gets 401, and nothing is removed; the owner gets 204"; `test/services/schedule.test.ts`: "AC-18 the owner deletes a class and its row is gone; a reader gets 403 and nothing is removed" |
| AC-8 | `test/services/plans.test.ts`: "AC-8 with "Работя от 9:00 до 16:30 в делничните дни", the Monday КЗ lecture and the Saturday КЗ lab can be attended, and no weekday class between 9:00 and 16:30" |
| AC-9 | `test/services/plans.test.ts`: "AC-9 with no model, the labels are there at once, computed without the model, and the plan waits for the worker" |
| AC-19 | `test/api/plans.test.ts`: "AC-19 a reader who posts a message or a source gets 403 and nothing is added"; `test/services/plans.test.ts`: "AC-19 a plan shared with Boris shows under his shared plans; he can read it, and adding a source or a message gets 403" |
| AC-20 | `test/api/plans.test.ts`: "AC-20 deleting someone else's plan gets 403, and signed out 401; the plan stays"; `test/services/plans.test.ts`: "AC-20 a stranger gets 403 for reading, changing and deleting; nobody signed in 401; an admin can open and change any plan" |
| AC-21 | `test/api/plans.test.ts`: "AC-21 an admin makes a student an admin (204); a student who sends the same request gets 403 and nothing changes"; `test/services/users.test.ts`: "AC-21 an admin makes a student an admin; a student who tries gets 403 and the role stays" |
| AC-22 | `test/services/plans.test.ts`: "AC-22 an answer that does not match the schema is rejected and the windows without the model stay" |
| AC-23 | `test/services/plans.test.ts`: "AC-23 the chat replaces the instructions (Friday freed) and moves a subject; an impossible subject change rejects the whole answer" |

## Spec vs result
<!-- After the agent builds the slice: which criteria passed, which it missed or reinterpreted, and what you changed in this spec because of it. -->
- Passes: every acceptance criterion above has a test whose title names it, and `npm test` passes.
- Reinterpreted: AC-5 says "fixed or removed"; the review screen removes a class, and there is no form to edit one. AC-17's message comes from the sign-in page translating Better Auth's `INVALID_EMAIL_OR_PASSWORD` code.
- Not built: importing from a PDF; an automated test of the whole Google sign-in round trip.
- Change to the spec: AC-13 covers choosing a subject's group instead of free rooms.
