-- One-call page functions (Collect fee, Marks entry, Results): same answers and the same rules as the queries they replace. Rolled back.
select pg_temp.fixture_user('00000000-0000-4000-fd10-000000000001', 'admin@pf2.test');
select pg_temp.fixture_user('00000000-0000-4000-fd10-000000000002', 't1@pf2.test');      -- teaches Maths in A
select pg_temp.fixture_user('00000000-0000-4000-fd10-000000000003', 'duty@pf2.test');    -- every duty except fees
select pg_temp.fixture_user('00000000-0000-4000-fd10-000000000004', 'fee@pf2.test');     -- office, fee access
select pg_temp.fixture_user('00000000-0000-4000-fd10-000000000005', 'desk@pf2.test');    -- office, no fee access
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('1b100000-0000-4000-fd10-000000000001', '00000000-0000-4000-fd10-000000000001', 'admin',          'PF2-ADM', 'Pf2 Admin'),
  ('1b100000-0000-4000-fd10-000000000002', '00000000-0000-4000-fd10-000000000002', 'teacher',        'PF2-T1',  'Pf2 Teacher'),
  ('1b100000-0000-4000-fd10-000000000003', '00000000-0000-4000-fd10-000000000003', 'teacher',        'PF2-DUT', 'Pf2 Duty'),
  ('1b100000-0000-4000-fd10-000000000004', '00000000-0000-4000-fd10-000000000004', 'computer_staff', 'PF2-FEE', 'Pf2 Fee'),
  ('1b100000-0000-4000-fd10-000000000005', '00000000-0000-4000-fd10-000000000005', 'computer_staff', 'PF2-DSK', 'Pf2 Desk');
insert into public.staff_permissions (staff_id, duty) select '1b100000-0000-4000-fd10-000000000003', d from unnest(enum_range(null::public.staff_duty)) d where d <> 'fee_collection';
insert into public.staff_permissions (staff_id, duty) values ('1b100000-0000-4000-fd10-000000000004', 'fee_collection'), ('1b100000-0000-4000-fd10-000000000005', 'student_records');
insert into public.academic_years (id, name, start_date, end_date) values ('2b100000-0000-4000-fd10-000000000001', 'PF2-2076', '2076-04-01', '2077-03-31');
insert into public.classes (id, name, sort_order) values ('3a500000-0000-4000-fd10-000000000001', 'PF2 C1', 995);
insert into public.sections (id, academic_year_id, class_id, name) values
  ('3b500000-0000-4000-fd10-000000000001', '2b100000-0000-4000-fd10-000000000001', '3a500000-0000-4000-fd10-000000000001', 'A'),
  ('3b500000-0000-4000-fd10-000000000002', '2b100000-0000-4000-fd10-000000000001', '3a500000-0000-4000-fd10-000000000001', 'B');
insert into public.subjects (id, name, code) values ('5f100000-0000-4000-fd10-000000000001', 'PF2 Maths', 'PF2M'), ('5f100000-0000-4000-fd10-000000000002', 'PF2 Science', 'PF2S');
insert into public.class_subjects (academic_year_id, class_id, subject_id, sort_order) values
  ('2b100000-0000-4000-fd10-000000000001', '3a500000-0000-4000-fd10-000000000001', '5f100000-0000-4000-fd10-000000000001', 1),
  ('2b100000-0000-4000-fd10-000000000001', '3a500000-0000-4000-fd10-000000000001', '5f100000-0000-4000-fd10-000000000002', 2);
insert into public.teacher_assignments (staff_id, section_id, subject_id) values ('1b100000-0000-4000-fd10-000000000002', '3b500000-0000-4000-fd10-000000000001', '5f100000-0000-4000-fd10-000000000001');
insert into public.students (id, admission_no, full_name, gender, date_of_birth, admission_date) values
  ('56500000-0000-4000-fd10-000000000001', 'PF2-1', 'Pf2 Ana', 'female', '2066-01-01', '2070-06-01'),
  ('56500000-0000-4000-fd10-000000000002', 'PF2-2', 'Pf2 Bala', 'male', '2066-01-01', '2070-06-01'),
  ('56500000-0000-4000-fd10-000000000003', 'PF2-3', 'Pf2 Chitra', 'female', '2066-01-01', '2070-06-01');
