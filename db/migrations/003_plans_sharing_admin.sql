-- Roles: an admin may do everything a publisher may, and is the only one who changes roles.
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS user_role_check;
ALTER TABLE "user" ADD CONSTRAINT user_role_check CHECK ("role" IN ('student', 'publisher', 'admin'));

-- A student's own plan: a group of the published schedule, plus their busy time windows.
-- windows_from says where the windows came from: the plain parser ('parser') or the model ('model').
-- model_status is the worker's queue: a new source or message sets it to 'queued'.
CREATE TABLE IF NOT EXISTS plans (
  id           bigserial PRIMARY KEY,
  owner_id     text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  name         text NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  group_name   text NOT NULL,
  windows      jsonb NOT NULL DEFAULT '[]',
  windows_from text NOT NULL DEFAULT 'parser' CHECK (windows_from IN ('parser', 'model')),
  model_status text NOT NULL DEFAULT 'idle' CHECK (model_status IN ('idle', 'queued', 'processing', 'failed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plans_owner_idx ON plans (owner_id);

-- What the plan is built from: an instruction in plain words, or a photo.
CREATE TABLE IF NOT EXISTS plan_sources (
  id         bigserial PRIMARY KEY,
  plan_id    bigint NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
  text       text CHECK (length(text) BETWEEN 1 AND 1000),
  image      bytea,
  image_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((text IS NULL) <> (image IS NULL)),
  CHECK ((image IS NULL) = (image_type IS NULL))
);

-- The chat: the student's messages and the model's replies.
CREATE TABLE IF NOT EXISTS plan_messages (
  id         bigserial PRIMARY KEY,
  plan_id    bigint NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user', 'assistant')),
  content    text NOT NULL CHECK (length(content) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plan_messages_plan_idx ON plan_messages (plan_id, id);

-- Who else may read a plan. Only reading: the owner is the only one who changes it.
CREATE TABLE IF NOT EXISTS plan_shares (
  plan_id    bigint NOT NULL REFERENCES plans (id) ON DELETE CASCADE,
  user_id    text NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, user_id)
);
