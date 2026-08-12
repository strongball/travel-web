-- ROLLOUT GATE
-- Apply this migration only after every supported client can read canonical
-- storage:// references and resolve them to short-lived signed URLs. Applying
-- it earlier will break image display in older released clients.

create function pg_temp.travel_image_object_path(reference text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when reference like 'storage://travel_images/%' then
      substring(reference from length('storage://travel_images/') + 1)
    when reference ~ '^https?://' and position('/travel_images/' in reference) > 0 then
      split_part(split_part(reference, '/travel_images/', 2), '?', 1)
    else reference
  end
$$;

do $$
begin
  if not exists (
    select 1 from storage.buckets where id = 'travel_images'
  ) then
    raise exception 'travel_images bucket does not exist';
  end if;

  if exists (
    select 1
    from storage.objects as object
    where object.bucket_id = 'travel_images'
      and coalesce((storage.foldername(object.name))[1], '')
        !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  ) then
    raise exception 'Every travel_images object must be inside a user UUID folder';
  end if;

  if exists (
    select 1
    from storage.objects as object
    left join auth.users as account
      on account.id::text = (storage.foldername(object.name))[1]
    where object.bucket_id = 'travel_images'
      and account.id is null
  ) then
    raise exception 'A travel_images object belongs to an unknown user folder';
  end if;
end;
$$;

-- Abort before changing anything if a persisted expense reference either does
-- not resolve to an object or is outside the itinerary owner's folder.
do $$
begin
  if exists (
    with references as (
      select
        itinerary.owner_id,
        expense.image_url as reference
      from public.expenses as expense
      join public.itineraries as itinerary on itinerary.id = expense.itinerary_id
      where expense.image_url is not null

      union all

      select
        itinerary.owner_id,
        image.reference
      from public.expenses as expense
      join public.itineraries as itinerary on itinerary.id = expense.itinerary_id
      cross join lateral unnest(expense.receipt_image_paths) as image(reference)
      where image.reference is not null
    ), stored_references as (
      select owner_id, pg_temp.travel_image_object_path(reference) as object_path
      from references
      where reference like 'storage://travel_images/%'
        or (reference ~ '^https?://' and position('/travel_images/' in reference) > 0)
        or exists (
          select 1
          from storage.objects as object
          where object.bucket_id = 'travel_images'
            and object.name = reference
        )
    )
    select 1
    from stored_references as stored
    left join storage.objects as object
      on object.bucket_id = 'travel_images'
      and object.name = stored.object_path
    where object.id is null
      or (storage.foldername(stored.object_path))[1] <> stored.owner_id::text
  ) then
    raise exception 'An expense image reference is missing or outside its owner folder';
  end if;
end;
$$;

do $$
begin
  if exists (
    with references as (
      select
        itinerary.owner_id,
        todo.image_path as reference
      from public.todo_items as todo
      join public.itineraries as itinerary on itinerary.id = todo.itinerary_id
      where todo.image_path is not null

      union all

      select
        itinerary.owner_id,
        image.reference
      from public.todo_items as todo
      join public.itineraries as itinerary on itinerary.id = todo.itinerary_id
      cross join lateral unnest(todo.images) as image(reference)
      where image.reference is not null
    ), stored_references as (
      select owner_id, pg_temp.travel_image_object_path(reference) as object_path
      from references
      where reference like 'storage://travel_images/%'
        or (reference ~ '^https?://' and position('/travel_images/' in reference) > 0)
        or exists (
          select 1
          from storage.objects as object
          where object.bucket_id = 'travel_images'
            and object.name = reference
        )
    )
    select 1
    from stored_references as stored
    left join storage.objects as object
      on object.bucket_id = 'travel_images'
      and object.name = stored.object_path
    where object.id is null
      or (storage.foldername(stored.object_path))[1] <> stored.owner_id::text
  ) then
    raise exception 'A todo image reference is missing or outside its owner folder';
  end if;
end;
$$;

update public.expenses as expense
set image_url = 'storage://travel_images/' ||
  pg_temp.travel_image_object_path(expense.image_url)
where expense.image_url is not null
  and (
    expense.image_url like 'storage://travel_images/%'
    or (
      expense.image_url ~ '^https?://'
      and position('/travel_images/' in expense.image_url) > 0
    )
    or exists (
      select 1
      from storage.objects as object
      where object.bucket_id = 'travel_images'
        and object.name = expense.image_url
    )
  );

update public.expenses as expense
set receipt_image_paths = coalesce(converted.references, array[]::text[])
from lateral (
  select array_agg(
    case
      when image.reference like 'storage://travel_images/%'
        or (
          image.reference ~ '^https?://'
          and position('/travel_images/' in image.reference) > 0
        )
        or exists (
          select 1
          from storage.objects as object
          where object.bucket_id = 'travel_images'
            and object.name = image.reference
        )
      then 'storage://travel_images/' ||
        pg_temp.travel_image_object_path(image.reference)
      else image.reference
    end
    order by image.ordinality
  ) as references
  from unnest(expense.receipt_image_paths)
    with ordinality as image(reference, ordinality)
) as converted
where expense.receipt_image_paths is not null;

update public.todo_items as todo
set image_path = 'storage://travel_images/' ||
  pg_temp.travel_image_object_path(todo.image_path)
where todo.image_path is not null
  and (
    todo.image_path like 'storage://travel_images/%'
    or (
      todo.image_path ~ '^https?://'
      and position('/travel_images/' in todo.image_path) > 0
    )
    or exists (
      select 1
      from storage.objects as object
      where object.bucket_id = 'travel_images'
        and object.name = todo.image_path
    )
  );

update public.todo_items as todo
set images = coalesce(converted.references, array[]::text[])
from lateral (
  select array_agg(
    case
      when image.reference like 'storage://travel_images/%'
        or (
          image.reference ~ '^https?://'
          and position('/travel_images/' in image.reference) > 0
        )
        or exists (
          select 1
          from storage.objects as object
          where object.bucket_id = 'travel_images'
            and object.name = image.reference
        )
      then 'storage://travel_images/' ||
        pg_temp.travel_image_object_path(image.reference)
      else image.reference
    end
    order by image.ordinality
  ) as references
  from unnest(todo.images)
    with ordinality as image(reference, ordinality)
) as converted
where todo.images is not null;

update storage.buckets
set public = false
where id = 'travel_images';

drop policy if exists "Anyone can view images" on storage.objects;
drop policy if exists "Authenticated users can update their own images" on storage.objects;
drop policy if exists "Authenticated users can upload images" on storage.objects;
drop policy if exists "Users can delete their own images" on storage.objects;
drop policy if exists "Owners can view travel images" on storage.objects;
drop policy if exists "Owners can upload travel images" on storage.objects;
drop policy if exists "Owners can update travel images" on storage.objects;
drop policy if exists "Owners can delete travel images" on storage.objects;

create policy "Owners can view travel images"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'travel_images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Owners can upload travel images"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'travel_images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Owners can update travel images"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'travel_images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'travel_images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Owners can delete travel images"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'travel_images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop function pg_temp.travel_image_object_path(text);
