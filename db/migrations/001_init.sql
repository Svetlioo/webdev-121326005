-- Better Auth's tables, generated with `npx auth generate` from src/auth.ts.
-- Passwords are hashed (scrypt) in account.password; a session is a row here, so
-- deleting it signs the user out on the next request.
CREATE TABLE IF NOT EXISTS "user" (
  "id" text NOT NULL PRIMARY KEY,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL,
  "image" text,
  "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "role" text NOT NULL DEFAULT 'student' CHECK ("role" IN ('student', 'publisher'))
);

CREATE TABLE IF NOT EXISTS "session" (
  "id" text NOT NULL PRIMARY KEY,
  "expiresAt" timestamptz NOT NULL,
  "token" text NOT NULL UNIQUE,
  "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  "id" text NOT NULL PRIMARY KEY,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "userId" text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope" text,
  "password" text,
  "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text NOT NULL PRIMARY KEY,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "updatedAt" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");

-- One class in the weekly grid. day: 1 = Monday ... 6 = Saturday.
CREATE TABLE IF NOT EXISTS entries (
  id         bigserial PRIMARY KEY,
  course     text NOT NULL,
  type       text NOT NULL CHECK (type IN ('lecture', 'seminar', 'lab')),
  day        smallint NOT NULL CHECK (day BETWEEN 1 AND 6),
  starts_at  time NOT NULL,
  ends_at    time NOT NULL CHECK (ends_at > starts_at),
  room       text NOT NULL,
  start_week smallint NOT NULL DEFAULT 1
);

-- Which groups attend a class, and in which weeks. A split cell in the official schedule
-- is one lab that 221а takes in odd weeks and 221б in even weeks: two rows here.
CREATE TABLE IF NOT EXISTS entry_groups (
  entry_id   bigint NOT NULL REFERENCES entries (id) ON DELETE CASCADE,
  group_name text NOT NULL,
  parity     text NOT NULL DEFAULT 'all' CHECK (parity IN ('all', 'odd', 'even')),
  PRIMARY KEY (entry_id, group_name)
);
