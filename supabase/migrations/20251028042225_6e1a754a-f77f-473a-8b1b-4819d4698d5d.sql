-- Add raw_score_text column to ocr_rows for storing original comma-formatted numbers
ALTER TABLE ocr_rows ADD COLUMN IF NOT EXISTS raw_score_text text;

-- Add admin setting for strict name/score mode
INSERT INTO admin_settings (key, value, updated_by) 
VALUES ('ocr_strict_mode', 'true', (SELECT id FROM auth.users LIMIT 1))
ON CONFLICT (key) DO NOTHING;