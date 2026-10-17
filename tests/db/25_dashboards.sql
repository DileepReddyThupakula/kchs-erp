-- Dashboards in one call each: scoped to the person; fee numbers only with fee access. Rolled back.
select pg_temp.fixture_user('00000000-0000-4000-fc10-000000000001', 'admin@db.test');
select pg_temp.fixture_user('00000000-0000-4000-fc10-000000000002', 'ct@db.test');
select pg_temp.fixture_user('00000000-0000-4000-fc10-000000000003', 'duty@db.test');
select pg_temp.fixture_user('00000000-0000-4000-fc10-000000000004', 'fee@db.test');
select pg_temp.fixture_user('00000000-0000-4000-fc10-000000000005', 'desk@db.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('1a100000-0000-4000-fc10-000000000001', '00000000-0000-4000-fc10-000000000001', 'admin',          'DB-ADM', 'Db Admin'),
  ('1a100000-0000-4000-fc10-000000000002', '00000000-0000-4000-fc10-000000000002', 'teacher',        'DB-CT',  'Db Class teacher'),
  ('1a100000-0000-4000-fc10-000000000003', '00000000-0000-4000-fc10-000000000003', 'teacher',        'DB-DUT', 'Db Duty teacher'),
  ('1a100000-0000-4000-fc10-000000000004', '00000000-0000-4000-fc10-000000000004', 'computer_staff', 'DB-FEE', 'Db Fee clerk'),
  ('1a100000-0000-4000-fc10-000000000005', '00000000-0000-4000-fc10-000000000005', 'computer_staff', 'DB-DSK', 'Db Desk');
insert into public.staff_permissions (staff_id, duty) select '1a100000-0000-4000-fc10-000000000003', d from unnest(enum_range(null::public.staff_duty)) d where d <> 'fee_collection';
insert into public.staff_permissions (staff_id, duty) values ('1a100000-0000-4000-fc10-000000000004', 'fee_collection');
insert into public.academic_years (id, name, start_date, end_date) values ('2a100000-0000-4000-fc10-000000000001', 'DB-2077-78', '2077-04-01', '2078-03-31');
insert into public.classes (id, name, sort_order) values ('3a400000-0000-4000-fc10-000000000001', 'DB C1', 991);
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id) values ('3b400000-0000-4000-fc10-000000000001', '2a100000-0000-4000-fc10-000000000001', '3a400000-0000-4000-fc10-000000000001', 'A', '1a100000-0000-4000-fc10-000000000002');
insert into public.students (id, admission_no, full_name, gender, date_of_birth, admission_date) values ('56400000-0000-4000-fc10-000000000001', 'DB-1', 'Db One', 'male', '2070-01-01', '2070-06-01'), ('56400000-0000-4000-fc10-000000000002', 'DB-2', 'Db Two', 'female', '2070-01-01', '2070-06-01');
insert into public.student_enrollments (student_id, academic_year_id, section_id) select id, '2a100000-0000-4000-fc10-000000000001', '3b400000-0000-4000-fc10-000000000001' from public.students where admission_no like 'DB-%';
insert into public.fee_heads (id, name, code, sort_order) values ('62200000-0000-4000-fc10-000000000001', 'DB Tuition', 'DB-TUI', 94);
insert into public.fee_plans (id, academic_year_id, name, kind, due_day) values ('63200000-0000-4000-fc10-000000000001', '2a100000-0000-4000-fc10-000000000001', 'DB Monthly', 'monthly', 10);
insert into public.fee_structure (academic_year_id, class_id, fee_head_id, amount_paise, default_plan_id) values ('2a100000-0000-4000-fc10-000000000001', '3a400000-0000-4000-fc10-000000000001', '62200000-0000-4000-fc10-000000000001', 1200000, '63200000-0000-4000-fc10-000000000001');

