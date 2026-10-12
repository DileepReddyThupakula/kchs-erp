-- Module 1: foundation, staff & school setup — role permission tests.
-- Runs as postgres inside a rolled-back transaction (see scripts/test-db.mjs).

-- ---------- fixtures (as postgres, bypassing RLS) ----------
-- Tests set their own mediums so they don't depend on the live Settings
-- (this whole file runs in a transaction that is rolled back).
update public.school_settings set mediums = '{English,Telugu}' where id = 1;
select pg_temp.fixture_user('00000000-0000-4000-a000-000000000001', 'admin@fixture.test');
select pg_temp.fixture_user('00000000-0000-4000-a000-000000000002', 'office@fixture.test');
select pg_temp.fixture_user('00000000-0000-4000-a000-000000000003', 'teacher1@fixture.test');
select pg_temp.fixture_user('00000000-0000-4000-a000-000000000004', 'teacher2@fixture.test');
select pg_temp.fixture_user('00000000-0000-4000-a000-000000000005', 'stranger@fixture.test');
select pg_temp.fixture_user('00000000-0000-4000-a000-000000000006', 'oldadmin@fixture.test');

insert into public.staff (id, user_id, app_role, employee_code, full_name, status) values
  ('10000000-0000-4000-a000-000000000001', '00000000-0000-4000-a000-000000000001', 'admin',          'TEST-ADM', 'Test Admin',    'active'),
  ('10000000-0000-4000-a000-000000000002', '00000000-0000-4000-a000-000000000002', 'computer_staff', 'TEST-CS',  'Test Office',   'active'),
  ('10000000-0000-4000-a000-000000000003', '00000000-0000-4000-a000-000000000003', 'teacher',        'TEST-T1',  'Test Teacher1', 'active'),
  ('10000000-0000-4000-a000-000000000004', '00000000-0000-4000-a000-000000000004', 'teacher',        'TEST-T2',  'Test Teacher2', 'active'),
  ('10000000-0000-4000-a000-000000000006', '00000000-0000-4000-a000-000000000006', 'admin',          'TEST-OLD', 'Former Admin',  'left');

insert into public.academic_years (id, name, start_date, end_date) values
  ('20000000-0000-4000-a000-000000000001', 'TEST-2030-31', '2030-04-01', '2031-03-31');
insert into public.classes (id, name, sort_order) values ('30000000-0000-4000-a000-000000000001', 'TEST Class', 999);
insert into public.sections (id, academic_year_id, class_id, name, medium, class_teacher_id) values
  ('31000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', 'A', 'English', '10000000-0000-4000-a000-000000000003'),
  ('31000000-0000-4000-a000-000000000002', '20000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', 'B', 'Telugu',  null);
insert into public.subjects (id, name, code) values
  ('40000000-0000-4000-a000-000000000001', 'TEST Maths', 'TMAT'),
  ('40000000-0000-4000-a000-000000000002', 'TEST Science', 'TSCI');
insert into public.teacher_assignments (staff_id, section_id, subject_id) values
  ('10000000-0000-4000-a000-000000000004', '31000000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000001'),
  ('10000000-0000-4000-a000-000000000004', '31000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000002');

-- ---------- 2nd Saturday generation ----------
select pg_temp.counts($$select count(*) from public.holidays where academic_year_id = '20000000-0000-4000-a000-000000000001' and kind = 'second_saturday'$$,
  12, 'new academic year auto-generates 12 second Saturdays');
select pg_temp.counts($$select count(*) from public.holidays where academic_year_id = '20000000-0000-4000-a000-000000000001' and date = '2030-04-13'$$,
  1, '2nd Saturday of April 2030 is 13 Apr');
select pg_temp.ok(public.generate_second_saturdays('20000000-0000-4000-a000-000000000001') = 0,
  're-running the generator adds no duplicates');

