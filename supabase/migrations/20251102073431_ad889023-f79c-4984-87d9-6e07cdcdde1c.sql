-- Create function to safely upsert scores with very large numbers (BIGINT support)
create or replace function public.upsert_scores_big_v2(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  committed int := 0;
  skipped   int := 0;
begin
  -- expect payload to be a JSON array
  if jsonb_typeof(payload) <> 'array' then
    raise exception 'payload must be a JSON array';
  end if;

  for item in
    select * from jsonb_array_elements(payload)
  loop
    -- extract as text so we never hit int4
    -- event_id / player_id / created_by must be real uuids in the JSON
    begin
      insert into public.scores (
        event_id,
        player_id,
        score,
        raw_score,
        verified,
        created_by
      )
      values (
        (item->>'event_id')::uuid,
        (item->>'player_id')::uuid,
        (item->>'score')::numeric,      -- numeric(30,0)
        (item->>'raw_score')::numeric,  -- numeric(30,0)
        coalesce((item->>'verified')::boolean, true),
        (item->>'created_by')::uuid
      )
      on conflict (event_id, player_id)
      do update set
        score      = excluded.score,
        raw_score  = excluded.raw_score,
        verified   = excluded.verified,
        updated_at = now();

      committed := committed + 1;
    exception
      when others then
        -- if one row is bad, just skip it and continue
        skipped := skipped + 1;
    end;
  end loop;

  return jsonb_build_object(
    'committed', committed,
    'skipped',   skipped
  );
end;
$$;

-- Grant execute permissions
grant execute on function public.upsert_scores_big_v2(jsonb) to anon, authenticated;

-- Notify PostgREST to reload schema cache
notify pgrst, 'reload schema';