insert into public.subjects (id, name, code) values ('5e100000-0000-4000-fc10-000000000001', 'DB Maths', 'DBM');
insert into public.class_subjects (academic_year_id, class_id, subject_id, sort_order) values ('2a100000-0000-4000-fc10-000000000001', '3a400000-0000-4000-fc10-000000000001', '5e100000-0000-4000-fc10-000000000001', 1);
insert into public.teacher_assignments (staff_id, section_id, subject_id) values ('1a100000-0000-4000-fc10-000000000002', '3b400000-0000-4000-fc10-000000000001', '5e100000-0000-4000-fc10-000000000001');
insert into public.exam_components (id, academic_year_id, class_id, name, max_marks) values ('65100000-0000-4000-fc10-000000000001', '2a100000-0000-4000-fc10-000000000001', '3a400000-0000-4000-fc10-000000000001', 'FA1', 20);

create function pg_temp.keys(p jsonb) returns text language sql as $$ select coalesce(string_agg(k, ',' order by k), '') from jsonb_object_keys(p) k $$;

-- ================= Admin
select pg_temp.login_as('00000000-0000-4000-fc10-000000000001');
select pg_temp.ok(pg_temp.keys(public.admin_dashboard('2a100000-0000-4000-fc10-000000000001', '2077-05-20')) like '%fees%', 'admin dashboard has a fees block');
select pg_temp.counts($$select (public.admin_dashboard('2a100000-0000-4000-fc10-000000000001', '2078-03-31') -> 'fees' ->> 'overdue_paise')::bigint$$, 2400000, 'admin dashboard: overdue = 2 students x 12,000 (all dues are past by year end)');
select pg_temp.counts($$select (public.admin_dashboard('2a100000-0000-4000-fc10-000000000001', '2077-04-10') -> 'fees' ->> 'defaulters')::int$$, 2, 'admin dashboard: 2 students owe on 10 April');
select pg_temp.counts($$select (public.admin_dashboard('2a100000-0000-4000-fc10-000000000001', '2077-04-10') -> 'exam' ->> 'unlocked')::int$$, 0, 'admin dashboard: no result groups here');
-- the admin dashboard is Admin only
select pg_temp.login_as('00000000-0000-4000-fc10-000000000004');
select pg_temp.throws($$select public.admin_dashboard('2a100000-0000-4000-fc10-000000000001', '2077-04-10')$$, 'the fee clerk cannot call the Admin dashboard', '42501');
-- ================= staff dashboard
select pg_temp.login_as('00000000-0000-4000-fc10-000000000001');
select pg_temp.throws($$select public.staff_dashboard('2a100000-0000-4000-fc10-000000000001', '2077-04-10')$$, 'Admin does not use the staff dashboard', '42501');
select pg_temp.login_as('00000000-0000-4000-fc10-000000000002');
select pg_temp.counts($$select (public.staff_dashboard('2a100000-0000-4000-fc10-000000000001', '2077-04-10') -> 'counts' ->> 'students')::int$$, 2, 'class teacher: sees their 2 students');
select pg_temp.counts($$select (x ->> 'missing')::int from jsonb_array_elements(public.staff_dashboard('2a100000-0000-4000-fc10-000000000001', '2077-04-10') -> 'marks_to_enter') x where x ->> 'subject' = 'DB Maths' and x ->> 'exam' = 'FA1'$$, 2, 'class teacher: 2 FA1 marks still to enter for their own subject');
select pg_temp.ok(public.staff_dashboard('2a100000-0000-4000-fc10-000000000001', '2077-04-10') -> 'fees' = 'null'::jsonb, 'class teacher: the fees block is null');
select pg_temp.ok(not (public.staff_dashboard('2a100000-0000-4000-fc10-000000000001', '2077-04-10')::text ~* 'paise|overdue|collected'), 'class teacher: no fee word anywhere in the dashboard');
select pg_temp.ok(public.staff_dashboard('2a100000-0000-4000-fc10-000000000001', '2077-04-10') -> 'unmarked' = 'null'::jsonb, 'class teacher: no all-classes attendance list');
select pg_temp.login_as('00000000-0000-4000-fc10-000000000003');
select pg_temp.counts($$select jsonb_array_length(public.staff_dashboard('2a100000-0000-4000-fc10-000000000001', '2077-04-10') -> 'marks_to_enter')$$, 0, 'a teacher with the marks duty but no subject of their own: nothing to enter (their own pairs only)');
select pg_temp.counts($$select (public.staff_dashboard('2a100000-0000-4000-fc10-000000000001', '2077-04-10') -> 'counts' ->> 'students')::int$$, 0, 'a teacher with every other duty: their own students only (none here), not the whole school');
select pg_temp.ok(public.staff_dashboard('2a100000-0000-4000-fc10-000000000001', '2077-04-10') -> 'fees' = 'null'::jsonb, 'a teacher with every other duty: the fees block is null');
select pg_temp.ok(jsonb_typeof(public.staff_dashboard('2a100000-0000-4000-fc10-000000000001', '2077-04-10') -> 'unmarked') = 'array', 'with the all-classes attendance duty: the unmarked list is there');
select pg_temp.login_as('00000000-0000-4000-fc10-000000000004');
select pg_temp.ok(jsonb_typeof(public.staff_dashboard('2a100000-0000-4000-fc10-000000000001', '2078-03-31') -> 'fees') = 'object', 'fee clerk: has the fees block');
select pg_temp.counts($$select (public.staff_dashboard('2a100000-0000-4000-fc10-000000000001', '2078-03-31') -> 'fees' ->> 'overdue_paise')::bigint$$, 2400000, 'fee clerk: the same overdue number as Admin');
select pg_temp.login_as('00000000-0000-4000-fc10-000000000005');
select pg_temp.ok(public.staff_dashboard('2a100000-0000-4000-fc10-000000000001', '2078-03-31') -> 'fees' = 'null'::jsonb, 'office without fee access: the fees block is null');
-- removing the access removes the block at once
select pg_temp.login_as('00000000-0000-4000-fc10-000000000001');
select pg_temp.affects($$delete from public.staff_permissions where staff_id = '1a100000-0000-4000-fc10-000000000004'$$, 1, 'admin removes the fee access');
select pg_temp.login_as('00000000-0000-4000-fc10-000000000004');
select pg_temp.ok(public.staff_dashboard('2a100000-0000-4000-fc10-000000000001', '2078-03-31') -> 'fees' = 'null'::jsonb, 'access removed: the fees block disappears at once');
select pg_temp.login_as(null);
select pg_temp.throws($$select public.staff_dashboard('2a100000-0000-4000-fc10-000000000001', '2077-04-10')$$, 'anonymous: nothing', '42501');

