-- Add fields to event_totals for tracking raffle and weighted distribution amounts
ALTER TABLE public.event_totals 
  ADD COLUMN IF NOT EXISTS raffle_amount_used integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remaining_amount_distributed integer DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN public.event_totals.raffle_amount_used IS '50% of medals used for raffle draws (25M per winner)';
COMMENT ON COLUMN public.event_totals.remaining_amount_distributed IS '50% of medals distributed by weighted score (10% cap per player)';