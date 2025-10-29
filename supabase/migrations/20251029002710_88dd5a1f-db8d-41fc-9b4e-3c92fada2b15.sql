-- Add unique constraint on scores table for proper UPSERT
CREATE UNIQUE INDEX IF NOT EXISTS uq_scores_event_player 
ON scores(event_id, player_id);