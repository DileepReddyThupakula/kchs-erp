-- subject_names(): readable by staff only, names only. Rolled back.
select pg_temp.fixture_user('00000000-0000-4000-f800-000000000001', 't@sn.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('1c000000-0000-4000-f800-000000000001', '00000000-0000-4000-f800-000000000001', 'teacher', 'SN-T', 'Sn Teacher');
insert into public.subjects (id, name, code) values ('5b000000-0000-4000-f800-000000000001', 'SN Subject Not Taught', 'SNX');
select pg_temp.login_as('00000000-0000-4000-f800-000000000001');
select pg_temp.counts($$select count(*) from public.subjects where code = 'SNX'$$, 0, 'a teacher cannot read a subject they do not teach (scope unchanged)');
select pg_temp.counts($$select count(*) from public.subject_names() where name = 'SN Subject Not Taught'$$, 1, 'but subject_names() gives the name (for the diary)');
select pg_temp.login_as(null);
select pg_temp.throws($$select * from public.subject_names()$$, 'anonymous: refused', '42501');
