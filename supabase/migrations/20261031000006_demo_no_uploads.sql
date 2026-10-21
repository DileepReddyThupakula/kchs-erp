-- The public demo site signs visitors in as the shared demo logins (@demo.kchs.test). Those logins can never store a file, whatever the
-- screens say: a RESTRICTIVE rule on file storage is added on top of every existing rule (it can only take access away).
-- Nothing changes for anyone else. No such login exists in production.
create or replace function app.is_demo_login() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(lower(auth.jwt() ->> 'email') like '%@demo.kchs.test', false)
$$;

create policy demo_logins_cannot_upload on storage.objects as restrictive for insert to authenticated
  with check (not app.is_demo_login());
create policy demo_logins_cannot_replace on storage.objects as restrictive for update to authenticated
  using (not app.is_demo_login()) with check (not app.is_demo_login());
