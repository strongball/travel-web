create or replace function public.apply_assistant_operations(
  p_thread_id uuid,
  p_turn_id uuid,
  p_itinerary_id uuid,
  p_expected_revisions jsonb,
  p_after_snapshot jsonb,
  p_proposed_todos jsonb,
  p_proposed_categories jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  user_message public.assistant_messages%rowtype;
  execution_status text;
  day_json jsonb;
  attraction_json jsonb;
  day_id uuid;
  attraction_id uuid;
  expected_revision bigint;
  actual_revision bigint;
  desired_attraction_ids uuid[] := array[]::uuid[];
  todo_json jsonb;
  category_json jsonb;
begin
  if jsonb_typeof(p_expected_revisions) <> 'object'
    or jsonb_typeof(p_after_snapshot) <> 'array'
    or jsonb_typeof(p_proposed_todos) <> 'array'
    or jsonb_typeof(p_proposed_categories) <> 'array' then
    raise exception 'Invalid assistant operations payload' using errcode = '22023';
  end if;

  select message.* into user_message
  from public.assistant_messages message
  join public.assistant_threads thread on thread.id = message.thread_id
  where message.thread_id = p_thread_id
    and message.turn_id = p_turn_id
    and message.role = 'user'
    and thread.itinerary_id = p_itinerary_id
    and thread.owner_id = (select auth.uid())
  for update of message;

  if not found then
    raise exception 'Assistant turn not found' using errcode = 'P0002';
  end if;

  execution_status := user_message.metadata #>> '{proposal_execution,status}';
  if execution_status in ('applied', 'expired') then
    return jsonb_build_object('status', execution_status, 'turn_id', p_turn_id);
  end if;

  for day_json in select value from jsonb_array_elements(p_after_snapshot)
  loop
    day_id := (day_json->>'id')::uuid;
    expected_revision := (p_expected_revisions->>day_id::text)::bigint;
    select revision into actual_revision
    from public.days
    where id = day_id and itinerary_id = p_itinerary_id
    for update;
    if not found or expected_revision is null or actual_revision <> expected_revision then
      update public.assistant_messages
      set metadata = jsonb_set(metadata, '{proposal_execution}', jsonb_build_object('status', 'expired'), true)
      where id = user_message.id;
      return jsonb_build_object('status', 'expired', 'turn_id', p_turn_id);
    end if;
  end loop;

  for day_json in select value from jsonb_array_elements(p_after_snapshot)
  loop
    day_id := (day_json->>'id')::uuid;
    update public.days
    set start_time = nullif(day_json->>'startTime', '')::timestamptz
    where id = day_id and itinerary_id = p_itinerary_id;

    for attraction_json in select value from jsonb_array_elements(coalesce(day_json->'attractions', '[]'::jsonb))
    loop
      attraction_id := (attraction_json->>'id')::uuid;
      desired_attraction_ids := array_append(desired_attraction_ids, attraction_id);
      if btrim(coalesce(attraction_json->>'name', '')) = ''
        or coalesce((attraction_json->>'duration')::integer, 0) < 0
        or (attraction_json->>'transportMode') is not null
          and (attraction_json->>'transportMode') not in ('driving', 'walking', 'transit', 'bicycling') then
        raise exception 'Invalid assistant attraction' using errcode = '22023';
      end if;

      insert into public.attractions (
        id, day_id, name, description, start_time, end_time, cost, location,
        duration, transport_mode, travel_time, place_id, location_name
      ) values (
        attraction_id,
        day_id,
        btrim(attraction_json->>'name'),
        nullif(btrim(coalesce(attraction_json->>'description', '')), ''),
        nullif(attraction_json->>'startTime', '')::timestamptz,
        nullif(attraction_json->>'endTime', '')::timestamptz,
        greatest(coalesce((attraction_json->>'cost')::double precision, 0), 0),
        case when attraction_json->>'longitude' is not null and attraction_json->>'latitude' is not null
          then extensions.st_setsrid(extensions.st_makepoint(
            (attraction_json->>'longitude')::double precision,
            (attraction_json->>'latitude')::double precision
          ), 4326)::extensions.geography else null end,
        coalesce((attraction_json->>'duration')::integer, 60),
        attraction_json->>'transportMode',
        case when attraction_json->>'travelTime' is null then null
          else greatest((attraction_json->>'travelTime')::integer, 0) end,
        nullif(attraction_json->>'placeId', ''),
        nullif(attraction_json->>'locationName', '')
      )
      on conflict (id) do update set
        day_id = excluded.day_id,
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
  end loop;

  delete from public.attractions attraction
  using public.days day
  where attraction.day_id = day.id
    and day.itinerary_id = p_itinerary_id
    and day.id in (
      select (value->>'id')::uuid from jsonb_array_elements(p_after_snapshot)
    )
    and not (attraction.id = any(desired_attraction_ids));

  for category_json in select value from jsonb_array_elements(p_proposed_categories)
  loop
    if btrim(coalesce(category_json #>> '{}', '')) = '' then
      raise exception 'Invalid assistant todo category' using errcode = '22023';
    end if;
    update public.itineraries
    set todo_categories = coalesce(todo_categories, array[]::text[]) || (category_json #>> '{}')
    where id = p_itinerary_id
      and not ((category_json #>> '{}') = any(coalesce(todo_categories, array[]::text[])));
  end loop;

  for todo_json in select value from jsonb_array_elements(p_proposed_todos)
  loop
    if btrim(coalesce(todo_json->>'title', '')) = '' then
      raise exception 'Invalid assistant todo' using errcode = '22023';
    end if;
    insert into public.todo_items (id, itinerary_id, content, is_checked, category)
    values (
      extensions.gen_random_uuid(),
      p_itinerary_id,
      btrim(todo_json->>'title'),
      false,
      coalesce(nullif(btrim(todo_json->>'category'), ''), '行前準備')
    );
  end loop;

  update public.assistant_messages
  set metadata = jsonb_set(metadata, '{proposal_execution}', jsonb_build_object('status', 'applied'), true)
  where id = user_message.id;

  return jsonb_build_object('status', 'applied', 'turn_id', p_turn_id);
end;
$$;

revoke all on function public.apply_assistant_operations(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb) from public;
revoke all on function public.apply_assistant_operations(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb) from anon;
grant execute on function public.apply_assistant_operations(uuid, uuid, uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
