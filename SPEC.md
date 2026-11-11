# TU Sofia weekly schedule

<!-- Exercise 2. Write the non-goals first. Every acceptance criterion must be checkable in under a minute.
     Keep these headings exactly as they are: the self-checks look for them by name.
     The full target is on the course site under Resources → The course project. -->

## Project option
<!-- One line: lab booking, study groups, club events, or the own project the lecturer approved. -->
Own project, approved by the lecturer on 2026-10-28: a web app that makes the TU Sofia weekly schedule easy to read and search, and turns it into a personal plan for each student.

## Goals
- A student picks a schedule, their group and a week number, and sees exactly which classes happen that week, when and in which room, with odd and even weeks and each course's start week already applied.
- A publisher imports the latest version of a schedule from an HTML page, a photo or a PDF. The local model turns it into a draft, and the publisher reviews and publishes it. (Later: keeping earlier versions.)
- A publisher adds notes to a class, such as "cancelled in week 6", "this lecture is mandatory" or "the teacher allows two missed labs", and students see them on that class.
- (Later, not in Exercise 3) A student writes their own constraints in plain words, such as work hours and meetings, and gets a plan that marks every class as "can attend", "needs time off" or "email the teacher".
- Anyone signed in can search the schedule by course, room or group, and find the rooms that are free at a given time.

## Non-goals
- No automatic polling of faculty websites: a new version is fetched only when a publisher presses "Fetch latest".
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
- Input: for an import, the source of one schedule version (the text of an HTML page, a photo or a rendered PDF page) plus the publisher's extra instructions. For a plan (later), the student's classes for the week, the notes on those classes, and the student's own instructions in plain words.
- Output: for an import, a list of draft classes (course, type, groups, day, start and end time, room, odd/even/every week, start week) as JSON. For a plan (later), the student's time windows as JSON, and for each class a label: "can attend", "needs time off" or "email the teacher", with a one-line reason.
- Data that leaves the app: none. Every model call goes to localhost.
- When it fails: each call has a 120-second timeout and runs in a background job, so nobody waits on a frozen screen. If the model is down, times out or returns something that is not valid JSON, the import is marked `failed` with the reason, and the publisher can retry or enter the classes by hand. The last published version stays visible. The server re-checks every draft class against real data (one of the 14 TU Sofia periods, Monday to Saturday, a group that exists in the schedule), and an invalid class cannot be published. For a plan (later), the fallback is a plain overlap check between the classes and the student's saved time windows, labelled "computed without the model". A class that overlaps a work window is never shown as "can attend", whatever the model says.

## Auth
<!-- Local sign-in plus at least one provider. Say how an account signing in both ways stays one account. -->
- Local: email and password through Better Auth, with the password hashed (scrypt). Sessions are rows in the `session` table keyed by a random token in a cookie that is `HttpOnly`, `Secure` in production, `SameSite=Lax` and has a `Max-Age`, so signing out takes effect on the next request.
- Provider: Google sign-in (OAuth 2.0 / OpenID Connect, with `state` and PKCE). A returning Google user is matched on Google's `sub`, never on the email.
- Linking: a Google account is linked to a password account only while the user is signed in with their password and presses "Свържи Google", and only if Google reports the email as verified. If someone signs in with Google and a password account with the same email already exists, no second account is created: they are told to sign in with their password first and connect Google from there. If Google does not report the email as verified, the sign-in is refused.
- Roles: `student` (the default) and `publisher` (imports, reviews and publishes schedules, adds notes to classes). Only a publisher can make another user a publisher.

## MCP tools
<!-- At least three tools your own MCP server exposes over this project's data.
     Each tool calls the same service functions the HTTP API calls, so the same rules apply.
     A description shorter than 20 characters is not a description. -->
| Tool | What it does | Who may call it |
| --- | --- | --- |
| `get_my_week` | Returns one group's classes for a given week number, with odd/even weeks, start weeks and class notes applied, the same as the week view | any signed-in user, for the group and week they ask for (the same as the week view) |
| `search_classes` | Searches the published schedule by course abbreviation, room number or group, and returns the matching classes with day, time, room and weeks | any signed-in user |
| `find_free_rooms` | Lists the rooms from the published schedule that have no class on a given day and period range in a given week | any signed-in user |
| `add_class_note` | Adds a note to one class, such as "cancelled in week 6" or "mandatory lecture", that every student of that class then sees | publishers only; a student gets the same refusal as the HTTP API |