insert into public.student_enrollments (student_id, academic_year_id, section_id, roll_no) values
  ('56500000-0000-4000-fd10-000000000001', '2b100000-0000-4000-fd10-000000000001', '3b500000-0000-4000-fd10-000000000001', 2),
  ('56500000-0000-4000-fd10-000000000002', '2b100000-0000-4000-fd10-000000000001', '3b500000-0000-4000-fd10-000000000001', 1),
  ('56500000-0000-4000-fd10-000000000003', '2b100000-0000-4000-fd10-000000000001', '3b500000-0000-4000-fd10-000000000002', 1);
insert into public.guardians (id, full_name, phone) values ('57500000-0000-4000-fd10-000000000001', 'Pf2 Father', '9000000001'), ('57500000-0000-4000-fd10-000000000002', 'Pf2 Mother', '9000000002');
insert into public.student_guardians (student_id, guardian_id, relation, is_primary) values
  ('56500000-0000-4000-fd10-000000000001', '57500000-0000-4000-fd10-000000000001', 'father', false),
  ('56500000-0000-4000-fd10-000000000001', '57500000-0000-4000-fd10-000000000002', 'mother', true);
insert into public.exam_components (id, academic_year_id, class_id, name, max_marks, sort_order) values
  ('65200000-0000-4000-fd10-000000000001', '2b100000-0000-4000-fd10-000000000001', '3a500000-0000-4000-fd10-000000000001', 'FA1', 20, 1),
  ('65200000-0000-4000-fd10-000000000002', '2b100000-0000-4000-fd10-000000000001', '3a500000-0000-4000-fd10-000000000001', 'SA1', 80, 2);
insert into public.result_groups (id, academic_year_id, class_id, name, kind, sort_order) values ('64200000-0000-4000-fd10-000000000001', '2b100000-0000-4000-fd10-000000000001', '3a500000-0000-4000-fd10-000000000001', 'Term 1', 'term', 1);
insert into public.result_group_members (group_id, component_id, sort_order) values ('64200000-0000-4000-fd10-000000000001', '65200000-0000-4000-fd10-000000000001', 1), ('64200000-0000-4000-fd10-000000000001', '65200000-0000-4000-fd10-000000000002', 2);
-- fees: 12,000 a year, monthly
insert into public.fee_heads (id, name, code, sort_order) values ('62300000-0000-4000-fd10-000000000001', 'PF2 Tuition', 'PF2-TUI', 95);
insert into public.fee_plans (id, academic_year_id, name, kind, due_day) values ('63300000-0000-4000-fd10-000000000001', '2b100000-0000-4000-fd10-000000000001', 'PF2 Monthly', 'monthly', 10);
insert into public.fee_structure (academic_year_id, class_id, fee_head_id, amount_paise, default_plan_id) values ('2b100000-0000-4000-fd10-000000000001', '3a500000-0000-4000-fd10-000000000001', '62300000-0000-4000-fd10-000000000001', 1200000, '63300000-0000-4000-fd10-000000000001');

