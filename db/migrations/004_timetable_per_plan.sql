-- Every student keeps their own timetable inside a plan: there is no shared schedule and no
-- publisher any more. A plan's classes come from an import (a photo or a page) or from the
-- sample timetable; an admin may see and change every plan.
UPDATE "user" SET role = 'student' WHERE role = 'publisher';
ALTER TABLE "user" DROP CONSTRAINT IF EXISTS user_role_check;
ALTER TABLE "user" ADD CONSTRAINT user_role_check CHECK ("role" IN ('student', 'admin'));

-- The old shared classes (and their notes) belonged to nobody; plans start fresh.
DELETE FROM entries;
ALTER TABLE entries ADD COLUMN plan_id bigint NOT NULL REFERENCES plans (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS entries_plan_idx ON entries (plan_id);

DELETE FROM imports;
ALTER TABLE imports ADD COLUMN plan_id bigint NOT NULL REFERENCES plans (id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS imports_plan_idx ON imports (plan_id);
