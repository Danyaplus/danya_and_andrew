-- Kodumi Games: medals showcase + purchasable profile titles (28 Oct 2026)
-- Run in Supabase Dashboard -> SQL Editor once, then redeploy the backend/frontend.
-- Safe to run repeatedly. This script never deletes previous badge claims or purchases.
-- Badge claims stay in existing public.codumi_badge_claims; no duplicate inventory needed.

create table if not exists public.codumi_profile_showcase (
  user_id uuid primary key references public.users(id) on delete cascade,
  title_id text not null default 'none',
  badge_ids text[] not null default '{}'::text[],
  title_colors jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Existing setups may already have the table, but without the color column.
alter table public.codumi_profile_showcase
  add column if not exists title_colors jsonb not null default '{}'::jsonb;

create table if not exists public.codumi_owned_titles (
  user_id uuid not null references public.users(id) on delete cascade,
  title_id text not null,
  purchased_at timestamptz not null default now(),
  primary key (user_id,title_id)
);

create index if not exists codumi_owned_titles_user_idx
  on public.codumi_owned_titles (user_id);

-- These tables belong to the custom-account backend, not to Supabase Auth clients.
alter table public.codumi_profile_showcase enable row level security;
alter table public.codumi_owned_titles enable row level security;
revoke all on table public.codumi_profile_showcase from anon, authenticated;
revoke all on table public.codumi_owned_titles from anon, authenticated;
grant select, insert, update, delete on table public.codumi_profile_showcase to service_role;
grant select, insert, update, delete on table public.codumi_owned_titles to service_role;

-- Server-requested title purchases. Prices are hardcoded here, not accepted from the browser.
-- Row lock on the wallet makes multiple concurrent purchases atomic. Existing purchases
-- are recognized before debiting. If the wallet doesn't have enough CODI, no ownership
-- is created and no balance is changed.
-- Replace any older title shop implementation, even if its SQL return type differs.
drop function if exists public.codumi_purchase_profile_title(uuid,text);

create function public.codumi_purchase_profile_title(
  p_user_id uuid,
  p_title_id text
) returns bigint
language plpgsql
set search_path = public
as $$
declare
  v_price bigint;
  v_coins bigint;
begin
  v_price := case p_title_id
    when 'royal-strategist' then 180
    when 'neon-champion' then 320
    when 'night-owl' then 480
    when 'golden-player' then 700
    else null
  end;
  if v_price is null then raise exception 'ITEM_UNKNOWN'; end if;

  select coins into v_coins
    from public.codumi_coin_wallets
    where user_id = p_user_id for update;
  if not found or v_coins < v_price then raise exception 'INSUFFICIENT_COINS'; end if;
  if exists (select 1 from public.codumi_owned_titles
    where user_id = p_user_id and title_id = p_title_id) then
    raise exception 'TITLE_ALREADY_OWNED';
  end if;

  update public.codumi_coin_wallets
    set coins = coins - v_price
    where user_id = p_user_id
    returning coins into v_coins;

  insert into public.codumi_owned_titles(user_id,title_id)
    values(p_user_id,p_title_id);
  return v_coins;
end;
$$;

revoke all on function public.codumi_purchase_profile_title(uuid,text) from PUBLIC, anon, authenticated;
grant execute on function public.codumi_purchase_profile_title(uuid,text) to service_role;
