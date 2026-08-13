-- Keep checkpoint persistence bounded to one full snapshot per
-- (thread_id, checkpoint_ns). Canonical chat history remains in
-- assistant_messages; checkpoints only exist to resume the browser graph.

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
  normalized_ns text := coalesce(p_checkpoint_ns, '');
  current_latest text;
begin
  if not exists (
    select 1 from public.assistant_threads
    where id = p_thread_id and owner_id = (select auth.uid())
  ) then
    raise exception 'Assistant thread not found' using errcode = 'P0002';
  end if;

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(p_thread_id::text || ':' || normalized_ns, 0)
  ) then
    raise exception 'Assistant thread is busy on another device' using errcode = '40001';
  end if;

  select checkpoint_id into current_latest
  from public.assistant_graph_checkpoints
  where thread_id = p_thread_id and checkpoint_ns = normalized_ns
  order by checkpoint_id desc
  limit 1;

  if current_latest is distinct from p_expected_latest_checkpoint_id then
    raise exception 'Assistant thread changed on another device' using errcode = '40001';
  end if;

  insert into public.assistant_graph_checkpoints (
    thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id,
    checkpoint_type, checkpoint_payload, metadata_type, metadata_payload, turn_id
  ) values (
    p_thread_id, normalized_ns, p_checkpoint_id, p_parent_checkpoint_id,
    p_checkpoint_type, p_checkpoint_payload, p_metadata_type, p_metadata_payload, p_turn_id
  );

  if normalized_ns = '' then
    update public.assistant_threads
    set latest_checkpoint_id = p_checkpoint_id
    where id = p_thread_id;
  end if;

  return jsonb_build_object('checkpoint_id', p_checkpoint_id);
end;
$$;

revoke all on function public.assistant_put_checkpoint(uuid, text, text, text, text, text, text, text, uuid, text) from public;
grant execute on function public.assistant_put_checkpoint(uuid, text, text, text, text, text, text, text, uuid, text) to authenticated;

create or replace function public.assistant_replace_checkpoint(
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
  normalized_ns text := coalesce(p_checkpoint_ns, '');
  current_latest text;
begin
  if not exists (
    select 1 from public.assistant_threads
    where id = p_thread_id and owner_id = (select auth.uid())
  ) then
    raise exception 'Assistant thread not found' using errcode = 'P0002';
  end if;

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(p_thread_id::text || ':' || normalized_ns, 0)
  ) then
    raise exception 'Assistant thread is busy on another device' using errcode = '40001';
  end if;

  select checkpoint_id into current_latest
  from public.assistant_graph_checkpoints
  where thread_id = p_thread_id and checkpoint_ns = normalized_ns
  order by checkpoint_id desc
  limit 1;

  if current_latest is distinct from p_expected_latest_checkpoint_id then
    raise exception 'Assistant thread changed on another device' using errcode = '40001';
  end if;

  insert into public.assistant_graph_checkpoints (
    thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id,
    checkpoint_type, checkpoint_payload, metadata_type, metadata_payload, turn_id
  ) values (
    p_thread_id, normalized_ns, p_checkpoint_id, null,
    p_checkpoint_type, p_checkpoint_payload, p_metadata_type, p_metadata_payload, p_turn_id
  );

  delete from public.assistant_graph_writes
  where thread_id = p_thread_id
    and checkpoint_ns = normalized_ns
    and checkpoint_id <> p_checkpoint_id;

  delete from public.assistant_graph_checkpoints
  where thread_id = p_thread_id
    and checkpoint_ns = normalized_ns
    and checkpoint_id <> p_checkpoint_id;

  if normalized_ns = '' then
    update public.assistant_threads
    set latest_checkpoint_id = p_checkpoint_id
    where id = p_thread_id;
  end if;

  return jsonb_build_object('checkpoint_id', p_checkpoint_id);
end;
$$;

revoke all on function public.assistant_replace_checkpoint(uuid, text, text, text, text, text, text, text, uuid, text) from public;
grant execute on function public.assistant_replace_checkpoint(uuid, text, text, text, text, text, text, text, uuid, text) to authenticated;

-- Completed conversations can always rebuild from canonical messages and the
-- thread summary. Remove their legacy checkpoint chains immediately. Threads
-- with a pending proposal keep their chain until the next pause/resume writes
-- a compact full snapshot.
delete from public.assistant_graph_writes graph_write
where not exists (
  select 1
  from public.assistant_proposals proposal
  where proposal.thread_id = graph_write.thread_id
    and proposal.status = 'pending'
);

delete from public.assistant_graph_checkpoints graph_checkpoint
where not exists (
  select 1
  from public.assistant_proposals proposal
  where proposal.thread_id = graph_checkpoint.thread_id
    and proposal.status = 'pending'
);

update public.assistant_threads thread
set latest_checkpoint_id = null
where not exists (
  select 1
  from public.assistant_proposals proposal
  where proposal.thread_id = thread.id
    and proposal.status = 'pending'
);
