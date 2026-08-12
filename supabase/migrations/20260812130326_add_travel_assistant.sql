alter table public.days
  add column if not exists revision bigint not null default 0;

create table public.assistant_threads (
  id uuid primary key default gen_random_uuid(),
  itinerary_id uuid not null references public.itineraries(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '新對話' check (char_length(btrim(title)) between 1 and 120),
  summary text not null default '',
  summary_through_message_id uuid,
  graph_version integer not null default 1,
  latest_checkpoint_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.assistant_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.assistant_threads(id) on delete cascade,
  turn_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(btrim(content)) > 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique (thread_id, turn_id, role)
);

create table public.assistant_proposals (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.assistant_threads(id) on delete cascade,
  turn_id uuid not null,
  itinerary_id uuid not null references public.itineraries(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected', 'expired')),
  before_snapshot jsonb not null check (jsonb_typeof(before_snapshot) = 'array'),
  after_snapshot jsonb not null check (jsonb_typeof(after_snapshot) = 'array'),
  expected_revisions jsonb not null check (jsonb_typeof(expected_revisions) = 'object'),
  change_summary text not null default '',
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (thread_id, turn_id)
);

create table public.assistant_graph_checkpoints (
  thread_id uuid not null references public.assistant_threads(id) on delete cascade,
  checkpoint_ns text not null default '',
  checkpoint_id text not null,
  parent_checkpoint_id text,
  checkpoint_type text not null,
  checkpoint_payload text not null,
  metadata_type text not null,
  metadata_payload text not null,
  turn_id uuid,
  created_at timestamptz not null default now(),
  primary key (thread_id, checkpoint_ns, checkpoint_id)
);

create table public.assistant_graph_writes (
  thread_id uuid not null references public.assistant_threads(id) on delete cascade,
  checkpoint_ns text not null default '',
  checkpoint_id text not null,
  task_id text not null,
  idx integer not null,
  channel text not null,
  value_type text not null,
  value_payload text not null,
  created_at timestamptz not null default now(),
  primary key (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

create index assistant_threads_itinerary_updated_idx
  on public.assistant_threads (itinerary_id, updated_at desc);
create index assistant_messages_thread_created_idx
  on public.assistant_messages (thread_id, created_at);
create index assistant_proposals_thread_status_idx
  on public.assistant_proposals (thread_id, status, created_at desc);
create index assistant_graph_checkpoints_history_idx
  on public.assistant_graph_checkpoints (thread_id, checkpoint_ns, created_at desc);

alter table public.assistant_threads enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.assistant_proposals enable row level security;
alter table public.assistant_graph_checkpoints enable row level security;
alter table public.assistant_graph_writes enable row level security;

grant select, insert, update, delete on public.assistant_threads to authenticated;
grant select, insert, update, delete on public.assistant_messages to authenticated;
grant select, insert, update, delete on public.assistant_proposals to authenticated;
grant select, insert, update, delete on public.assistant_graph_checkpoints to authenticated;
grant select, insert, update, delete on public.assistant_graph_writes to authenticated;

create policy "Owners manage assistant threads"
on public.assistant_threads for all to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.itineraries itinerary
    where itinerary.id = assistant_threads.itinerary_id and itinerary.owner_id = (select auth.uid())
  )
);

create policy "Owners manage assistant messages"
on public.assistant_messages for all to authenticated
using (exists (
  select 1 from public.assistant_threads thread
  where thread.id = assistant_messages.thread_id and thread.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.assistant_threads thread
  where thread.id = assistant_messages.thread_id and thread.owner_id = (select auth.uid())
));

create policy "Owners manage assistant proposals"
on public.assistant_proposals for all to authenticated
using (exists (
  select 1 from public.assistant_threads thread
  where thread.id = assistant_proposals.thread_id and thread.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.assistant_threads thread
  where thread.id = assistant_proposals.thread_id
    and thread.owner_id = (select auth.uid())
    and thread.itinerary_id = assistant_proposals.itinerary_id
));

create policy "Owners manage assistant checkpoints"
on public.assistant_graph_checkpoints for all to authenticated
using (exists (
  select 1 from public.assistant_threads thread
  where thread.id = assistant_graph_checkpoints.thread_id and thread.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.assistant_threads thread
  where thread.id = assistant_graph_checkpoints.thread_id and thread.owner_id = (select auth.uid())
));

create policy "Owners manage assistant checkpoint writes"
on public.assistant_graph_writes for all to authenticated
using (exists (
  select 1 from public.assistant_threads thread
  where thread.id = assistant_graph_writes.thread_id and thread.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.assistant_threads thread
  where thread.id = assistant_graph_writes.thread_id and thread.owner_id = (select auth.uid())
));

create or replace function public.touch_assistant_thread()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger touch_assistant_thread_updated_at
before update on public.assistant_threads
for each row execute function public.touch_assistant_thread();

create or replace function public.bump_day_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_day_id uuid;
begin
  target_day_id := coalesce(new.day_id, old.day_id);
  update public.days set revision = revision + 1 where id = target_day_id;
  if tg_op = 'UPDATE' and old.day_id is distinct from new.day_id then
    update public.days set revision = revision + 1 where id = old.day_id;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger bump_day_revision_from_attractions
after insert or update or delete on public.attractions
for each row execute function public.bump_day_revision();

create or replace function public.bump_day_own_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.revision = old.revision + 1;
  return new;
end;
$$;

create trigger bump_day_revision_from_day
before update of date, start_time on public.days
for each row
when (old.date is distinct from new.date or old.start_time is distinct from new.start_time)
execute function public.bump_day_own_revision();

create or replace function public.assistant_put_checkpoint(
  p_thread_id uuid,
  p_checkpoint_ns text,
  p_checkpoint_id text,
  p_parent_checkpoint_id text,
  p_checkpoint_type text,
  p_checkpoint_payload text,
  p_metadata_type text,
  p_metadata_payload text,
  p_turn_id uuid,
  p_expected_latest_checkpoint_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_latest text;
begin
  select latest_checkpoint_id into current_latest
  from public.assistant_threads
  where id = p_thread_id and owner_id = (select auth.uid())
  for update;

  if not found then
    raise exception 'Assistant thread not found' using errcode = 'P0002';
  end if;
  if current_latest is distinct from p_expected_latest_checkpoint_id then
    raise exception 'Assistant thread changed on another device' using errcode = '40001';
  end if;

  insert into public.assistant_graph_checkpoints (
    thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id,
    checkpoint_type, checkpoint_payload, metadata_type, metadata_payload, turn_id
  ) values (
    p_thread_id, coalesce(p_checkpoint_ns, ''), p_checkpoint_id, p_parent_checkpoint_id,
    p_checkpoint_type, p_checkpoint_payload, p_metadata_type, p_metadata_payload, p_turn_id
  )
  on conflict (thread_id, checkpoint_ns, checkpoint_id) do nothing;

  update public.assistant_threads
  set latest_checkpoint_id = p_checkpoint_id
  where id = p_thread_id;

  return jsonb_build_object('checkpoint_id', p_checkpoint_id);
end;
$$;

revoke all on function public.assistant_put_checkpoint(uuid, text, text, text, text, text, text, text, uuid, text) from public;
grant execute on function public.assistant_put_checkpoint(uuid, text, text, text, text, text, text, text, uuid, text) to authenticated;

create or replace function public.apply_assistant_proposal(p_proposal_id uuid, p_approved boolean)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  proposal public.assistant_proposals%rowtype;
  day_json jsonb;
  attraction_json jsonb;
  day_id uuid;
  attraction_id uuid;
  expected_revision bigint;
  actual_revision bigint;
  desired_attraction_ids uuid[] := array[]::uuid[];
begin
  select p.* into proposal
  from public.assistant_proposals p
  join public.assistant_threads thread on thread.id = p.thread_id
  where p.id = p_proposal_id and thread.owner_id = (select auth.uid())
  for update of p;

  if not found then
    raise exception 'Assistant proposal not found' using errcode = 'P0002';
  end if;
  if proposal.status = 'applied' then
    return jsonb_build_object('status', 'applied', 'proposal_id', proposal.id);
  end if;
  if proposal.status <> 'pending' then
    return jsonb_build_object('status', proposal.status, 'proposal_id', proposal.id);
  end if;
  if not p_approved then
    update public.assistant_proposals set status = 'rejected' where id = proposal.id;
    return jsonb_build_object('status', 'rejected', 'proposal_id', proposal.id);
  end if;

  for day_json in select value from jsonb_array_elements(proposal.after_snapshot)
  loop
    day_id := (day_json->>'id')::uuid;
    expected_revision := (proposal.expected_revisions->>day_id::text)::bigint;
    select revision into actual_revision
    from public.days
    where id = day_id and itinerary_id = proposal.itinerary_id
    for update;
    if not found or expected_revision is null or actual_revision <> expected_revision then
      update public.assistant_proposals set status = 'expired' where id = proposal.id;
      return jsonb_build_object('status', 'expired', 'proposal_id', proposal.id);
    end if;
  end loop;

  for day_json in select value from jsonb_array_elements(proposal.after_snapshot)
  loop
    day_id := (day_json->>'id')::uuid;
    update public.days
    set start_time = nullif(day_json->>'startTime', '')::timestamptz
    where id = day_id and itinerary_id = proposal.itinerary_id;

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
    and day.itinerary_id = proposal.itinerary_id
    and day.id in (
      select (value->>'id')::uuid from jsonb_array_elements(proposal.after_snapshot)
    )
    and not (attraction.id = any(desired_attraction_ids));

  update public.assistant_proposals
  set status = 'applied', applied_at = now()
  where id = proposal.id;

  return jsonb_build_object('status', 'applied', 'proposal_id', proposal.id);
end;
$$;

revoke all on function public.apply_assistant_proposal(uuid, boolean) from public;
grant execute on function public.apply_assistant_proposal(uuid, boolean) to authenticated;