-- ================= the teacher's diary card and "today" strip come from the same call
select pg_temp.logout();
insert into public.academic_years (id, name, start_date, end_date) values ('2a100000-0000-4000-fc10-000000000002', 'DB-NOW', app.today_ist() - 30, app.today_ist() + 300);
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id) values ('3b400000-0000-4000-fc10-000000000002', '2a100000-0000-4000-fc10-000000000002', '3a400000-0000-4000-fc10-000000000001', 'N', '1a100000-0000-4000-fc10-000000000002');
insert into public.teacher_assignments (staff_id, section_id, subject_id) values ('1a100000-0000-4000-fc10-000000000002', '3b400000-0000-4000-fc10-000000000002', '5e100000-0000-4000-fc10-000000000001');
select pg_temp.login_as('00000000-0000-4000-fc10-000000000002');
select pg_temp.counts($$select jsonb_array_length(public.staff_dashboard('2a100000-0000-4000-fc10-000000000002', app.today_ist()) -> 'diary_todo')$$, 2, 'diary card: the Maths line and the class remark are still to submit');
select pg_temp.counts($$select count(*) from jsonb_array_elements(public.staff_dashboard('2a100000-0000-4000-fc10-000000000002', app.today_ist()) -> 'diary_todo') x where x ->> 'subject' is null and x ->> 'status' = 'new'$$, 1, 'diary card: the class remark is "not started"');
select pg_temp.ok(jsonb_typeof(public.staff_dashboard('2a100000-0000-4000-fc10-000000000002', app.today_ist()) -> 'today') = 'array', 'the "today" periods come in the same call');
select pg_temp.login_as('00000000-0000-4000-fc10-000000000005');
select pg_temp.counts($$select jsonb_array_length(public.staff_dashboard('2a100000-0000-4000-fc10-000000000002', app.today_ist()) -> 'diary_todo')$$, 0, 'office staff: no diary to submit');
select pg_temp.login_as('00000000-0000-4000-fc10-000000000003');
select pg_temp.ok(jsonb_typeof(public.staff_dashboard('2a100000-0000-4000-fc10-000000000002', app.today_ist()) -> 'diary_board') = 'array', 'the notices & diary duty gets the class-diary board');
select pg_temp.login_as('00000000-0000-4000-fc10-000000000002');
select pg_temp.ok(public.staff_dashboard('2a100000-0000-4000-fc10-000000000002', app.today_ist()) -> 'diary_board' = 'null'::jsonb, 'a plain teacher does not');