## UI
<!-- Stack, and the three or more screens. The graded checklist lives in docs/UI.md. -->
- Stack: Next.js (App Router) with TypeScript on Node 22, as one server-rendered app (a Node server, not a static export): React pages for the UI, and Route Handlers under `/api` as the REST API, which call services in `src/services`, which call the data layer in `src/data` (plain SQL with `pg`). PostgreSQL on Neon. The import job runs as a separate Node worker (`npm run worker`) on my laptop, next to the model. Tests with Vitest. Deployed on Render as one web service.
- Screens:
  1. Sign in / sign up: email and password, or Google.
  2. Week view: pick a schedule, a group and a week number, see that week's classes with notes, search by course, room or group, and find free rooms.
  3. (Later) My plan: write personal instructions, confirm the time windows the model read from them, and see every class labelled "can attend", "needs time off" or "email the teacher", marked as a suggestion.
  4. Imports (publishers only): start an import from a URL, a photo or a PDF, follow its status (queued, processing, ready for review, failed), review and correct the draft classes, and publish.

## Architecture
<!-- Exercise 3. One request traced through every layer, naming the file for each one,
     plus one place where your own code does not match this layering. -->

## Acceptance criteria
<!-- Every criterion carries an id. A test proves it by naming that id in its title, for example
     test('AC-3 a booking that overlaps another is refused with 409', ...).
     Say who acts, what they see, and what must be true in the database. -->
- [AC-1] A student in group 222 who opens week 3 sees the УП lab on Monday 13:45–16:30 in room 705; in week 4 (even) and week 1 (before УП labs start) that lab is not shown.
- [AC-2] A student in group 221а who opens week 1 does not see the ПИ lab on Wednesday 07:30, because ПИ labs start in week 2; in week 3 they see it in room 1211.
- [AC-3] A publisher who starts an import from a photo sees it as "queued" right away, then "ready for review"; no row is added to `entries` until they press "Publish".
- [AC-4] When the model does not answer within 120 seconds, the publisher sees "Моделът не отговори навреме. Опитайте отново или въведете занятията ръчно.", the import has status `failed`, and the published version students see is unchanged.
- [AC-5] When the model returns a class that starts at a time which is not one of the 14 TU Sofia periods, or a group that does not exist in the schedule, the review screen marks that class as invalid and the "Publish" button stays disabled until it is fixed or removed.
- [AC-7] A publisher who adds the note "Отменено" to the Saturday КЗ lab of group 222 for week 6 makes students of 222 see that class as cancelled in week 6 and as normal in week 8.
- [AC-10] A student who sends `POST /api/imports` gets 403, and no row is added to `imports`.
- [AC-12] Searching for "1211" lists the ПИ labs on Wednesday and Thursday and the КЗ lab on Saturday, and nothing else.
- [AC-13] Looking for free rooms on Monday 07:30–10:15 in week 3 does not list room 1216, where the ОИТ lecture is.
- [AC-14] The MCP tool `get_my_week`, called with a student's token for week 3, returns the same classes the week view shows that student for week 3; called by a student, `add_class_note` is refused and no row is added to `notes`.

