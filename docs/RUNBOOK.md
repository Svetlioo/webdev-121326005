# Как се пуска, тества и деплойва

## 1. Локално, от нулата

```bash
npm install                      # веднъж
cp .env.example .env             # веднъж; сложи свой BETTER_AUTH_SECRET (openssl rand -base64 32)
npm run db:up                    # PostgreSQL в Docker (порт 5433); Docker Desktop трябва да е пуснат
npm run db:setup                 # прилага миграциите 001–006
npm run dev                      # сайтът: http://localhost:3000
```

Първият администратор (след като се е регистрирал на сайта):

```bash
npm run make-admin -- someone@example.com
```

## 2. Моделът на лаптопа (два отделни терминала)

```bash
ollama serve                     # терминал 1 (или отвори приложението Ollama)
npm run worker                   # терминал 2: взима задачите от базата и пита модела
```

- Моделът е `qwen3.8:27b-mlx` (от `.env`), без мислене: страницата на факултета се чете за ~20 s, 19/19 верни.
- По-лек вариант: `MODEL_NAME=qwen3-vl:4b-instruct npm run worker` (~17 s, 16/19 верни).
- Спиране: Ctrl+C на worker-а и `ollama stop qwen3.8:27b-mlx` (или Quit Ollama от менюто), за да не върти вентилаторите.

## 3. Тест от край до край в браузъра

Акаунти за тест (парола `test1234`): `student@test.bg`, `student2@test.bg`, `admin@test.bg`, `publisher@test.bg` (обикновен студент).

1. Влез като `student@test.bg` → „Моите програми“ → име → „Създай програма“ (без отметката).
2. „Разписание“ → адрес `https://cs.fcst.bg/page.php?id=89` → „Внеси разписанието“ → ~20 s → „готово за преглед“ → „Прегледай и публикувай“ → „Публикувай“.
3. „Моята група и предмети“ → група `222`; смени „УП упражнение“ на „с 221а“ → в 3. седмица е в четвъртък.
4. „Лични инструкции“ → `Работя от 9:00 до 16:30 в делничните дни` → веднага „Приблизително, без AI“, след малко „от AI“; календарът се оцветява.
5. Чат → `Вече не работя в петък` → моделът сменя инструкциите вляво и петък става зелен.
6. Кликни занятие в календара → бележка `Отменено` → задраскано само за тази седмица.
7. „Сподели“ → `student2@test.bg` → влез като student2: „Споделени с мен“, само за четене.
8. Като `publisher@test.bg` отвори адреса на програмата → „Тази програма не е споделена с вас.“
9. Като `admin@test.bg` → вижда всички програми; „Потребители“ → роли.
10. Без модел: спри worker-а, пиши в чата → „Моделът мисли…“, след 2 мин „Моделът е изключен в момента“.
11. `curl localhost:3000/health` → `{"status":"ok","db":"ok"}`; спри базата (`docker compose stop db`) → 503.

Автоматичните проверки:

```bash
npm test                         # 173 теста
npm run coverage                 # 100% на услугите, ~92% общо
node checks/ex2.mjs && node checks/ex3.mjs && node checks/ex4.mjs
node mcp-server/check.mjs -- npm run --silent mcp
docker build -t webdev-check .   # Docker image-ът, както в CI
```

## 4. Деплой (Render + Neon)

1. `git push` → в GitHub, Actions: CI трябва да е зелен.
2. **Neon** (neon.tech): нов проект, регион Frankfurt. Копирай connection string-а и пусни миграциите от лаптопа:
   ```bash
   DATABASE_URL='<neon>' npm run db:setup
   ```
3. **Gemini** (резервът): ключ от aistudio.google.com → само в Render.
4. **Render** (render.com): New → Web Service → репото → Runtime **Docker**, Region **Frankfurt**, Plan **Free**,
   Health Check Path `/health`, Auto-Deploy „After CI Checks Pass“. Променливи:
   | Име | Стойност |
   | --- | --- |
   | `DATABASE_URL` | connection string-ът от Neon |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
   | `BETTER_AUTH_URL` | `https://<името>.onrender.com` |
   | `GEMINI_API_KEY` | ключът от AI Studio |
   | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | по желание |
   | `OLLAMA_URL` | **празно** |
5. `course.json` → `"liveUrl": "https://<името>.onrender.com"` (без `/` накрая); същото в `READINESS.md`.
6. Google Cloud → OAuth клиента → redirect URI `https://<името>.onrender.com/api/auth/callback/google`.
7. Регистрирай се на живия сайт и стани админ: `DATABASE_URL='<neon>' npm run make-admin -- твоя@имейл`.
8. Демо с модела: на лаптопа `ollama serve` и `DATABASE_URL='<neon>' npm run worker`.
9. Доказателства за Упражнение 4: `/health` 200, после 503 с грешен `DATABASE_URL`, rollback към предишен deploy,
   грешен JSON → 400, запис без вход → 401, втори акаунт трие чужди данни → 403, данните оцеляват след redeploy.