-- ================= the diary card with several subjects: draft and submitted lines, someone else's draft, a published remark
select pg_temp.logout();
insert into public.subjects (id, name, code) values ('5e100000-0000-4000-fc10-000000000002', 'DB Science', 'DBS'), ('5e100000-0000-4000-fc10-000000000003', 'DB English', 'DBE');
insert into public.teacher_assignments (staff_id, section_id, subject_id) values
  ('1a100000-0000-4000-fc10-000000000002', '3b400000-0000-4000-fc10-000000000002', '5e100000-0000-4000-fc10-000000000002'),
  ('1a100000-0000-4000-fc10-000000000002', '3b400000-0000-4000-fc10-000000000002', '5e100000-0000-4000-fc10-000000000003');
insert into public.diary_entries (id, academic_year_id, entry_date, kind, subject_id, body, status, author_id) values
  ('6d100000-0000-4000-fc10-000000000001', '2a100000-0000-4000-fc10-000000000002', app.today_ist(), 'subject', '5e100000-0000-4000-fc10-000000000001', 'Maths homework draft', 'draft', '1a100000-0000-4000-fc10-000000000002'),
  ('6d100000-0000-4000-fc10-000000000002', '2a100000-0000-4000-fc10-000000000002', app.today_ist(), 'subject', '5e100000-0000-4000-fc10-000000000002', 'Science submitted', 'submitted', '1a100000-0000-4000-fc10-000000000002'),
  ('6d100000-0000-4000-fc10-000000000003', '2a100000-0000-4000-fc10-000000000002', app.today_ist(), 'subject', '5e100000-0000-4000-fc10-000000000003', 'Someone else''s English draft', 'draft', '1a100000-0000-4000-fc10-000000000003'),
  ('6d100000-0000-4000-fc10-000000000004', '2a100000-0000-4000-fc10-000000000002', app.today_ist() - 1, 'remark', null, 'Yesterday''s remark', 'draft', '1a100000-0000-4000-fc10-000000000002');
insert into public.diary_entry_sections (entry_id, section_id) select id, '3b400000-0000-4000-fc10-000000000002' from public.diary_entries where id::text like '6d100000-%-fc10-%';
select pg_temp.login_as('00000000-0000-4000-fc10-000000000002');
create temp table _dd as select x from jsonb_array_elements(public.staff_dashboard('2a100000-0000-4000-fc10-000000000002', app.today_ist()) -> 'diary_todo') x;
select pg_temp.counts($$select count(*) from _dd$$, 3, 'diary card, 3 subjects + remark: Maths (draft), English (not started) and the class remark are still to do');
select pg_temp.counts($$select count(*) from _dd where x ->> 'subject' = 'DB Maths' and x ->> 'status' = 'draft'$$, 1, 'diary card: Maths shows as Draft');
select pg_temp.counts($$select count(*) from _dd where x ->> 'subject' = 'DB Science'$$, 0, 'diary card: Science is submitted, so it is not listed');
select pg_temp.counts($$select count(*) from _dd where x ->> 'subject' = 'DB English' and x ->> 'status' = 'new'$$, 1, 'diary card: someone else''s English draft does not count as this teacher''s (still Not started)');
select pg_temp.counts($$select count(*) from _dd where x ->> 'subject' is null and x ->> 'status' = 'new'$$, 1, 'diary card: yesterday''s draft remark does not count for today');
select pg_temp.logout();
update public.diary_entries set status = 'submitted' where id = '6d100000-0000-4000-fc10-000000000001';
select pg_temp.login_as('00000000-0000-4000-fc10-000000000002');
select pg_temp.counts($$select count(*) from jsonb_array_elements(public.staff_dashboard('2a100000-0000-4000-fc10-000000000002', app.today_ist()) -> 'diary_todo') x where x ->> 'subject' = 'DB Maths'$$, 0, 'diary card: once Maths is submitted it leaves the list');
