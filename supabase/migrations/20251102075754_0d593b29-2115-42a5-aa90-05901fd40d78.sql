-- Change score column from integer to numeric(30,0) to support 1-30 digit scores
ALTER TABLE public.scores 
  ALTER COLUMN score TYPE numeric(30,0) USING score::numeric(30,0);

-- Also ensure raw_score is numeric(30,0) instead of bigint for consistency
ALTER TABLE public.scores 
  ALTER COLUMN raw_score TYPE numeric(30,0) USING raw_score::numeric(30,0);