-- Permission model v2: duties (staff_permissions) + has_duty().
-- Runs as postgres inside a rolled-back transaction (see scripts/test-db.mjs).

-- ---------- fixtures ----------
update public.school_settings set mediums = '{English,Telugu}' where id = 1;
select pg_temp.fixture_user('00000000-0000-4000-b000-000000000001', 'admin@duty.test');
select pg_temp.fixture_user('00000000-0000-4000-b000-000000000002', 'teacher-a@duty.test');
select pg_temp.fixture_user('00000000-0000-4000-b000-000000000003', 'teacher-b@duty.test');
select pg_temp.fixture_user('00000000-0000-4000-b000-000000000004', 'legacy-cs@duty.test');

insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('11000000-0000-4000-b000-000000000001', '00000000-0000-4000-b000-000000000001', 'admin',          'DUTY-ADM', 'Duty Admin'),
  ('11000000-0000-4000-b000-000000000002', '00000000-0000-4000-b000-000000000002', 'teacher',        'DUTY-TA',  'Duty Teacher A'),
  ('11000000-0000-4000-b000-000000000003', '00000000-0000-4000-b000-000000000003', 'teacher',        'DUTY-TB',  'Duty Teacher B'),
  ('11000000-0000-4000-b000-000000000004', '00000000-0000-4000-b000-000000000004', 'computer_staff', 'DUTY-CS',  'Legacy Office');

insert into public.academic_years (id, name, start_date, end_date) values
  ('21000000-0000-4000-b000-000000000001', 'DUTY-2040-41', '2040-04-01', '2041-03-31');
insert into public.classes (id, name, sort_order) values ('32000000-0000-4000-b000-000000000001', 'DUTY Class', 998);
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id) values
  ('33000000-0000-4000-b000-000000000001', '21000000-0000-4000-b000-000000000001', '32000000-0000-4000-b000-000000000001', 'A', '11000000-0000-4000-b000-000000000002'),
  ('33000000-0000-4000-b000-000000000002', '21000000-0000-4000-b000-000000000001', '32000000-0000-4000-b000-000000000001', 'B', null);
insert into public.subjects (id, name) values ('41000000-0000-4000-b000-000000000001', 'DUTY Maths');
insert into public.teacher_assignments (staff_id, section_id, subject_id) values
  ('11000000-0000-4000-b000-000000000003', '33000000-0000-4000-b000-000000000002', '41000000-0000-4000-b000-000000000001');

-- =====================================================================
-- Defaults: duties are off; admin has every duty
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-b000-000000000002');
select pg_temp.ok(not public.has_duty('fee_collection'), 'teacher: no duties by default (fee_collection off)');
select pg_temp.counts('select count(*) from public.my_duties()', 0, 'teacher: my_duties() is empty by default');
-- without timetable_edit, teacher A sees only the section they teach (A has no assignments; B is not theirs)
select pg_temp.counts($$select count(*) from public.teacher_assignments where section_id = '33000000-0000-4000-b000-000000000002'$$,
  0, 'teacher without timetable_edit: blocked from other sections'' assignments');

select pg_temp.login_as('00000000-0000-4000-b000-000000000001');
select pg_temp.ok(public.has_duty('government_ids_view') and public.has_duty('fee_collection'), 'admin: has every duty');
select pg_temp.counts('select count(*) from public.my_duties()', 8, 'admin: my_duties() lists all 8 duties');

-- =====================================================================
-- Only Admin can grant / revoke
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-b000-000000000002');
select pg_temp.throws($$insert into public.staff_permissions (staff_id, duty) values ('11000000-0000-4000-b000-000000000002', 'fee_collection')$$,
  'teacher: cannot grant a duty to themselves', '42501');
select pg_temp.throws($$insert into public.staff_permissions (staff_id, duty) values ('11000000-0000-4000-b000-000000000003', 'fee_collection')$$,
  'teacher: cannot grant a duty to another teacher', '42501');

select pg_temp.login_as('00000000-0000-4000-b000-000000000004');
select pg_temp.throws($$insert into public.staff_permissions (staff_id, duty) values ('11000000-0000-4000-b000-000000000002', 'fee_collection')$$,
  'legacy computer staff: cannot grant duties', '42501');

select pg_temp.login_as('00000000-0000-4000-b000-000000000001');
select pg_temp.lives($$insert into public.staff_permissions (staff_id, duty, granted_by) values ('11000000-0000-4000-b000-000000000002', 'timetable_edit', '00000000-0000-4000-b000-000000000004')$$,
  'admin: grants timetable_edit to teacher A');
select pg_temp.lives($$insert into public.staff_permissions (staff_id, duty) values ('11000000-0000-4000-b000-000000000002', 'fee_collection')$$,
  'admin: grants fee_collection to teacher A');
