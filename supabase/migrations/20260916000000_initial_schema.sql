-- caring: one profile and one search archive per Supabase Auth user.
-- Run as a migration on a new Supabase project; never store passwords here.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text,
  full_name text,
  gender text,
  birth_date date,
  allergy text not null default '없음',
  height_cm numeric(5, 1),
  weight_kg numeric(5, 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (
    username is null or
    (char_length(username) between 2 and 50 and username = btrim(username))
  ),
  constraint profiles_full_name_length check (
    full_name is null or char_length(full_name) between 1 and 100
  ),
  constraint profiles_gender_value check (
    gender is null or gender in ('남성', '여성', '기타', '응답하지 않음')
  ),
  constraint profiles_allergy_length check (char_length(allergy) <= 2000),
  constraint profiles_height_range check (height_cm is null or height_cm between 30 and 250),
  constraint profiles_weight_range check (weight_kg is null or weight_kg between 2 and 300)
);

create unique index profiles_username_ci_key
  on public.profiles (lower(username)) where username is not null;

create table public.search_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  search_type text not null,
  query text not null,
  -- The current AI table shape (recognized, rows, etc.) can be saved unchanged.
  result jsonb not null default '{}'::jsonb,
  searched_at timestamptz not null default now(),
  constraint search_history_type check (search_type in ('surgery', 'medicine')),
  constraint search_history_query check (
    char_length(query) between 1 and 500 and query = btrim(query)
  ),
  constraint search_history_result_object check (jsonb_typeof(result) = 'object')
);

-- The app currently keeps the latest result for each search type + query.
create unique index search_history_user_type_query_ci_key
  on public.search_history (user_id, search_type, lower(query));
create index search_history_user_date_idx
  on public.search_history (user_id, searched_at desc);

create function private.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_profile_updated_at();

-- A bare profile is created even if the client has not supplied metadata yet.
-- The application updates editable fields after Auth signup succeeds.
create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created_caring
after insert on auth.users
for each row execute function private.handle_new_auth_user();

revoke all on function private.set_profile_updated_at() from public, anon, authenticated;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

alter table public.profiles enable row level security;
alter table public.search_history enable row level security;

create policy "Users read their own profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy "Users update their own profile"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "Users read their own history"
on public.search_history for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users add their own history"
on public.search_history for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users update their own history"
on public.search_history for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users delete their own history"
on public.search_history for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on public.profiles, public.search_history from public, anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.search_history to authenticated;
