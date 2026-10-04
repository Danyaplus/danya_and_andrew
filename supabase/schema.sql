-- Danya & Andrew: accounts / profiles / friends / direct messages
-- Run this file once in Supabase Dashboard -> SQL Editor -> New query -> Run.

create table if not exists public.users (
  id uuid primary key,
  username varchar(20) not null,
  username_key varchar(64) not null unique,
  display_name varchar(28) not null,
  password_salt text not null,
  password_hash text not null,
  email varchar(254),
  avatar text,
  created_at bigint not null
);

create unique index if not exists users_email_unique
  on public.users ((lower(email)))
  where email is not null and email <> '';

create index if not exists users_username_search_idx
  on public.users (username_key);

create table if not exists public.sessions (
  token_hash text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at bigint not null,
  expires_at bigint not null
);

create index if not exists sessions_user_idx on public.sessions(user_id);
create index if not exists sessions_expiry_idx on public.sessions(expires_at);

create table if not exists public.friend_requests (
  from_user_id uuid not null references public.users(id) on delete cascade,
  to_user_id uuid not null references public.users(id) on delete cascade,
  created_at bigint not null,
  primary key (from_user_id, to_user_id),
  check (from_user_id <> to_user_id)
);

create index if not exists friend_requests_to_idx
  on public.friend_requests(to_user_id);

create table if not exists public.friendships (
  user_a uuid not null references public.users(id) on delete cascade,
  user_b uuid not null references public.users(id) on delete cascade,
  created_at bigint not null,
  primary key (user_a, user_b),
  check (user_a <> user_b),
  check (user_a::text < user_b::text)
);

create index if not exists friendships_user_b_idx
  on public.friendships(user_b);

create table if not exists public.direct_messages (
  id uuid primary key,
  from_user_id uuid not null references public.users(id) on delete cascade,
  to_user_id uuid not null references public.users(id) on delete cascade,
  text varchar(500) not null,
  created_at bigint not null,
  check (from_user_id <> to_user_id)
);

create index if not exists direct_messages_from_to_idx
  on public.direct_messages(from_user_id, to_user_id, created_at desc);
create index if not exists direct_messages_to_from_idx
  on public.direct_messages(to_user_id, from_user_id, created_at desc);

-- The website never talks directly to these tables from the browser.
-- The Render backend uses SUPABASE_SECRET_KEY and performs all authorization itself.
alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.direct_messages enable row level security;

-- No browser access with publishable/anon/authenticated keys.
revoke all on table public.users from anon, authenticated;
revoke all on table public.sessions from anon, authenticated;
revoke all on table public.friend_requests from anon, authenticated;
revoke all on table public.friendships from anon, authenticated;
revoke all on table public.direct_messages from anon, authenticated;

-- The server secret key maps to service_role and needs full table access.
grant select, insert, update, delete on table public.users to service_role;
grant select, insert, update, delete on table public.sessions to service_role;
grant select, insert, update, delete on table public.friend_requests to service_role;
grant select, insert, update, delete on table public.friendships to service_role;
grant select, insert, update, delete on table public.direct_messages to service_role;
