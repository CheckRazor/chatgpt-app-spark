-- Ensure unique constraint for UPSERT
CREATE UNIQUE INDEX IF NOT EXISTS uq_scores_event_player ON scores(event_id, player_id);

-- Convert raw_score to BIGINT (if it exists as integer)
ALTER TABLE scores ALTER COLUMN raw_score TYPE BIGINT USING raw_score::BIGINT;

-- Add BIGINT parsed score to ocr_rows
ALTER TABLE ocr_rows ADD COLUMN IF NOT EXISTS parsed_score_big BIGINT;