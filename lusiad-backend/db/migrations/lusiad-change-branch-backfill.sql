-- OPTIONAL data repair. No schema changes. Run manually against your Lusiad DB.
-- Back up first. Stop Lusiad writes while applying; do not change branch names.
-- Only committed changes whose branch_id is NULL are repaired, using the
-- owning commit and confirming that the branch belongs to the same project.
-- Existing non-NULL discrepancies are reported, never guessed or overwritten.

SELECT ch.id, ch.project_id, ch.branch_id AS recorded_branch, c.branch_id AS commit_branch
FROM changes ch
LEFT JOIN commits c ON c.id = ch.commit_id
LEFT JOIN branches b ON b.id = c.branch_id
WHERE ch.commit_id IS NOT NULL AND (
    c.id IS NULL OR b.id IS NULL OR b.project_id <> ch.project_id
    OR (ch.branch_id IS NOT NULL AND ch.branch_id <> c.branch_id));

START TRANSACTION;

UPDATE changes ch
JOIN commits c ON c.id = ch.commit_id
JOIN branches b ON b.id = c.branch_id AND b.project_id = ch.project_id
SET ch.branch_id = c.branch_id
WHERE ch.branch_id IS NULL;

SELECT ROW_COUNT() AS repaired_changes;
COMMIT;

SELECT COUNT(*) AS repairable_committed_changes_still_without_branch
FROM changes ch
JOIN commits c ON c.id = ch.commit_id
JOIN branches b ON b.id = c.branch_id AND b.project_id = ch.project_id
WHERE ch.branch_id IS NULL;
