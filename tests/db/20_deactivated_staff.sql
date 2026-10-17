-- A deactivated / left / role-revoked / removed person gets nothing, even with a still-valid token
-- (a token only proves who they are; the database re-checks on every query).
select pg_temp.fixture_user('00000000-0000-4000-c000-000000000001', 'adm@deact.test');
select pg_temp.fixture_user('00000000-0000-4000-c000-000000000002', 't@deact.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('11000000-0000-4000-c000-000000000001', '00000000-0000-4000-c000-000000000001', 'admin',   'DEACT-ADM', 'Deact Admin'),
  ('11000000-0000-4000-c000-000000000002', '00000000-0000-4000-c000-000000000002', 'teacher', 'DEACT-T',   'Deact Teacher');
insert into public.staff_permissions (staff_id, duty) values
  ('11000000-0000-4000-c000-000000000002', 'student_records'), ('11000000-0000-4000-c000-000000000002', 'all_class_marks'), ('11000000-0000-4000-c000-000000000002', 'notices_diary');
insert into public.students (id, admission_no, full_name, gender, date_of_birth) values
  ('51000000-0000-4000-c000-000000000001', 'DEACT-1', 'Deact Student', 'male', '2014-01-01');

-- active teacher: sees own row, has duties, sees the student
select pg_temp.login_as('00000000-0000-4000-c000-000000000002');
select pg_temp.ok((select count(*) from public.staff where user_id = '00000000-0000-4000-c000-000000000002') = 1, 'active teacher reads their own staff row');
select pg_temp.ok((select count(*) from public.my_duties()) = 3, 'active teacher has 3 duties');
select pg_temp.ok((select count(*) from public.students where id = '51000000-0000-4000-c000-000000000001') = 1, 'active teacher with student_records sees the student');

select pg_temp.logout();
-- for each way of losing access: same login (same token) afterwards gets nothing
create function pg_temp.nothing(p_user uuid, p_what text) returns void language plpgsql as $$
declare v_staff int; v_duties int; v_students int; v_admin boolean; v_up int;
begin
  perform pg_temp.login_as(p_user);
  select count(*) into v_staff from public.staff;
  select count(*) into v_duties from public.my_duties();
  select count(*) into v_students from public.students;
  v_admin := app.is_admin();
  perform pg_temp.ok(v_staff = 0, p_what || ': reads no staff row (not even their own)', v_staff::text);
  perform pg_temp.ok(v_duties = 0, p_what || ': has no duties');
  perform pg_temp.ok(v_students = 0, p_what || ': sees no students');
  perform pg_temp.ok(not v_admin and not app.is_teacher() and not app.is_staff_user(), p_what || ': is neither admin, teacher nor staff');
  perform pg_temp.logout();
end $$;

-- teacher
update public.staff set status = 'inactive' where id = '11000000-0000-4000-c000-000000000002';
select pg_temp.nothing('00000000-0000-4000-c000-000000000002', 'teacher deactivated');
update public.staff set status = 'left' where id = '11000000-0000-4000-c000-000000000002';
select pg_temp.nothing('00000000-0000-4000-c000-000000000002', 'teacher left');
update public.staff set status = 'active', app_role = null where id = '11000000-0000-4000-c000-000000000002';
select pg_temp.nothing('00000000-0000-4000-c000-000000000002', 'teacher role revoked');
update public.staff set app_role = 'teacher', user_id = null where id = '11000000-0000-4000-c000-000000000002';
select pg_temp.nothing('00000000-0000-4000-c000-000000000002', 'teacher login unlinked');
delete from public.staff where id = '11000000-0000-4000-c000-000000000002';
select pg_temp.nothing('00000000-0000-4000-c000-000000000002', 'teacher record deleted');

-- admin
update public.staff set status = 'inactive' where id = '11000000-0000-4000-c000-000000000001';
select pg_temp.nothing('00000000-0000-4000-c000-000000000001', 'admin deactivated');
update public.staff set status = 'active', app_role = null where id = '11000000-0000-4000-c000-000000000001';
select pg_temp.nothing('00000000-0000-4000-c000-000000000001', 'admin role revoked');

-- writes by a deactivated admin
update public.staff set status = 'inactive', app_role = 'admin' where id = '11000000-0000-4000-c000-000000000001';
select pg_temp.login_as('00000000-0000-4000-c000-000000000001');
select pg_temp.throws($$insert into public.notices (title, body) values ('x', 'x')$$, 'deactivated admin cannot create a notice');
select pg_temp.affects($$update public.staff set app_role = 'admin', status = 'active' where id = '11000000-0000-4000-c000-000000000001'$$, 0, 'deactivated admin cannot reactivate themselves');
select pg_temp.logout();
