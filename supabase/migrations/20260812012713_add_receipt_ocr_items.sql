alter table public.expenses
  add column receipt_source_locale text,
  add column receipt_target_locale text,
  add column receipt_scanned_at timestamptz;

comment on column public.expenses.receipt_source_locale is
  'Best-effort BCP-47 locale detected when the receipt was scanned.';
comment on column public.expenses.receipt_target_locale is
  'BCP-47 locale used for the saved item translations.';
comment on column public.expenses.receipt_scanned_at is
  'Time at which the currently saved receipt details were scanned.';

create table public.expense_items (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.expenses(id) on delete cascade,
  position integer not null,
  source_name text not null,
  localized_name text not null,
  quantity numeric(12, 3) not null,
  unit_price numeric(14, 4),
  line_total numeric(14, 4) not null,
  created_at timestamptz not null default now(),
  constraint expense_items_position_nonnegative check (position >= 0),
  constraint expense_items_source_name_nonempty check (btrim(source_name) <> ''),
  constraint expense_items_localized_name_nonempty check (btrim(localized_name) <> ''),
  constraint expense_items_quantity_positive check (quantity > 0),
  constraint expense_items_unit_price_nonnegative check (
    unit_price is null or unit_price >= 0
  ),
  constraint expense_items_line_total_nonnegative check (line_total >= 0),
  constraint expense_items_expense_position_key unique (expense_id, position)
);

comment on table public.expense_items is
  'Editable, normalized line items extracted from an expense receipt.';

-- Kept explicitly for FK cascade and direct expense_id lookups. The unique
-- index above also starts with expense_id, but this named index is part of the
-- public schema contract for the feature.
create index expense_items_expense_id_idx
  on public.expense_items (expense_id);

alter table public.expense_items enable row level security;

create policy "Expense owners can read receipt items"
  on public.expense_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.expenses as expense
      join public.itineraries as itinerary
        on itinerary.id = expense.itinerary_id
      where expense.id = expense_items.expense_id
        and itinerary.owner_id = (select auth.uid())
    )
  );

create policy "Expense owners can add receipt items"
  on public.expense_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.expenses as expense
      join public.itineraries as itinerary
        on itinerary.id = expense.itinerary_id
      where expense.id = expense_items.expense_id
        and itinerary.owner_id = (select auth.uid())
    )
  );

create policy "Expense owners can update receipt items"
  on public.expense_items
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.expenses as expense
      join public.itineraries as itinerary
        on itinerary.id = expense.itinerary_id
      where expense.id = expense_items.expense_id
        and itinerary.owner_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.expenses as expense
      join public.itineraries as itinerary
        on itinerary.id = expense.itinerary_id
      where expense.id = expense_items.expense_id
        and itinerary.owner_id = (select auth.uid())
    )
  );

create policy "Expense owners can delete receipt items"
  on public.expense_items
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.expenses as expense
      join public.itineraries as itinerary
        on itinerary.id = expense.itinerary_id
      where expense.id = expense_items.expense_id
        and itinerary.owner_id = (select auth.uid())
    )
  );

revoke all on table public.expense_items from public, anon;
grant select, insert, update, delete on table public.expense_items to authenticated;

