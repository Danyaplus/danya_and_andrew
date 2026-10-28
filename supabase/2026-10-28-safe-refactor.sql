-- Kodumi Games: additive migration for the 2026-10-28 refactor.
-- BACK UP YOUR DATABASE. Run after chat-upgrade.sql and profile-showcase-titles.sql.
-- Existing accounts, awards, wallets, purchases, games and messages are preserved.

begin;
alter table public.users add column if not exists language text not null default 'uk';
-- Enforce supported values without overwriting any existing preference.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'kodumi_users_language_allowed') then
    alter table public.users add constraint kodumi_users_language_allowed
      check (language in ('uk', 'ru', 'en')) not valid;
  end if;
end $$;

-- These indexes use the same columns already queried by the backend.
create index if not exists kodumi_users_username_key_lookup_idx on public.users (username_key);
create index if not exists kodumi_sessions_expires_idx on public.sessions (expires_at);
create index if not exists kodumi_friend_requests_from_idx on public.friend_requests (from_user_id);
create index if not exists kodumi_friend_requests_to_idx on public.friend_requests (to_user_id);
create index if not exists kodumi_friendships_a_idx on public.friendships (user_a);
create index if not exists kodumi_friendships_b_idx on public.friendships (user_b);
-- Fast direct-message lookups. Existing data is unchanged.
create index if not exists kodumi_dm_from_to_time_idx
  on public.direct_messages (from_user_id, to_user_id, created_at desc);
create index if not exists kodumi_dm_to_from_time_idx
  on public.direct_messages (to_user_id, from_user_id, created_at desc);
create index if not exists kodumi_dm_hidden_user_message_idx
  on public.direct_message_hidden (user_id, message_id);

-- Atomic reactions: select the message FOR UPDATE so concurrent toggles cannot
-- overwrite one another, even with multiple Node servers.
create or replace function public.codumi_toggle_direct_reaction(
  p_user_id uuid, p_message_id uuid, p_emoji text
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_row public.direct_messages%rowtype;
  v_reactions jsonb;
  v_users jsonb;
begin
  if p_emoji is null or length(p_emoji) > 20 then
    raise exception 'REACTION_INVALID';
  end if;
  select * into v_row from public.direct_messages
    where id = p_message_id for update;
  if not found or (v_row.from_user_id <> p_user_id and v_row.to_user_id <> p_user_id) then
    raise exception 'MESSAGE_NOT_FOUND';
  end if;
  v_reactions := coalesce(v_row.reactions, '{}'::jsonb);
  v_users := coalesce(v_reactions -> p_emoji, '[]'::jsonb);
  if v_users ? p_user_id::text then
    select coalesce(jsonb_agg(value), '[]'::jsonb) into v_users
      from jsonb_array_elements_text(v_users) as users(value)
      where value <> p_user_id::text;
  else
    v_users := v_users || to_jsonb(p_user_id::text);
  end if;
  if jsonb_array_length(v_users) = 0 then
    v_reactions := v_reactions - p_emoji;
  else
    v_reactions := jsonb_set(v_reactions, array[p_emoji], v_users, true);
  end if;
  update public.direct_messages set reactions = v_reactions where id = p_message_id;
  return jsonb_build_object('fromUserId', v_row.from_user_id,
    'toUserId', v_row.to_user_id, 'reactions', v_reactions);
end;
$$;
revoke all on function public.codumi_toggle_direct_reaction(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.codumi_toggle_direct_reaction(uuid,uuid,text) to service_role;

-- One database request for each inbox snapshot. Counts all nonhidden messages,
-- not only the last 1000 rows shared between all friends.
create or replace function public.codumi_direct_summaries(p_user_id uuid)
returns table(friend_id uuid, message_id uuid, message_text text,
  media_kind text, from_user_id uuid, created_at bigint, unread_count bigint)
language sql stable
set search_path = public
as $$
  with friend_ids as (
    select user_b as id from public.friendships where user_a = p_user_id
    union
    select user_a as id from public.friendships where user_b = p_user_id
  )
  select f.id, latest.id, latest.text, latest.media_kind, latest.from_user_id,
    latest.created_at, coalesce(unread.cnt, 0)::bigint
  from friend_ids f
  left join lateral (
    select dm.id, dm.text, dm.media_kind, dm.from_user_id, dm.created_at
    from public.direct_messages dm
    where ((dm.from_user_id = p_user_id and dm.to_user_id = f.id)
      or (dm.from_user_id = f.id and dm.to_user_id = p_user_id))
      and not exists (
        select 1 from public.direct_message_hidden h
        where h.user_id = p_user_id and h.message_id = dm.id)
    order by dm.created_at desc, dm.id desc limit 1
  ) latest on true
  left join lateral (
    select count(*) as cnt from public.direct_messages dm
    where dm.to_user_id = p_user_id and dm.from_user_id = f.id
      and dm.created_at > coalesce((select r.last_read_at
        from public.direct_chat_reads r
        where r.user_id = p_user_id and r.friend_id = f.id), 0)
      and not exists (
        select 1 from public.direct_message_hidden h
        where h.user_id = p_user_id and h.message_id = dm.id)
  ) unread on true;
$$;
revoke all on function public.codumi_direct_summaries(uuid) from public, anon, authenticated;
grant execute on function public.codumi_direct_summaries(uuid) to service_role;

commit;
