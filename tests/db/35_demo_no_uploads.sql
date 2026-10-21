-- The shared demo logins (@demo.kchs.test) can never store or replace a file; everyone else is unaffected. Rolled back.
select pg_temp.fixture_user('00000000-0000-4000-ff40-000000000001', 'demo-admin@demo.kchs.test');
select pg_temp.fixture_user('00000000-0000-4000-ff40-000000000002', 'real-admin@school.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name, status) values
  ('1f400000-0000-4000-ff40-000000000001', '00000000-0000-4000-ff40-000000000001', 'admin', 'DM-ADM', 'Dm Demo Admin', 'active'),
  ('1f400000-0000-4000-ff40-000000000002', '00000000-0000-4000-ff40-000000000002', 'admin', 'DM-REAL', 'Dm Real Admin', 'active');

create function pg_temp.as_email(p_user uuid, p_email text) returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated', 'email', p_email)::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
grant execute on function pg_temp.as_email(uuid, text) to authenticated;

select pg_temp.as_email('00000000-0000-4000-ff40-000000000001', 'demo-admin@demo.kchs.test');
select pg_temp.ok(app.is_demo_login(), 'a @demo.kchs.test login is recognised as a demo login');
select pg_temp.throws($$insert into storage.objects (bucket_id, name, owner) values ('branding', 'dm-demo-upload.png', '00000000-0000-4000-ff40-000000000001')$$, 'demo Admin: cannot store a file even in the bucket the Admin may normally use', '42501');
select pg_temp.as_email('00000000-0000-4000-ff40-000000000002', 'real-admin@school.test');
select pg_temp.ok(not app.is_demo_login(), 'any other login is not a demo login');
select pg_temp.lives($$insert into storage.objects (bucket_id, name, owner) values ('branding', 'dm-real-upload.png', '00000000-0000-4000-ff40-000000000002')$$, 'a real Admin can still upload (nothing changed for them)');
-- replacing a file (the fee QR bucket lets an Admin read and replace its files)
select pg_temp.as_email('00000000-0000-4000-ff40-000000000002', 'real-admin@school.test');
select pg_temp.lives($$insert into storage.objects (bucket_id, name, owner) values ('payment-qr', 'dm-qr.png', '00000000-0000-4000-ff40-000000000002')$$, 'a real Admin can store a fee QR file');
select pg_temp.affects($$update storage.objects set name = 'dm-qr-2.png' where name = 'dm-qr.png'$$, 1, 'a real Admin can still replace a file');
select pg_temp.as_email('00000000-0000-4000-ff40-000000000001', 'demo-admin@demo.kchs.test');
select pg_temp.affects($$update storage.objects set name = 'dm-qr-3.png' where name = 'dm-qr-2.png'$$, 0, 'demo Admin: cannot replace or rename a stored file');
select pg_temp.logout();
select pg_temp.ok((select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'demo_logins_cannot_%' and permissive = 'RESTRICTIVE') = 2, 'both rules are RESTRICTIVE (they only take access away)');
