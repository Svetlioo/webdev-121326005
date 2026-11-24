-- A publisher's note on one class, such as "Отменено". week NULL means every week.
CREATE TABLE IF NOT EXISTS notes (
  id         bigserial PRIMARY KEY,
  entry_id   bigint NOT NULL REFERENCES entries (id) ON DELETE CASCADE,
  week       smallint CHECK (week BETWEEN 1 AND 15),
  text       text NOT NULL CHECK (length(text) BETWEEN 1 AND 500),
  created_by text NOT NULL REFERENCES "user" ("id"),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One import of a schedule, and the queue the worker reads. The model's draft classes stay
-- in `draft` until a publisher presses "Publish"; only then are rows written to entries.
CREATE TABLE IF NOT EXISTS imports (
  id           bigserial PRIMARY KEY,
  status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'ready', 'failed', 'published')),
  source_url   text,
  image        bytea,
  image_type   text,
  instructions text NOT NULL DEFAULT '',
  draft        jsonb,
  error        text,
  created_by   text NOT NULL REFERENCES "user" ("id"),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK ((source_url IS NULL) <> (image IS NULL)),
  CHECK ((image IS NULL) = (image_type IS NULL))
);