-- =====================================================================
-- ADMIN
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-a000-000000000001');
select pg_temp.counts('select count(*) from public.school_settings', 1, 'admin: reads settings');
select pg_temp.affects($$update public.school_settings set name = name || '' , city = 'Testville' where id = 1$$, 1, 'admin: updates settings');
select pg_temp.lives($$insert into public.academic_years (name, start_date, end_date) values ('TEST-2031-32', '2031-04-01', '2032-03-31')$$, 'admin: creates academic year');
select pg_temp.lives($$insert into public.holidays (academic_year_id, date, name) values ('20000000-0000-4000-a000-000000000001', '2030-08-15', 'Independence Day')$$, 'admin: adds a holiday');
select pg_temp.lives($$insert into public.classes (id, name, sort_order) values ('30000000-0000-4000-a000-000000000009', 'TEST Class 2', 1000)$$, 'admin: creates class');
select pg_temp.affects($$update public.classes set short_name = 'TC' where id = '30000000-0000-4000-a000-000000000001'$$, 1, 'admin: edits class');
select pg_temp.lives($$insert into public.sections (academic_year_id, class_id, name, medium) values ('20000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000009', 'A', 'Telugu')$$, 'admin: creates Telugu-medium section');
select pg_temp.throws($$insert into public.sections (academic_year_id, class_id, name, medium) values ('20000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000009', 'B', 'Urdu')$$, 'section medium must be configured in settings', '23514');
select pg_temp.lives($$insert into public.sections (academic_year_id, class_id, name) values ('20000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000009', 'C')$$, 'admin: section medium may be left unconfirmed');
select pg_temp.lives($$insert into public.subjects (name, code) values ('TEST Telugu', 'TTEL')$$, 'admin: creates subject');
select pg_temp.lives($$insert into public.class_subjects (academic_year_id, class_id, subject_id) values ('20000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000001')$$, 'admin: maps subject to class');
select pg_temp.lives($$insert into public.teacher_assignments (staff_id, section_id, subject_id) values ('10000000-0000-4000-a000-000000000003', '31000000-0000-4000-a000-000000000001', '40000000-0000-4000-a000-000000000001')$$, 'admin: assigns teacher to section+subject');
select pg_temp.lives($$insert into public.staff (employee_code, full_name) values ('TEST-NEW', 'New Staff')$$, 'admin: creates staff record');
select pg_temp.affects($$update public.staff set designation = 'PGT' where employee_code = 'TEST-T1'$$, 1, 'admin: edits staff record');
select pg_temp.counts($$select count(*) from public.audit_logs where table_name = 'classes' and record_id = '30000000-0000-4000-a000-000000000009' and action = 'insert' and actor_user_id = '00000000-0000-4000-a000-000000000001' and actor_role = 'admin'$$,
  1, 'admin: class insert is audit-logged with actor and role');
select pg_temp.counts($$select count(*) from public.classes where id = '30000000-0000-4000-a000-000000000009' and created_by = '00000000-0000-4000-a000-000000000001'$$, 1, 'created_by is stamped');
select pg_temp.affects($$update public.audit_logs set action = 'tampered'$$, 0, 'admin: cannot modify audit log');
select pg_temp.affects($$delete from public.audit_logs$$, 0, 'admin: cannot delete audit log');

-- last-admin guard: make the fixture admin the only active admin first
select pg_temp.logout();
update public.staff set app_role = 'teacher' where app_role = 'admin' and status = 'active'
  and id <> '10000000-0000-4000-a000-000000000001';
select pg_temp.login_as('00000000-0000-4000-a000-000000000001');
select pg_temp.throws($$update public.staff set app_role = 'teacher' where id = '10000000-0000-4000-a000-000000000001'$$, 'cannot demote the last active admin', 'P0001');
select pg_temp.throws($$update public.staff set status = 'left' where id = '10000000-0000-4000-a000-000000000001'$$, 'cannot deactivate the last active admin', 'P0001');
-- maintenance scripts (no signed-in user) may remove admins, e.g. seed:wipe
select pg_temp.logout();
select pg_temp.lives($$update public.staff set status = 'inactive' where id = '10000000-0000-4000-a000-000000000001'$$, 'maintenance (no signed-in user): last-admin guard does not block scripts');
update public.staff set status = 'active' where id = '10000000-0000-4000-a000-000000000001';

