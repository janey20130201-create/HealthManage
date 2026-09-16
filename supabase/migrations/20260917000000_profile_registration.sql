-- Keep the registration fields in public.profiles while passwords stay in Supabase Auth.
alter table public.profiles add column email text;

update public.profiles as p
set email = u.email
from auth.users as u
where p.id = u.id;

create unique index profiles_email_ci_key
  on public.profiles (lower(email)) where email is not null;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id, username, full_name, email, gender, birth_date, allergy, height_cm, weight_kg
  ) values (
    new.id,
    nullif(btrim(new.raw_user_meta_data ->> 'username'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    new.email,
    nullif(new.raw_user_meta_data ->> 'gender', ''),
    nullif(new.raw_user_meta_data ->> 'birth_date', '')::date,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'allergy'), ''), '없음'),
    nullif(new.raw_user_meta_data ->> 'height_cm', '')::numeric,
    nullif(new.raw_user_meta_data ->> 'weight_kg', '')::numeric
  );
  return new;
end;
$$;

create function private.sync_auth_user_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed_caring
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function private.sync_auth_user_email();

revoke all on function private.sync_auth_user_email() from public, anon, authenticated;
