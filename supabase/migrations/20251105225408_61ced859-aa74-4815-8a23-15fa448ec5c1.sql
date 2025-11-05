-- Create server-side RPC for weighted distribution
CREATE OR REPLACE FUNCTION public.run_weighted_distribution_v1(
  event_uuid uuid,
  medal_uuid uuid,
  actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  total_pot numeric(30,0);
  raffle_used numeric(30,0);
  already_distributed numeric(30,0);
  remaining numeric(30,0);
  sum_scores numeric(30,0);
  cap_amount numeric(30,0);
  total_distributed numeric(30,0) := 0;
  capped_count integer := 0;
  player_count integer := 0;
  min_score_threshold integer;
  player_record record;
BEGIN
  -- Lock and read event totals
  SELECT
    total_amount,
    COALESCE(raffle_amount_used, 0),
    COALESCE(distributed_amount, 0),
    COALESCE(min_score_for_raffle, 0)
  INTO total_pot, raffle_used, already_distributed, min_score_threshold
  FROM public.event_totals
  WHERE event_id = event_uuid AND medal_id = medal_uuid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Event totals not found for event_id=% medal_id=%', event_uuid, medal_uuid;
  END IF;

  -- Calculate remaining medals
  remaining := total_pot - raffle_used - already_distributed;

  IF remaining <= 0 THEN
    RETURN jsonb_build_object(
      'status', 'noop',
      'reason', 'no_remaining',
      'remaining', 0
    );
  END IF;

  -- Calculate 10% cap
  cap_amount := FLOOR(remaining * 0.10);

  -- Calculate sum of all qualified scores
  SELECT COALESCE(SUM(score), 0)
  INTO sum_scores
  FROM public.scores
  WHERE event_id = event_uuid
    AND score >= min_score_threshold
    AND verified = true;

  IF sum_scores = 0 THEN
    RETURN jsonb_build_object(
      'status', 'noop',
      'reason', 'no_scores',
      'remaining', remaining
    );
  END IF;

  -- Distribute to each qualified player
  FOR player_record IN
    SELECT player_id, score
    FROM public.scores
    WHERE event_id = event_uuid
      AND score >= min_score_threshold
      AND verified = true
    ORDER BY player_id
  LOOP
    DECLARE
      raw_share numeric(30,0);
      capped_share numeric(30,0);
    BEGIN
      -- Calculate proportional share
      raw_share := FLOOR((player_record.score::numeric / sum_scores) * remaining);
      
      -- Apply 10% cap
      capped_share := LEAST(raw_share, cap_amount);

      IF capped_share > 0 THEN
        -- Insert ledger transaction
        INSERT INTO public.ledger_transactions (
          player_id,
          medal_id,
          amount,
          transaction_type,
          event_id,
          description,
          created_by
        ) VALUES (
          player_record.player_id,
          medal_uuid,
          capped_share,
          'weighted_distribution',
          event_uuid,
          'Score-based distribution (50% pot, 10% cap)',
          actor
        );

        total_distributed := total_distributed + capped_share;
        player_count := player_count + 1;

        IF capped_share < raw_share THEN
          capped_count := capped_count + 1;
        END IF;
      END IF;
    END;
  END LOOP;

  -- Update distributed amount
  UPDATE public.event_totals
  SET distributed_amount = already_distributed + total_distributed
  WHERE event_id = event_uuid AND medal_id = medal_uuid;

  -- Return summary
  RETURN jsonb_build_object(
    'status', 'ok',
    'players', player_count,
    'remaining_before', remaining,
    'distributed_now', total_distributed,
    'remaining_after', remaining - total_distributed,
    'capped_players', capped_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_weighted_distribution_v1(uuid, uuid, uuid) TO authenticated;