select pg_temp.counts($$select count(*) from public.staff_permissions where staff_id = '11000000-0000-4000-b000-000000000002' and duty = 'timetable_edit' and granted_by = '00000000-0000-4000-b000-000000000001'$$,
  1, 'granted_by is always the signed-in Admin (client value ignored)');
select pg_temp.counts($$select count(*) from public.audit_logs where table_name = 'staff_permissions' and action = 'insert' and actor_role = 'admin' and new_data->>'duty' = 'fee_collection'$$,
  1, 'grant is written to the audit log');

-- =====================================================================
-- With the duty: allowed. Other duties still off.
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-b000-000000000002');
select pg_temp.ok(public.has_duty('fee_collection'), 'teacher with fee_collection: has_duty is true');
select pg_temp.ok(not public.has_duty('student_records'), 'teacher with fee_collection: other duties stay off');
select pg_temp.counts($$select count(*) from public.teacher_assignments where section_id = '33000000-0000-4000-b000-000000000002'$$,
  1, 'teacher with timetable_edit: sees all sections'' assignments');
select pg_temp.counts($$select count(*) from public.staff_permissions where staff_id = '11000000-0000-4000-b000-000000000002'$$,
  2, 'teacher: can see own duties');
select pg_temp.affects($$delete from public.staff_permissions where staff_id = '11000000-0000-4000-b000-000000000002'$$,
  0, 'teacher: cannot revoke own duties');
-- a duty adds module access only, never Admin-only powers
select pg_temp.affects($$update public.school_settings set city = 'X' where id = 1$$, 0, 'teacher with duties: still cannot edit settings');
select pg_temp.throws($$insert into public.teacher_assignments (staff_id, section_id, subject_id) values ('11000000-0000-4000-b000-000000000002', '33000000-0000-4000-b000-000000000002', '41000000-0000-4000-b000-000000000001')$$,
  'teacher with timetable_edit: still cannot edit teacher assignments', '42501');
select pg_temp.counts($$select count(*) from public.staff where employee_code like 'DUTY-%'$$, 1, 'teacher with duties: still sees only own staff record');

select pg_temp.login_as('00000000-0000-4000-b000-000000000003');
select pg_temp.ok(not public.has_duty('fee_collection'), 'duties are per teacher (teacher B unaffected)');
select pg_temp.counts($$select count(*) from public.staff_permissions where staff_id = '11000000-0000-4000-b000-000000000002'$$,
  0, 'teacher: cannot see another teacher''s duties');

-- =====================================================================
-- Revoke: stops working immediately
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-b000-000000000001');
select pg_temp.affects($$delete from public.staff_permissions where staff_id = '11000000-0000-4000-b000-000000000002' and duty in ('timetable_edit', 'fee_collection')$$,
  2, 'admin: revokes both duties');
select pg_temp.counts($$select count(*) from public.audit_logs where table_name = 'staff_permissions' and action = 'delete' and actor_role = 'admin'$$,
  2, 'revokes are written to the audit log');
select pg_temp.affects($$update public.staff_permissions set duty = 'student_records'$$, 0, 'duties cannot be edited in place (revoke + grant only)');

select pg_temp.login_as('00000000-0000-4000-b000-000000000002');
select pg_temp.ok(not public.has_duty('fee_collection'), 'revoked duty stops working immediately (has_duty false)');
select pg_temp.counts($$select count(*) from public.teacher_assignments where section_id = '33000000-0000-4000-b000-000000000002'$$,
  0, 'revoked timetable_edit: blocked again from other sections');

-- =====================================================================
-- computer_staff: kept in the database, assignable by nobody
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-b000-000000000001');
select pg_temp.throws($$update public.staff set app_role = 'computer_staff' where id = '11000000-0000-4000-b000-000000000003'$$,
  'admin: cannot assign the Computer Staff role', 'P0001');
select pg_temp.throws($$insert into public.staff (employee_code, full_name, app_role) values ('DUTY-NEW', 'New', 'computer_staff')$$,
  'admin: cannot create a Computer Staff', 'P0001');
select pg_temp.lives($$update public.staff set designation = 'Clerk' where id = '11000000-0000-4000-b000-000000000004'$$,
  'admin: can still edit an existing legacy Computer Staff row');
select pg_temp.lives($$update public.staff set app_role = 'teacher' where id = '11000000-0000-4000-b000-000000000004'$$,
  'admin: can move a legacy Computer Staff to teacher');

select pg_temp.login_as(null);
select pg_temp.throws($$select public.has_duty('fee_collection')$$, 'anon: cannot call has_duty', '42501');
select pg_temp.throws('select count(*) from public.staff_permissions', 'anon: no access to duties', '42501');