-- =====================================================================
-- COMPUTER STAFF
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-a000-000000000002');
select pg_temp.counts('select count(*) from public.school_settings', 1, 'computer staff: reads settings');
select pg_temp.affects($$update public.school_settings set city = 'Hacked' where id = 1$$, 0, 'computer staff: cannot edit settings');
select pg_temp.throws($$insert into public.academic_years (name, start_date, end_date) values ('TEST-X', '2040-04-01', '2041-03-31')$$, 'computer staff: cannot create academic year', '42501');
select pg_temp.throws($$insert into public.holidays (academic_year_id, date, name) values ('20000000-0000-4000-a000-000000000001', '2030-10-02', 'Gandhi Jayanti')$$, 'computer staff: cannot add holiday', '42501');
select pg_temp.throws($$insert into public.classes (name) values ('TEST CS Class')$$, 'computer staff: cannot create class', '42501');
select pg_temp.affects($$update public.classes set name = 'x' where id = '30000000-0000-4000-a000-000000000001'$$, 0, 'computer staff: cannot edit class');
select pg_temp.throws($$insert into public.sections (academic_year_id, class_id, name, medium) values ('20000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', 'Z', 'English')$$, 'computer staff: cannot create section', '42501');
select pg_temp.throws($$insert into public.subjects (name) values ('TEST CS Subject')$$, 'computer staff: cannot create subject', '42501');
select pg_temp.throws($$insert into public.teacher_assignments (staff_id, section_id, subject_id) values ('10000000-0000-4000-a000-000000000003', '31000000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000002')$$, 'computer staff: cannot create teacher assignment', '42501');
select pg_temp.affects($$delete from public.teacher_assignments where section_id = '31000000-0000-4000-a000-000000000002'$$, 0, 'computer staff: cannot delete teacher assignment');
select pg_temp.counts($$select count(*) from public.teacher_assignments where section_id in ('31000000-0000-4000-a000-000000000001', '31000000-0000-4000-a000-000000000002')$$, 3, 'computer staff: sees all teacher assignments');
select pg_temp.counts($$select count(*) from public.staff where employee_code like 'TEST-%'$$, 6, 'computer staff: views all staff records');
select pg_temp.throws($$insert into public.staff (employee_code, full_name) values ('TEST-CS2', 'Sneaky')$$, 'computer staff: cannot create staff', '42501');
select pg_temp.affects($$update public.staff set phone = '9999999999' where employee_code = 'TEST-T1'$$, 0, 'computer staff: cannot edit staff');
select pg_temp.affects($$update public.staff set app_role = 'admin' where employee_code = 'TEST-CS'$$, 0, 'computer staff: cannot promote self to admin');
select pg_temp.counts('select count(*) from public.audit_logs', 0, 'computer staff: cannot read audit log');

-- =====================================================================
-- TEACHER (teacher1 = class teacher of section A; teacher2 teaches A-Science, B-Maths)
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-a000-000000000003');
select pg_temp.counts('select count(*) from public.school_settings', 1, 'teacher: reads settings');
select pg_temp.affects($$update public.school_settings set city = 'Hacked' where id = 1$$, 0, 'teacher: cannot edit settings');
select pg_temp.counts($$select count(*) from public.sections where academic_year_id = '20000000-0000-4000-a000-000000000001'$$, 4, 'teacher: views sections');
select pg_temp.throws($$insert into public.classes (name) values ('TEST T Class')$$, 'teacher: cannot create class', '42501');
select pg_temp.affects($$delete from public.holidays where academic_year_id = '20000000-0000-4000-a000-000000000001'$$, 0, 'teacher: cannot delete holidays');
select pg_temp.throws($$insert into public.teacher_assignments (staff_id, section_id, subject_id) values ('10000000-0000-4000-a000-000000000003', '31000000-0000-4000-a000-000000000002', '40000000-0000-4000-a000-000000000002')$$, 'teacher: cannot assign self', '42501');
select pg_temp.counts($$select count(*) from public.teacher_assignments where section_id = '31000000-0000-4000-a000-000000000001'$$, 2, 'teacher1 (class teacher of A): sees assignments of A');
select pg_temp.counts($$select count(*) from public.teacher_assignments where section_id = '31000000-0000-4000-a000-000000000002'$$, 0, 'teacher1: does not see assignments of B');
select pg_temp.counts($$select count(*) from public.staff where employee_code like 'TEST-%'$$, 1, 'teacher: sees only own staff record');
select pg_temp.affects($$update public.staff set phone = '9999999999' where employee_code = 'TEST-T1'$$, 0, 'teacher: cannot edit own staff record');
select pg_temp.counts($$select count(*) from public.staff_directory() where full_name like 'Test %'$$, 4, 'teacher: staff directory lists colleagues (names only)');
select pg_temp.counts('select count(*) from public.audit_logs', 0, 'teacher: cannot read audit log');
select pg_temp.lives($$select public.log_event('test.event', null, null, '{"k":1}')$$, 'teacher: can record an app event');

