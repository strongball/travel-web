create or replace function public.save_full_itinerary(
  p_itinerary jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_itinerary_id uuid;
  v_title text;
  v_currency text;
  v_start_date timestamptz;
  v_end_date timestamptz;
  v_exchange_rates jsonb;
  v_todo_categories text[];
  v_desired_day_ids uuid[] := array[]::uuid[];
  v_day_record jsonb;
  v_day_id uuid;
  v_desired_attraction_ids uuid[] := array[]::uuid[];
  v_attraction_record jsonb;
  v_attraction_id uuid;
begin
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_itinerary is null or jsonb_typeof(p_itinerary) <> 'object' then
    raise exception 'Invalid itinerary payload' using errcode = '22023';
  end if;

  v_itinerary_id := (p_itinerary->>'id')::uuid;
  if v_itinerary_id is null then
    raise exception 'Itinerary ID is required' using errcode = '22023';
  end if;

  v_title := btrim(coalesce(p_itinerary->>'title', ''));
  if v_title = '' then
    raise exception 'Itinerary title cannot be empty' using errcode = '22023';
  end if;

  v_currency := coalesce(p_itinerary->>'currency', 'TWD');
  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'Invalid currency code' using errcode = '22023';
  end if;

  -- Verify ownership if the itinerary already exists
  if exists (
    select 1 from public.itineraries
    where id = v_itinerary_id and owner_id <> v_user_id
  ) then
    raise exception 'Itinerary access denied' using errcode = '42501';
  end if;

  v_start_date := nullif(p_itinerary->>'startDate', '')::timestamptz;
  v_end_date := nullif(p_itinerary->>'endDate', '')::timestamptz;
  v_exchange_rates := coalesce(p_itinerary->'exchangeRates', '{}'::jsonb);

  if jsonb_typeof(p_itinerary->'todoCategories') = 'array' then
    select coalesce(array_agg(value #>> '{}'), array[]::text[])
    into v_todo_categories
    from jsonb_array_elements(p_itinerary->'todoCategories');
  else
    v_todo_categories := array[]::text[];
  end if;

  -- 1. Upsert itinerary
  insert into public.itineraries (
    id,
    owner_id,
    title,
    start_date,
    end_date,
    currency,
    exchange_rates,
    todo_categories
  ) values (
    v_itinerary_id,
    v_user_id,
    v_title,
    v_start_date,
    v_end_date,
    v_currency,
    v_exchange_rates,
    v_todo_categories
  )
  on conflict (id) do update set
    title = excluded.title,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    currency = excluded.currency,
    exchange_rates = excluded.exchange_rates,
    todo_categories = excluded.todo_categories;

  -- 2. Process days
  if jsonb_typeof(p_itinerary->'days') = 'array' then
    select coalesce(array_agg((value->>'id')::uuid), array[]::uuid[])
    into v_desired_day_ids
    from jsonb_array_elements(p_itinerary->'days');

    -- Delete days that were removed
    delete from public.days
    where itinerary_id = v_itinerary_id
      and not (id = any(v_desired_day_ids));

    for v_day_record in select value from jsonb_array_elements(p_itinerary->'days')
    loop
      v_day_id := (v_day_record->>'id')::uuid;

      insert into public.days (
        id,
        itinerary_id,
        date,
        start_time
      ) values (
        v_day_id,
        v_itinerary_id,
        (v_day_record->>'date')::date,
        nullif(v_day_record->>'startTime', '')::timestamptz
      )
      on conflict (id) do update set
        date = excluded.date,
        start_time = excluded.start_time;

      -- 3. Process attractions for this day
      if jsonb_typeof(v_day_record->'attractions') = 'array' then
        select coalesce(array_agg((value->>'id')::uuid), array[]::uuid[])
        into v_desired_attraction_ids
        from jsonb_array_elements(v_day_record->'attractions');

        delete from public.attractions
        where day_id = v_day_id
          and not (id = any(v_desired_attraction_ids));

        for v_attraction_record in select value from jsonb_array_elements(v_day_record->'attractions')
        loop
          v_attraction_id := (v_attraction_record->>'id')::uuid;

          insert into public.attractions (
            id,
            day_id,
            name,
            description,
            start_time,
            end_time,
            cost,
            location,
            duration,
            transport_mode,
            travel_time,
            place_id,
            location_name
          ) values (
            v_attraction_id,
            v_day_id,
            btrim(coalesce(v_attraction_record->>'name', '')),
            nullif(btrim(coalesce(v_attraction_record->>'description', '')), ''),
            nullif(v_attraction_record->>'startTime', '')::timestamptz,
            nullif(v_attraction_record->>'endTime', '')::timestamptz,
            greatest(coalesce((v_attraction_record->>'cost')::double precision, 0), 0),
            case
              when v_attraction_record->>'longitude' is not null and v_attraction_record->>'latitude' is not null
              then extensions.st_setsrid(extensions.st_makepoint(
                (v_attraction_record->>'longitude')::double precision,
                (v_attraction_record->>'latitude')::double precision
              ), 4326)::extensions.geography
              else null
            end,
            coalesce((v_attraction_record->>'duration')::integer, 60),
            v_attraction_record->>'transportMode',
            case
              when v_attraction_record->>'travelTime' is null then null
              else greatest((v_attraction_record->>'travelTime')::integer, 0)
            end,
            nullif(v_attraction_record->>'placeId', ''),
            nullif(v_attraction_record->>'locationName', '')
          )
          on conflict (id) do update set
            name = excluded.name,
            description = excluded.description,
            start_time = excluded.start_time,
            end_time = excluded.end_time,
            cost = excluded.cost,
            location = excluded.location,
            duration = excluded.duration,
            transport_mode = excluded.transport_mode,
            travel_time = excluded.travel_time,
            place_id = excluded.place_id,
            location_name = excluded.location_name;
        end loop;
      else
        delete from public.attractions where day_id = v_day_id;
      end if;
    end loop;
  else
    delete from public.days where itinerary_id = v_itinerary_id;
  end if;
end;
$$;

grant execute on function public.save_full_itinerary(jsonb) to authenticated;
revoke all on function public.save_full_itinerary(jsonb) from public, anon;
