-- An import may have a page address and a photo together (at least one of them).
ALTER TABLE imports DROP CONSTRAINT IF EXISTS imports_check;
ALTER TABLE imports ADD CONSTRAINT imports_source_check CHECK (source_url IS NOT NULL OR image IS NOT NULL);

-- A plan follows one or more groups of its timetable (a student may take a class with another group).
-- They are chosen after the timetable is in the plan, so a new plan has none.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS groups text[] NOT NULL DEFAULT '{}';
UPDATE plans SET groups = ARRAY[group_name] WHERE group_name IS NOT NULL;
ALTER TABLE plans DROP COLUMN IF EXISTS group_name;
