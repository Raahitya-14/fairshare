create extension if not exists pgcrypto;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  share_code text not null unique default encode(gen_random_bytes(18), 'hex'),
  name text not null,
  currency text not null default 'USD',
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  payer_id uuid not null references public.members(id) on delete restrict,
  split_member_ids uuid[] not null,
  created_at timestamptz not null default now()
);

alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.expenses enable row level security;

create or replace function public.group_to_json(p_group_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', g.id,
    'shareCode', g.share_code,
    'name', g.name,
    'currency', g.currency,
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name) order by m.created_at)
      from public.members m
      where m.group_id = g.id
    ), '[]'::jsonb),
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'description', e.description,
        'amount', e.amount,
        'payerId', e.payer_id,
        'splitMemberIds', e.split_member_ids,
        'createdAt', e.created_at
      ) order by e.created_at desc)
      from public.expenses e
      where e.group_id = g.id
    ), '[]'::jsonb)
  )
  from public.groups g
  where g.id = p_group_id;
$$;

create or replace function public.get_shared_group(p_share_code text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.group_to_json(id)
  from public.groups
  where share_code = p_share_code;
$$;

create or replace function public.create_shared_group(p_name text, p_currency text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  insert into public.groups (name, currency)
  values (nullif(trim(p_name), ''), coalesce(nullif(p_currency, ''), 'USD'))
  returning id into v_group_id;

  insert into public.members (group_id, name)
  values (v_group_id, 'You');

  return public.group_to_json(v_group_id);
end;
$$;

create or replace function public.update_group_currency(p_share_code text, p_currency text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  update public.groups
  set currency = p_currency
  where share_code = p_share_code
  returning id into v_group_id;

  return public.group_to_json(v_group_id);
end;
$$;

create or replace function public.convert_group_currency(p_share_code text, p_currency text, p_rate numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  if p_rate <= 0 then
    raise exception 'Invalid exchange rate';
  end if;

  update public.groups
  set currency = p_currency
  where share_code = p_share_code
  returning id into v_group_id;

  update public.expenses
  set amount = round(amount * p_rate, 2)
  where group_id = v_group_id;

  return public.group_to_json(v_group_id);
end;
$$;

create or replace function public.add_group_member(p_share_code text, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  select id into v_group_id from public.groups where share_code = p_share_code;
  if v_group_id is null then
    raise exception 'Group not found';
  end if;

  insert into public.members (group_id, name)
  values (v_group_id, nullif(trim(p_name), ''));

  return public.group_to_json(v_group_id);
end;
$$;

create or replace function public.remove_group_member(p_share_code text, p_member_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  select id into v_group_id from public.groups where share_code = p_share_code;
  if exists (
    select 1 from public.expenses
    where group_id = v_group_id
    and (payer_id = p_member_id or p_member_id = any(split_member_ids))
  ) then
    raise exception 'Member has expenses';
  end if;

  delete from public.members where group_id = v_group_id and id = p_member_id;
  return public.group_to_json(v_group_id);
end;
$$;

create or replace function public.add_shared_expense(
  p_share_code text,
  p_description text,
  p_amount numeric,
  p_payer_id uuid,
  p_split_member_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  select id into v_group_id from public.groups where share_code = p_share_code;
  if v_group_id is null then
    raise exception 'Group not found';
  end if;

  insert into public.expenses (group_id, description, amount, payer_id, split_member_ids)
  values (v_group_id, nullif(trim(p_description), ''), p_amount, p_payer_id, p_split_member_ids);

  return public.group_to_json(v_group_id);
end;
$$;

create or replace function public.delete_shared_expense(p_share_code text, p_expense_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  select id into v_group_id from public.groups where share_code = p_share_code;
  delete from public.expenses where group_id = v_group_id and id = p_expense_id;
  return public.group_to_json(v_group_id);
end;
$$;

create or replace function public.clear_shared_expenses(p_share_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_id uuid;
begin
  select id into v_group_id from public.groups where share_code = p_share_code;
  delete from public.expenses where group_id = v_group_id;
  return public.group_to_json(v_group_id);
end;
$$;

grant execute on function public.get_shared_group(text) to anon, authenticated;
grant execute on function public.create_shared_group(text, text) to anon, authenticated;
grant execute on function public.update_group_currency(text, text) to anon, authenticated;
grant execute on function public.convert_group_currency(text, text, numeric) to anon, authenticated;
grant execute on function public.add_group_member(text, text) to anon, authenticated;
grant execute on function public.remove_group_member(text, uuid) to anon, authenticated;
grant execute on function public.add_shared_expense(text, text, numeric, uuid, uuid[]) to anon, authenticated;
grant execute on function public.delete_shared_expense(text, uuid) to anon, authenticated;
grant execute on function public.clear_shared_expenses(text) to anon, authenticated;
revoke execute on function public.group_to_json(uuid) from public;