select pg_temp.login_as('00000000-0000-4000-a000-000000000004');
select pg_temp.counts($$select count(*) from public.teacher_assignments where section_id in ('31000000-0000-4000-a000-000000000001', '31000000-0000-4000-a000-000000000002')$$, 3, 'teacher2: sees assignments of both sections taught');

-- =====================================================================
-- NO ROLE / INACTIVE / ANON
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-a000-000000000005');
select pg_temp.counts('select count(*) from public.school_settings', 0, 'user without staff role: sees no settings');
select pg_temp.counts('select count(*) from public.classes', 0, 'user without staff role: sees no classes');
select pg_temp.counts('select count(*) from public.staff_directory()', 0, 'user without staff role: empty staff directory');
select pg_temp.throws($$select public.log_event('x')$$, 'user without staff role: cannot log events', '42501');

select pg_temp.login_as('00000000-0000-4000-a000-000000000006');
select pg_temp.throws($$insert into public.classes (name) values ('TEST Old Admin Class')$$, 'admin who has left: loses all write access', '42501');
select pg_temp.counts('select count(*) from public.classes', 0, 'admin who has left: loses read access');

select pg_temp.login_as(null);
select pg_temp.throws('select count(*) from public.school_settings', 'anon: no access to settings', '42501');
select pg_temp.throws('select count(*) from public.staff', 'anon: no access to staff', '42501');

-- =====================================================================
-- AUDIT: immutability + redaction of sensitive columns
-- =====================================================================
select pg_temp.logout();
select pg_temp.throws($$delete from public.audit_logs where table_name = 'classes'$$, 'audit log rows cannot be deleted even by the owner', '42501');
create table public._audit_probe (
  id uuid primary key default gen_random_uuid(), secret text, plain text,
  created_at timestamptz, updated_at timestamptz, created_by uuid, updated_by uuid);
select app.attach_std_triggers('public._audit_probe', '{secret}');
insert into public._audit_probe (id, secret, plain) values ('50000000-0000-4000-a000-000000000001', '123412341234', 'visible');
select pg_temp.counts($$select count(*) from public.audit_logs where table_name = '_audit_probe' and new_data->>'secret' = '[REDACTED]' and new_data->>'plain' = 'visible'$$,
  1, 'sensitive column is redacted in audit log');
select pg_temp.counts($$select count(*) from public.audit_logs where new_data::text like '%123412341234%' or old_data::text like '%123412341234%'$$,
  0, 'raw sensitive value never reaches audit log');

-- =====================================================================
-- STORAGE: branding bucket
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-a000-000000000001');
select pg_temp.lives($$insert into storage.objects (bucket_id, name, owner) values ('branding', 'test/logo.png', auth.uid())$$, 'admin: uploads logo');
select pg_temp.login_as('00000000-0000-4000-a000-000000000002');
select pg_temp.throws($$insert into storage.objects (bucket_id, name) values ('branding', 'test/cs.png')$$, 'computer staff: cannot upload logo', '42501');
select pg_temp.affects($$delete from storage.objects where bucket_id = 'branding' and name = 'test/logo.png'$$, 0, 'computer staff: cannot delete logo');
select pg_temp.login_as('00000000-0000-4000-a000-000000000003');
select pg_temp.throws($$insert into storage.objects (bucket_id, name) values ('branding', 'test/t.png')$$, 'teacher: cannot upload logo', '42501');

-- =====================================================================
-- helper RPCs
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-a000-000000000002');
select pg_temp.ok(public.my_role() = 'computer_staff', 'my_role() returns the caller''s role');
select pg_temp.login_as('00000000-0000-4000-a000-000000000005');
select pg_temp.ok(public.my_role() is null, 'my_role() is null for a user without a staff role');
select pg_temp.login_as(null);
select pg_temp.counts('select count(*) from public.public_branding()', 1, 'anon: can read school name/logo for login page');
select pg_temp.throws('select public.my_role()', 'anon: cannot call my_role()', '42501');