### Slice 1: sign-in and the schedule list
- [AC-15] A visitor who is not signed in and opens `/schedule` is redirected to `/signin`.
- [AC-16] A student who signs up with email and password and then signs in sees the classes of the seeded schedule (the 19 classes of the ФКСТ КСИ master's winter 2026/27 schedule), read from the `entries` table and sorted by day and time.
- [AC-17] A student who signs in with a wrong password sees "Грешен имейл или парола", and no session cookie is set.
- [AC-18] A publisher who deletes a class from the list no longer sees it after a reload, and its row is gone from `entries`; a student sees no delete button, and a `DELETE` request from a student gets 403 and removes nothing.

## Traceability
<!-- Filled in from Exercise 3 onward: each AC id, and the test that names it. -->
| Criterion | Test |
| --- | --- |
| AC-1 | `test/services/week.test.ts`: "AC-1 group 222 sees the УП lab on Monday 13:45 in 705 in week 3, not in week 4 (even) or week 1 (before it starts)" |
| AC-2 | `test/services/week.test.ts`: "AC-2 group 221а does not see the Wednesday ПИ lab in week 1, and sees it in room 1211 in week 3" |
| AC-3 |  |
| AC-4 |  |
| AC-5 |  |
| AC-7 | `test/services/week.test.ts`: "AC-7 a publisher who adds "Отменено" to the Saturday КЗ lab of 222 for week 6 cancels it in week 6 only" |
| AC-10 |  |
| AC-12 | `test/services/week.test.ts`: "AC-12 searching for "1211" lists the ПИ labs on Wednesday and Thursday and the КЗ lab on Saturday, and nothing else" |
| AC-13 | `test/services/week.test.ts`: "AC-13 free rooms on Monday 07:30–10:15 in week 3 do not include 1216, where the ОИТ lecture is" |
| AC-14 |  |
| AC-15 | `test/proxy.test.ts`: "AC-15 a visitor who is not signed in and opens /schedule is redirected to /signin" |
| AC-16 | `test/services/schedule.test.ts`: "AC-16 a signed-in student gets the classes from entries, sorted by day and time" |
| AC-17 | `test/auth.test.ts`: "AC-17 a wrong password is refused with "Грешен имейл или парола" and no session is created" |
| AC-18 | `test/services/schedule.test.ts`: "AC-18 a publisher deletes a class..." and "AC-18 a student who tries to delete a class gets 403..." |

## Spec vs result
<!-- After the agent builds the slice: which criteria passed, which it missed or reinterpreted, and what you changed in this spec because of it. -->
- Passed: AC-15, AC-16, AC-17 and AC-18, each checked against the running app and the local database (Docker), not only by the tests. A student sees the 19 seeded classes and no delete button; a student's `DELETE` gets 403 and the row stays; a publisher's `DELETE` gets 204 and the row is gone from `entries`; a wrong password gets 401 and no session cookie.
- Reinterpreted: AC-17's message "Грешен имейл или парола" comes from the sign-in page translating Better Auth's `INVALID_EMAIL_OR_PASSWORD` code, so the test checks the refusal, the unchanged `session` table and the translation separately, not the rendered page.
- Reinterpreted: AC-16 says "read from the `entries` table"; the test replaces the data layer, so it proves the rule (signed in, sorted by day and time) and the database part was checked by hand.
- Missed: the overall coverage gate (80%) is not met yet, because `src/data/` has no tests against a real database. The service layer is at 100%.
- Spec changes because of the build: the Auth section no longer says bcrypt and our own `sessions` table. Sign-in uses Better Auth, which hashes with scrypt and keeps sessions in its own `session` table. The Google linking rule was tightened to lecture 7 (link only while signed in, match on `sub`), which changed the old AC-11 (now listed as later, below).
- Moved out of Exercise 3, to keep the project small (still wanted, not built yet). They are no longer in the acceptance criteria above, so no test names them:
  - [later, was AC-6] When a publisher publishes a new version, students see the new classes, the previous version stays in `schedule_versions` with status `superseded`, and students' personal instructions are kept.
  - [later, was AC-8] A student in group 222 who writes "Работя от 9:00 до 16:30 в делничните дни" sees the Monday КЗ lecture at 16:45 and the Saturday КЗ lab marked "can attend", and no class between 9:00 and 16:30 on a weekday marked "can attend".
  - [later, was AC-9] When the model is unavailable, the student from AC-8 still gets a plan from their saved time windows, labelled "Изчислено без модела", with the same "can attend" classes.
  - [later, was AC-11] A student signed in with their password who presses "Свържи Google" and signs in with a Google account with the same verified email can afterwards sign in with Google into that same account, and no second row appears in `users`. Someone who is not signed in and signs in with Google using the email of an existing password account sees "Влезте с паролата си и свържете Google от профила", and no row is added to `users`.
