-- Post-restore normalization for leaderboard consistency
-- Run against quiz_platform after importing external SQL backups.

SET SESSION sql_mode='';
SET FOREIGN_KEY_CHECKS=0;

-- Ensure soft-deleted records are visible unless explicitly deleted by app logic.
UPDATE scores
SET deletedAt = NULL
WHERE deletedAt IS NOT NULL;

-- Normalize official flag and attempt numbers to valid values.
UPDATE scores
SET isOfficial = 1
WHERE isOfficial IS NULL OR isOfficial <> 1;

UPDATE scores
SET attemptNumber = 1
WHERE attemptNumber IS NULL OR attemptNumber < 1;

SET FOREIGN_KEY_CHECKS=1;