-- ================= marks entry
select pg_temp.login_as('00000000-0000-4000-fd10-000000000002');
create temp table _m as select public.marks_page('2b100000-0000-4000-fd10-000000000001') j;
grant all on _m to authenticated;
select pg_temp.counts($$select jsonb_array_length(j -> 'sections') from _m$$, 1, 'marks page (teacher): only the section they teach a subject in');
select pg_temp.ok((select j -> 'section' ->> 'name' from _m) = 'A' and (select (j ->> 'all')::boolean from _m) = false, 'marks page (teacher): section A is chosen; not "all"');
select pg_temp.counts($$select jsonb_array_length(j -> 'subjects') from _m$$, 1, 'marks page (teacher): only their own subject (Maths), not Science');
select pg_temp.ok((select j ->> 'component_id' from _m) = '65200000-0000-4000-fd10-000000000001', 'marks page: the first exam (FA1) is the default');
select pg_temp.ok((select string_agg(s ->> 'name', ',' order by o) from _m, jsonb_array_elements(j -> 'students') with ordinality t(s, o)) = 'Pf2 Bala,Pf2 Ana', 'marks page: students in roll order');
select pg_temp.counts($$select (j ->> 'pending')::int from _m$$, 0, 'marks page (teacher): the pending count is for the marks duty only');
select pg_temp.ok((select jsonb_array_length(public.marks_page('2b100000-0000-4000-fd10-000000000001', '3b500000-0000-4000-fd10-000000000002') -> 'sections')) = 1
  and (public.marks_page('2b100000-0000-4000-fd10-000000000001', '3b500000-0000-4000-fd10-000000000002') -> 'section' ->> 'name') = 'A', 'marks page (teacher): asking for section B (not theirs) falls back to A');
select pg_temp.ok((public.marks_page('2b100000-0000-4000-fd10-000000000001', null, null, '5f100000-0000-4000-fd10-000000000002') ->> 'subject_id') = '5f100000-0000-4000-fd10-000000000001', 'marks page (teacher): asking for Science (not theirs) falls back to Maths');
select pg_temp.login_as('00000000-0000-4000-fd10-000000000003');
select pg_temp.counts($$select jsonb_array_length(public.marks_page('2b100000-0000-4000-fd10-000000000001') -> 'sections') - (select count(*) from public.sections where academic_year_id = '2b100000-0000-4000-fd10-000000000001')$$, 0, 'marks page (marks duty): every section of the year');
select pg_temp.counts($$select jsonb_array_length(public.marks_page('2b100000-0000-4000-fd10-000000000001') -> 'subjects')$$, 2, 'marks page (marks duty): every marks subject');
select pg_temp.counts($$select (public.marks_page('2b100000-0000-4000-fd10-000000000001') ->> 'pending')::int$$, 2, 'marks page (marks duty): FA1 Maths in A has 2 marks pending');
select pg_temp.login_as('00000000-0000-4000-fd10-000000000005');
select pg_temp.counts($$select jsonb_array_length(public.marks_page('2b100000-0000-4000-fd10-000000000001') -> 'sections')$$, 0, 'marks page (office, no marks duty): nothing');
select pg_temp.login_as(null);
select pg_temp.throws($$select public.marks_page('2b100000-0000-4000-fd10-000000000001')$$, 'marks page: anonymous refused');

-- ================= results
select pg_temp.logout();
insert into public.subject_results (academic_year_id, class_id, section_id, student_id, group_id, subject_id, scored, max_marks, pct, pass_percent, passed, missing) values
  ('2b100000-0000-4000-fd10-000000000001', '3a500000-0000-4000-fd10-000000000001', '3b500000-0000-4000-fd10-000000000001', '56500000-0000-4000-fd10-000000000001', '64200000-0000-4000-fd10-000000000001', '5f100000-0000-4000-fd10-000000000001', 70, 100, 70, 35, true, 0),
  ('2b100000-0000-4000-fd10-000000000001', '3a500000-0000-4000-fd10-000000000001', '3b500000-0000-4000-fd10-000000000001', '56500000-0000-4000-fd10-000000000001', '64200000-0000-4000-fd10-000000000001', '5f100000-0000-4000-fd10-000000000002', 30, 100, 30, 35, false, 0);
