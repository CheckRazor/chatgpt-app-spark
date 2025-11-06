-- Create v2 of weighted distribution with alt→main aggregation and zero-leftover guarantee
CREATE OR REPLACE FUNCTION public.run_weighted_distribution_v2(
  event_uuid uuid,
  medal_uuid uuid,
  actor uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
  leftover numeric(30,0);
  realloc_round integer := 0;
  max_realloc_rounds integer := 10;
BEGIN
  -- Lock and read event totals
  SELECT
    total_amount::numeric(30,0),
    COALESCE(raffle_amount_used, 0)::numeric(30,0),
    COALESCE(distributed_amount, 0)::numeric(30,0),
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

  -- Create temp table for distribution with alt→main aggregation
  CREATE TEMP TABLE IF NOT EXISTS temp_distribution (
    main_id uuid,
    score_sum numeric(30,0),
    raw_share numeric(30,0),
    share numeric(30,0),
    fractional numeric(10,6),
    is_capped boolean DEFAULT false
  ) ON COMMIT DROP;

  -- Aggregate scores by main player (alts roll up to mains)
  INSERT INTO temp_distribution (main_id, score_sum)
  SELECT 
    COALESCE(p.main_player_id, p.id) AS main_id,
    SUM(s.score::numeric(30,0)) AS score_sum
  FROM public.scores s
  JOIN public.players p ON p.id = s.player_id
  WHERE s.event_id = event_uuid
    AND s.score >= min_score_threshold
    AND s.verified = true
  GROUP BY COALESCE(p.main_player_id, p.id);

  -- Calculate sum of all qualified scores
  SELECT COALESCE(SUM(score_sum), 0) INTO sum_scores FROM temp_distribution;

  IF sum_scores = 0 THEN
    DROP TABLE IF EXISTS temp_distribution;
    RETURN jsonb_build_object(
      'status', 'noop',
      'reason', 'no_scores',
      'remaining', remaining
    );
  END IF;

  -- Calculate initial proportional shares with cap
  UPDATE temp_distribution
  SET 
    raw_share = (score_sum::numeric / sum_scores) * remaining,
    share = LEAST(FLOOR((score_sum::numeric / sum_scores) * remaining), cap_amount),
    fractional = LEAST((score_sum::numeric / sum_scores) * remaining, cap_amount) 
                 - FLOOR(LEAST((score_sum::numeric / sum_scores) * remaining, cap_amount)),
    is_capped = FLOOR((score_sum::numeric / sum_scores) * remaining) > cap_amount;

  -- Water-fill reallocation (respecting cap)
  leftover := remaining - (SELECT COALESCE(SUM(share), 0) FROM temp_distribution);
  
  WHILE leftover > 0 AND realloc_round < max_realloc_rounds LOOP
    DECLARE
      total_residual numeric(30,0);
      delta_allocated numeric(30,0) := 0;
    BEGIN
      -- Calculate total residual from under-cap accounts
      SELECT COALESCE(SUM(LEAST(cap_amount - share, LEAST(raw_share, cap_amount) - share)), 0)
      INTO total_residual
      FROM temp_distribution
      WHERE share < cap_amount AND share < raw_share;

      EXIT WHEN total_residual = 0 OR leftover = 0;

      -- Allocate proportionally to under-cap accounts
      FOR player_record IN
        SELECT main_id,
               LEAST(cap_amount - share, LEAST(raw_share, cap_amount) - share) AS residual,
               share,
               cap_amount
        FROM temp_distribution
        WHERE share < cap_amount AND share < raw_share
      LOOP
        DECLARE
          delta numeric(30,0);
        BEGIN
          delta := FLOOR(leftover * player_record.residual / total_residual);
          
          -- Ensure we don't exceed cap
          delta := LEAST(delta, cap_amount - player_record.share);
          
          IF delta > 0 THEN
            UPDATE temp_distribution
            SET share = share + delta,
                is_capped = (share + delta >= cap_amount)
            WHERE main_id = player_record.main_id;
            
            delta_allocated := delta_allocated + delta;
          END IF;
        END;
      END LOOP;

      leftover := leftover - delta_allocated;
      realloc_round := realloc_round + 1;

      EXIT WHEN delta_allocated = 0;
    END;
  END LOOP;

  -- Largest-remainders pass for rounding dust
  WHILE leftover > 0 LOOP
    DECLARE
      top_fractional_player uuid;
    BEGIN
      -- Find under-cap player with largest fractional
      SELECT main_id INTO top_fractional_player
      FROM temp_distribution
      WHERE share < cap_amount
      ORDER BY fractional DESC, score_sum DESC
      LIMIT 1;

      EXIT WHEN top_fractional_player IS NULL;

      -- Add 1 medal to this player
      UPDATE temp_distribution
      SET share = share + 1,
          fractional = 0,
          is_capped = (share + 1 >= cap_amount)
      WHERE main_id = top_fractional_player;

      leftover := leftover - 1;
    END;
  END LOOP;

  -- Count capped players
  SELECT COUNT(*) INTO capped_count FROM temp_distribution WHERE is_capped;

  -- Insert ledger transactions for each main player
  FOR player_record IN
    SELECT main_id, share FROM temp_distribution WHERE share > 0
  LOOP
    INSERT INTO public.ledger_transactions (
      player_id,
      medal_id,
      amount,
      transaction_type,
      event_id,
      description,
      created_by
    ) VALUES (
      player_record.main_id,
      medal_uuid,
      player_record.share,
      'weighted_distribution',
      event_uuid,
      'Avalon 50% score-based distribution (alt→main, cap reallocation)',
      actor
    );

    total_distributed := total_distributed + player_record.share;
    player_count := player_count + 1;
  END LOOP;

  -- Update distributed amount
  UPDATE public.event_totals
  SET distributed_amount = already_distributed + total_distributed
  WHERE event_id = event_uuid AND medal_id = medal_uuid;

  -- Clean up
  DROP TABLE IF EXISTS temp_distribution;

  -- Return summary
  RETURN jsonb_build_object(
    'status', 'ok',
    'players', player_count,
    'remaining_before', remaining::text,
    'distributed_now', total_distributed::text,
    'remaining_after', (remaining - total_distributed)::text,
    'capped_players', capped_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.run_weighted_distribution_v2(uuid, uuid, uuid) TO authenticated;