-- Danya & Andrew: chat upgrade
-- Run ONCE in Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Adds replies, reactions and persistent unread counters for private chats.

alter table public.direct_messages
  add column if not exists reply_to uuid references public.direct_messages(id) on delete set null;

alter table public.direct_messages
  add column if not exists reactions jsonb not null default '{}'::jsonb;

create index if not exists direct_messages_reply_to_idx
  on public.direct_messages(reply_to);

create table if not exists public.direct_chat_reads (
  user_id uuid not null references public.users(id) on delete cascade,
  friend_id uuid not null references public.users(id) on delete cascade,
  last_read_at bigint not null default 0,
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create index if not exists direct_chat_reads_friend_idx
  on public.direct_chat_reads(friend_id);

-- Existing conversations predate unread counters, so start them as already read.
insert into public.direct_chat_reads(user_id, friend_id, last_read_at)
select user_a, user_b, floor(extract(epoch from clock_timestamp()) * 1000)::bigint
from public.friendships
on conflict (user_id, friend_id) do nothing;

insert into public.direct_chat_reads(user_id, friend_id, last_read_at)
select user_b, user_a, floor(extract(epoch from clock_timestamp()) * 1000)::bigint
from public.friendships
on conflict (user_id, friend_id) do nothing;

alter table public.direct_chat_reads enable row level security;
revoke all on table public.direct_chat_reads from anon, authenticated;
grant select, insert, update, delete on table public.direct_chat_reads to service_role;