insert into public.student_results (academic_year_id, class_id, section_id, student_id, group_id, scored, max_marks, pct, grade, result, subjects_count, failed_count) values
  ('2b100000-0000-4000-fd10-000000000001', '3a500000-0000-4000-fd10-000000000001', '3b500000-0000-4000-fd10-000000000001', '56500000-0000-4000-fd10-000000000001', '64200000-0000-4000-fd10-000000000001', 100, 200, 50, 'C2', 'fail', 2, 1);
select pg_temp.login_as('00000000-0000-4000-fd10-000000000002');
select pg_temp.counts($$select jsonb_array_length(public.results_page('2b100000-0000-4000-fd10-000000000001') -> 'results')$$, 1, 'results page (teacher): only their own subject''s result (Maths), not Science');
select pg_temp.counts($$select jsonb_array_length(public.results_page('2b100000-0000-4000-fd10-000000000001') -> 'totals')$$, 0, 'results page (teacher): no overall totals');
select pg_temp.ok((public.results_page('2b100000-0000-4000-fd10-000000000001') ->> 'group_id') = '64200000-0000-4000-fd10-000000000001', 'results page: the term is the default result');
select pg_temp.login_as('00000000-0000-4000-fd10-000000000003');
select pg_temp.counts($$select jsonb_array_length(public.results_page('2b100000-0000-4000-fd10-000000000001') -> 'results')$$, 2, 'results page (marks duty): both subjects');
select pg_temp.counts($$select jsonb_array_length(public.results_page('2b100000-0000-4000-fd10-000000000001') -> 'totals')$$, 1, 'results page (marks duty): the overall total');

-- ================= collect fee
select pg_temp.login_as('00000000-0000-4000-fd10-000000000004');
create temp table _c as select public.collect_page('2b100000-0000-4000-fd10-000000000001', '2076-06-15') j;
grant all on _c to authenticated;
select pg_temp.counts($$select jsonb_array_length(j -> 'rows') from _c$$, 3, 'collect page (fee clerk): every active enrolled student');
select pg_temp.counts($$select (r ->> 'totalDue')::bigint from _c, jsonb_array_elements(j -> 'rows') r where r ->> 'adm' = 'PF2-1'$$, 1200000, 'collect page: outstanding = the year''s 12 installments');
select pg_temp.counts($$select (r ->> 'overdue')::bigint from _c, jsonb_array_elements(j -> 'rows') r where r ->> 'adm' = 'PF2-1'$$, 300000, 'collect page: overdue on 15 June = April, May and June (due the 10th)');
select pg_temp.ok((select r ->> 'phone' from _c, jsonb_array_elements(j -> 'rows') r where r ->> 'adm' = 'PF2-1') = '9000000002', 'collect page: the primary guardian''s phone comes first');
select pg_temp.counts($$select jsonb_array_length(j -> 'picker') + jsonb_array_length(j -> 'miscHeads') from _c$$, 0, 'collect page (fee clerk): no Admin-only picker or misc heads');
select pg_temp.login_as('00000000-0000-4000-fd10-000000000001');
select pg_temp.ok(jsonb_array_length(public.collect_page('2b100000-0000-4000-fd10-000000000001', '2076-06-15') -> 'picker') > 0, 'collect page (Admin): the misc-receipt picker is there');
select pg_temp.login_as('00000000-0000-4000-fd10-000000000003');
select pg_temp.throws($$select public.collect_page('2b100000-0000-4000-fd10-000000000001', '2076-06-15')$$, 'collect page: a teacher with every other duty is refused', '42501');
select pg_temp.login_as('00000000-0000-4000-fd10-000000000005');
select pg_temp.throws($$select public.collect_page('2b100000-0000-4000-fd10-000000000001', '2076-06-15')$$, 'collect page: office without fee access is refused', '42501');
select pg_temp.login_as(null);
select pg_temp.throws($$select public.collect_page('2b100000-0000-4000-fd10-000000000001', '2076-06-15')$$, 'collect page: anonymous refused');