create or replace function public.save_expense_with_items(
  p_id uuid,
  p_itinerary_id uuid,
  p_amount double precision,
  p_currency text,
  p_date timestamptz,
  p_note text,
  p_image_url text,
  p_title text,
  p_attraction_id uuid,
  p_receipt_image_paths text[],
  p_receipt_source_locale text,
  p_receipt_target_locale text,
  p_receipt_scanned_at timestamptz,
  p_items jsonb
)
returns public.expenses
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_expense public.expenses;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_id is null or p_itinerary_id is null then
    raise exception 'Expense and itinerary IDs are required'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.itineraries as itinerary
    where itinerary.id = p_itinerary_id
      and itinerary.owner_id = (select auth.uid())
  ) then
    raise exception 'Itinerary access denied' using errcode = '42501';
  end if;

  if p_attraction_id is not null and not exists (
    select 1
    from public.attractions as attraction
    join public.days as day on day.id = attraction.day_id
    where attraction.id = p_attraction_id
      and day.itinerary_id = p_itinerary_id
  ) then
    raise exception 'Attraction does not belong to the itinerary'
      using errcode = '23514';
  end if;

  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a three-letter uppercase code'
      using errcode = '22023';
  end if;

  if p_receipt_source_locale is not null
    and (length(p_receipt_source_locale) = 0 or length(p_receipt_source_locale) > 64)
  then
    raise exception 'Invalid receipt source locale' using errcode = '22023';
  end if;

  if p_receipt_target_locale is not null
    and (length(p_receipt_target_locale) = 0 or length(p_receipt_target_locale) > 64)
  then
    raise exception 'Invalid receipt target locale' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array' then
    raise exception 'Items must be an array' using errcode = '22023';
  end if;

  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) > 250 then
    raise exception 'At most 250 items are allowed' using errcode = '22023';
  end if;

  -- Check JSON types separately so malformed strings are never cast to numeric.
  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as entry(item)
    where jsonb_typeof(entry.item) is distinct from 'object'
      or jsonb_typeof(entry.item->'sourceName') is distinct from 'string'
      or btrim(entry.item->>'sourceName') = ''
      or jsonb_typeof(entry.item->'localizedName') is distinct from 'string'
      or btrim(entry.item->>'localizedName') = ''
      or jsonb_typeof(entry.item->'quantity') is distinct from 'number'
      or jsonb_typeof(entry.item->'lineTotal') is distinct from 'number'
      or coalesce(jsonb_typeof(entry.item->'unitPrice'), 'missing')
        not in ('number', 'null')
  ) then
    raise exception 'Every item requires names, quantity, and line total'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) as entry(item)
    where (entry.item->>'quantity')::numeric <= 0
      or (entry.item->>'quantity')::numeric > 999999999.999
      or (entry.item->>'lineTotal')::numeric < 0
      or (entry.item->>'lineTotal')::numeric > 9999999999.9999
      or (
        entry.item->'unitPrice' <> 'null'::jsonb
        and (
          (entry.item->>'unitPrice')::numeric < 0
          or (entry.item->>'unitPrice')::numeric > 9999999999.9999
        )
      )
  ) then
    raise exception 'Item numeric value is outside the supported range'
      using errcode = '22003';
  end if;

  insert into public.expenses (
    id,
    itinerary_id,
    amount,
    currency,
    date,
    note,
    image_url,
    title,
    attraction_id,
    receipt_image_paths,
    receipt_source_locale,
    receipt_target_locale,
    receipt_scanned_at
  )
  values (
    p_id,
    p_itinerary_id,
    p_amount,
    p_currency,
    p_date,
    p_note,
    p_image_url,
    p_title,
    p_attraction_id,
    p_receipt_image_paths,
    p_receipt_source_locale,
    p_receipt_target_locale,
    p_receipt_scanned_at
  )
  on conflict (id) do update set
    itinerary_id = excluded.itinerary_id,
    amount = excluded.amount,
    currency = excluded.currency,
    date = excluded.date,
    note = excluded.note,
    image_url = excluded.image_url,
    title = excluded.title,
    attraction_id = excluded.attraction_id,
    receipt_image_paths = excluded.receipt_image_paths,
    receipt_source_locale = excluded.receipt_source_locale,
    receipt_target_locale = excluded.receipt_target_locale,
    receipt_scanned_at = excluded.receipt_scanned_at
  returning * into v_expense;

  delete from public.expense_items
  where expense_id = p_id;

  insert into public.expense_items (
    expense_id,
    position,
    source_name,
    localized_name,
    quantity,
    unit_price,
    line_total
  )
  select
    p_id,
    (entry.ordinality - 1)::integer,
    entry.item->>'sourceName',
    entry.item->>'localizedName',
    (entry.item->>'quantity')::numeric,
    case
      when entry.item->'unitPrice' = 'null'::jsonb then null
      else (entry.item->>'unitPrice')::numeric
    end,
    (entry.item->>'lineTotal')::numeric
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
    with ordinality as entry(item, ordinality);

  return v_expense;
end;
$$;

comment on function public.save_expense_with_items(
  uuid, uuid, double precision, text, timestamptz, text, text, text,
  uuid, text[], text, text, timestamptz, jsonb
) is
  'Atomically inserts or updates an owned expense and replaces its receipt items.';

revoke all on function public.save_expense_with_items(
  uuid, uuid, double precision, text, timestamptz, text, text, text,
  uuid, text[], text, text, timestamptz, jsonb
) from public, anon;

grant execute on function public.save_expense_with_items(
  uuid, uuid, double precision, text, timestamptz, text, text, text,
  uuid, text[], text, text, timestamptz, jsonb
) to authenticated;
