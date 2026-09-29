-- 2026-09-29: PO numbers are unique per site, not across the company.
--
-- purchase_orders_po_number_key made po_number unique for the whole table,
-- so a new site could not use a number (including a placeholder like TBD)
-- that another site already had. Sites are independent: the same text may
-- exist once on each site. A second copy on the same site still fails,
-- including differences in case or surrounding spaces, and including
-- archived rows.
--
-- Blank numbers stay disallowed. A placeholder should be TBD plus an
-- identifier (TBD-Jamjoom), not an empty field.
--
-- Idempotent. Usage: paste into the Supabase SQL editor and Run (or psql -f).
-- Stops with a clear error if one site already has two rows that normalize
-- to the same number, or if any row has a blank number or no site.

-- ---------------------------------------------------------------------------
-- 1. Refuse to migrate data that would violate the new rules
-- ---------------------------------------------------------------------------
do $$
declare
  blank_count int;
  null_site_count int;
  dup_list text;
begin
  select count(*) into blank_count
  from public.purchase_orders
  where po_number is null or char_length(btrim(po_number)) = 0;

  if blank_count > 0 then
    raise exception
      'Cannot scope PO numbers per site: % purchase order(s) have a blank PO number. Give each one a number first.',
      blank_count;
  end if;

  select count(*) into null_site_count
  from public.purchase_orders
  where site_id is null;

  if null_site_count > 0 then
    raise exception
      'Cannot scope PO numbers per site: % purchase order(s) have no site.',
      null_site_count;
  end if;

  select string_agg(
    format('site %s number "%s" (%s rows)', site_id, po_key, n),
    '; '
  )
  into dup_list
  from (
    select site_id::text, lower(btrim(po_number)) as po_key, count(*) as n
    from public.purchase_orders
    group by site_id, lower(btrim(po_number))
    having count(*) > 1
  ) d;

  if dup_list is not null then
    raise exception
      'Cannot scope PO numbers per site. The same number already appears more than once on one site: %',
      dup_list;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Drop the company-wide unique rule on po_number
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'purchase_orders'
      and con.contype = 'u'
      and array_length(con.conkey, 1) = 1
      and (
        select att.attname
        from pg_attribute att
        where att.attrelid = rel.oid and att.attnum = con.conkey[1]
      ) = 'po_number'
  loop
    execute format('alter table public.purchase_orders drop constraint %I', r.conname);
  end loop;

  -- Same rule created as a unique index rather than a table constraint.
  for r in
    select ic.relname as index_name
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    join pg_class ic on ic.oid = i.indexrelid
    join pg_namespace nsp on nsp.oid = t.relnamespace
    where nsp.nspname = 'public'
      and t.relname = 'purchase_orders'
      and i.indisunique
      and i.indpred is null
      and array_length(i.indkey, 1) = 1
      and (
        select att.attname
        from pg_attribute att
        where att.attrelid = t.oid and att.attnum = i.indkey[1]
      ) = 'po_number'
  loop
    execute format('drop index if exists public.%I', r.index_name);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. One normalized number per site, and no blanks
-- ---------------------------------------------------------------------------
create unique index if not exists purchase_orders_site_po_number_uidx
  on public.purchase_orders (site_id, lower(btrim(po_number)));

alter table public.purchase_orders
  alter column po_number set not null;

alter table public.purchase_orders
  drop constraint if exists purchase_orders_po_number_not_blank;

alter table public.purchase_orders
  add constraint purchase_orders_po_number_not_blank
  check (char_length(btrim(po_number)) > 0);

comment on column public.purchase_orders.po_number is
  'Label for this purchase order. Unique per site after trim and case-folding, including archived rows. The same text may be used on another site. Placeholders should be TBD plus an identifier.';
