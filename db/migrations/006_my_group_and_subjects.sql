-- A plan has the student's own group, and a choice for each subject ("course|type"): the group whose
-- sessions they attend, or null for "not taken". A subject with no choice follows the student's group.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS my_group text;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS subjects jsonb NOT NULL DEFAULT '{}';
UPDATE plans SET my_group = groups[1] WHERE cardinality(groups) > 0;
ALTER TABLE plans DROP COLUMN IF EXISTS groups;
