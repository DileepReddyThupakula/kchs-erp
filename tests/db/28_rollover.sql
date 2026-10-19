-- Promotion / year rollover (database part): preview, confirm, undo, fees, old year untouched, Admin only. Rolled back.
update public.academic_years set is_current = false where is_current;
update public.school_settings set mediums = '{English,Telugu}', receipt_no_prefix = 'RCPT-' where id = 1;
select pg_temp.fixture_user('00000000-0000-4000-fc00-000000000001', 'admin@ro.test');
select pg_temp.fixture_user('00000000-0000-4000-fc00-000000000002', 'teacher@ro.test');
select pg_temp.fixture_user('00000000-0000-4000-fc00-000000000003', 'office-fee@ro.test');
select pg_temp.fixture_user('00000000-0000-4000-fc00-000000000004', 'office-nofee@ro.test');
select pg_temp.fixture_user('00000000-0000-4000-fc00-000000000005', 'old-admin@ro.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name, email, status) values
  ('1a000000-0000-4000-fc00-000000000001', '00000000-0000-4000-fc00-000000000001', 'admin',          'RO-ADM', 'Ro Admin', 'admin@ro.test', 'active'),
  ('1a000000-0000-4000-fc00-000000000002', '00000000-0000-4000-fc00-000000000002', 'teacher',        'RO-TCH', 'Ro Teacher', 'teacher@ro.test', 'active'),
  ('1a000000-0000-4000-fc00-000000000003', '00000000-0000-4000-fc00-000000000003', 'computer_staff', 'RO-OFF', 'Ro Office with fee access', 'office-fee@ro.test', 'active'),
  ('1a000000-0000-4000-fc00-000000000004', '00000000-0000-4000-fc00-000000000004', 'computer_staff', 'RO-NOF', 'Ro Office without fee access', 'office-nofee@ro.test', 'active'),
  ('1a000000-0000-4000-fc00-000000000005', '00000000-0000-4000-fc00-000000000005', 'admin',          'RO-OLD', 'Ro Deactivated Admin', 'old-admin@ro.test', 'inactive');
insert into public.staff_permissions (staff_id, duty) values ('1a000000-0000-4000-fc00-000000000003', 'fee_collection'), ('1a000000-0000-4000-fc00-000000000004', 'student_records');
insert into public.staff_permissions (staff_id, duty) select '1a000000-0000-4000-fc00-000000000002', d from unnest(enum_range(null::public.staff_duty)) d where d <> 'fee_collection';

-- two years: 2074-75 is current, 2075-76 is planned
insert into public.academic_years (id, name, start_date, end_date, status, is_current) values
  ('2c000000-0000-4000-fc00-000000000001', 'RO-2074-75', '2074-04-01', '2075-03-31', 'active', true),
  ('2c000000-0000-4000-fc00-000000000002', 'RO-2075-76', '2075-04-01', '2076-03-31', 'planned', false);
insert into public.classes (id, name, sort_order) values
  ('3c100000-0000-4000-fc00-000000000001', 'RO K1', 990), ('3c100000-0000-4000-fc00-000000000002', 'RO K2', 991), ('3c100000-0000-4000-fc00-000000000003', 'RO K3', 992);
insert into public.sections (id, academic_year_id, class_id, name, medium, class_teacher_id) values
  ('3d100000-0000-4000-fc00-000000000001', '2c000000-0000-4000-fc00-000000000001', '3c100000-0000-4000-fc00-000000000001', 'A', 'Telugu',  '1a000000-0000-4000-fc00-000000000002'),
  ('3d100000-0000-4000-fc00-000000000002', '2c000000-0000-4000-fc00-000000000001', '3c100000-0000-4000-fc00-000000000001', 'B', 'English', null),
  ('3d100000-0000-4000-fc00-000000000003', '2c000000-0000-4000-fc00-000000000001', '3c100000-0000-4000-fc00-000000000002', 'A', 'Telugu',  null),
  ('3d100000-0000-4000-fc00-000000000004', '2c000000-0000-4000-fc00-000000000001', '3c100000-0000-4000-fc00-000000000003', 'A', 'English', null),
  -- the new year already has K1-B (a new admission is waiting there)
  ('3d100000-0000-4000-fc00-000000000005', '2c000000-0000-4000-fc00-000000000002', '3c100000-0000-4000-fc00-000000000001', 'B', 'English', null);
insert into public.subjects (id, name, code) values ('5c100000-0000-4000-fc00-000000000001', 'RO Maths', 'ROM');
insert into public.class_subjects (academic_year_id, class_id, subject_id, sort_order)
  select y, c, '5c100000-0000-4000-fc00-000000000001', 1 from unnest(array['2c000000-0000-4000-fc00-000000000001', '2c000000-0000-4000-fc00-000000000002']::uuid[]) y,
       unnest(array['3c100000-0000-4000-fc00-000000000001', '3c100000-0000-4000-fc00-000000000002', '3c100000-0000-4000-fc00-000000000003']::uuid[]) c;
-- fees: the same plan names in both years; "RO Odd" only in the old year
insert into public.fee_heads (id, name, code, sort_order) values ('62c00000-0000-4000-fc00-000000000001', 'RO Tuition', 'RO-TUI', 94);
insert into public.fee_plans (id, academic_year_id, name, kind, due_day) values
  ('63c00000-0000-4000-fc00-000000000001', '2c000000-0000-4000-fc00-000000000001', 'RO Monthly', 'monthly', 10),
  ('63c00000-0000-4000-fc00-000000000002', '2c000000-0000-4000-fc00-000000000002', 'RO Monthly', 'monthly', 10),
  ('63c00000-0000-4000-fc00-000000000003', '2c000000-0000-4000-fc00-000000000001', 'RO Once',    'one_time', 10),
  ('63c00000-0000-4000-fc00-000000000004', '2c000000-0000-4000-fc00-000000000002', 'RO Once',    'one_time', 10),
  ('63c00000-0000-4000-fc00-000000000005', '2c000000-0000-4000-fc00-000000000001', 'RO Odd',     'one_time', 10);
insert into public.fee_structure (academic_year_id, class_id, fee_head_id, amount_paise, default_plan_id)
  select y.id, c.id, '62c00000-0000-4000-fc00-000000000001', 1200000, case when y.name = 'RO-2074-75' then '63c00000-0000-4000-fc00-000000000001'::uuid else '63c00000-0000-4000-fc00-000000000002'::uuid end
    from public.academic_years y, public.classes c where y.id in ('2c000000-0000-4000-fc00-000000000001', '2c000000-0000-4000-fc00-000000000002') and c.id in ('3c100000-0000-4000-fc00-000000000001', '3c100000-0000-4000-fc00-000000000002', '3c100000-0000-4000-fc00-000000000003');
-- students: s1 Zed, s2 Amar, s3 Cat (K1-A); s4 Bhim (K1-B); s5 Dev, s6 Eka (K2-A); s7 Fay, s8 Gita (K3-A); s9 left in the middle of the year; s10 a new admission already in the new year
insert into public.students (id, admission_no, full_name, gender, date_of_birth, admission_date, status, status_date) values
  ('56c00000-0000-4000-fc00-000000000001', 'RO-01', 'Zed', 'male',   '2066-01-01', '2070-06-01', 'active', null),
  ('56c00000-0000-4000-fc00-000000000002', 'RO-02', 'Amar', 'male',  '2066-01-01', '2070-06-01', 'active', null),
  ('56c00000-0000-4000-fc00-000000000003', 'RO-03', 'Cat', 'female', '2066-01-01', '2070-06-01', 'active', null),
  ('56c00000-0000-4000-fc00-000000000004', 'RO-04', 'Bhim', 'male',  '2066-01-01', '2070-06-01', 'active', null),
  ('56c00000-0000-4000-fc00-000000000005', 'RO-05', 'Dev', 'male',   '2066-01-01', '2070-06-01', 'active', null),
  ('56c00000-0000-4000-fc00-000000000006', 'RO-06', 'Eka', 'female', '2066-01-01', '2070-06-01', 'active', null),
  ('56c00000-0000-4000-fc00-000000000007', 'RO-07', 'Fay', 'female', '2066-01-01', '2070-06-01', 'active', null),
  ('56c00000-0000-4000-fc00-000000000008', 'RO-08', 'Gita', 'female','2066-01-01', '2070-06-01', 'active', null),
  ('56c00000-0000-4000-fc00-000000000009', 'RO-09', 'Hari', 'male',  '2066-01-01', '2070-06-01', 'active', null),
  ('56c00000-0000-4000-fc00-000000000010', 'RO-10', 'Indu New', 'female', '2072-01-01', '2074-06-01', 'active', null);
insert into public.student_enrollments (student_id, academic_year_id, section_id, roll_no) values
  ('56c00000-0000-4000-fc00-000000000001', '2c000000-0000-4000-fc00-000000000001', '3d100000-0000-4000-fc00-000000000001', 1),
  ('56c00000-0000-4000-fc00-000000000002', '2c000000-0000-4000-fc00-000000000001', '3d100000-0000-4000-fc00-000000000001', 2),
  ('56c00000-0000-4000-fc00-000000000003', '2c000000-0000-4000-fc00-000000000001', '3d100000-0000-4000-fc00-000000000001', 3),
  ('56c00000-0000-4000-fc00-000000000004', '2c000000-0000-4000-fc00-000000000001', '3d100000-0000-4000-fc00-000000000002', 1),
  ('56c00000-0000-4000-fc00-000000000005', '2c000000-0000-4000-fc00-000000000001', '3d100000-0000-4000-fc00-000000000003', 1),
  ('56c00000-0000-4000-fc00-000000000006', '2c000000-0000-4000-fc00-000000000001', '3d100000-0000-4000-fc00-000000000003', 2),
  ('56c00000-0000-4000-fc00-000000000007', '2c000000-0000-4000-fc00-000000000001', '3d100000-0000-4000-fc00-000000000004', 1),
  ('56c00000-0000-4000-fc00-000000000008', '2c000000-0000-4000-fc00-000000000001', '3d100000-0000-4000-fc00-000000000004', 2),
  ('56c00000-0000-4000-fc00-000000000009', '2c000000-0000-4000-fc00-000000000001', '3d100000-0000-4000-fc00-000000000001', 4);
update public.students set status = 'left', status_date = '2074-09-01', status_reason = 'Moved away' where id = '56c00000-0000-4000-fc00-000000000009';
insert into public.student_enrollments (student_id, academic_year_id, section_id, roll_no) values ('56c00000-0000-4000-fc00-000000000010', '2c000000-0000-4000-fc00-000000000002', '3d100000-0000-4000-fc00-000000000005', 5);
-- old-year fee plan overrides: s1 "RO Once" (exists in both years), s2 "RO Odd" (old year only); s1 has a concession
insert into public.student_fee_plans (student_id, academic_year_id, fee_head_id, plan_id, reason) values
  ('56c00000-0000-4000-fc00-000000000001', '2c000000-0000-4000-fc00-000000000001', '62c00000-0000-4000-fc00-000000000001', '63c00000-0000-4000-fc00-000000000003', 'Pays once a year'),
  ('56c00000-0000-4000-fc00-000000000002', '2c000000-0000-4000-fc00-000000000001', '62c00000-0000-4000-fc00-000000000001', '63c00000-0000-4000-fc00-000000000005', 'Odd plan');
insert into public.fee_concessions (student_id, academic_year_id, fee_head_id, kind, percent_bp, reason) values
  ('56c00000-0000-4000-fc00-000000000003', '2c000000-0000-4000-fc00-000000000001', '62c00000-0000-4000-fc00-000000000001', 'percent', 1000, 'Staff child');
-- old-year work: a payment (part of s3's dues), attendance, marks, results (K2 locked with a failure; K1 not locked)
select pg_temp.login_as('00000000-0000-4000-fc00-000000000003');
select pg_temp.lives($$select public.collect_fee('56c00000-0000-4000-fc00-000000000003', 50000, 'cash')$$, 'setup: s3 pays part of the old year');
select pg_temp.logout();
insert into public.attendance_sessions (id, academic_year_id, section_id, att_date, session, kind, status) values
  ('a5c00000-0000-4000-fc00-000000000001', '2c000000-0000-4000-fc00-000000000001', '3d100000-0000-4000-fc00-000000000001', '2074-07-02', 'morning', 'regular', 'marked');
insert into public.student_attendance (session_id, student_id, att_date, session, status) values ('a5c00000-0000-4000-fc00-000000000001', '56c00000-0000-4000-fc00-000000000001', '2074-07-02', 'morning', 'present');
insert into public.exam_components (id, academic_year_id, class_id, name, max_marks, sort_order) values ('65c00000-0000-4000-fc00-000000000001', '2c000000-0000-4000-fc00-000000000001', '3c100000-0000-4000-fc00-000000000001', 'RO FA1', 20, 1);
insert into public.marks (academic_year_id, class_id, section_id, student_id, component_id, subject_id, status, marks)
  values ('2c000000-0000-4000-fc00-000000000001', '3c100000-0000-4000-fc00-000000000001', '3d100000-0000-4000-fc00-000000000001', '56c00000-0000-4000-fc00-000000000001', '65c00000-0000-4000-fc00-000000000001', '5c100000-0000-4000-fc00-000000000001', 'marked', 12);
insert into public.result_groups (id, academic_year_id, class_id, name, kind, sort_order, locked_at) values
  ('64c00000-0000-4000-fc00-000000000001', '2c000000-0000-4000-fc00-000000000001', '3c100000-0000-4000-fc00-000000000001', 'RO Term', 'term', 1, null),
  ('64c00000-0000-4000-fc00-000000000002', '2c000000-0000-4000-fc00-000000000001', '3c100000-0000-4000-fc00-000000000002', 'RO Term', 'term', 1, now());
insert into public.student_results (academic_year_id, class_id, section_id, student_id, group_id, scored, max_marks, pct, result, subjects_count, failed_count, locked) values
  ('2c000000-0000-4000-fc00-000000000001', '3c100000-0000-4000-fc00-000000000002', '3d100000-0000-4000-fc00-000000000003', '56c00000-0000-4000-fc00-000000000006', '64c00000-0000-4000-fc00-000000000002', 10, 100, 10, 'fail', 1, 1, true),
  ('2c000000-0000-4000-fc00-000000000001', '3c100000-0000-4000-fc00-000000000002', '3d100000-0000-4000-fc00-000000000003', '56c00000-0000-4000-fc00-000000000005', '64c00000-0000-4000-fc00-000000000002', 80, 100, 80, 'pass', 1, 0, true);

-- fingerprints: the OLD year (must never change) and everything a rollover touches (undo must put back exactly)
create function pg_temp.fp_old() returns text language sql as $$
  select md5(coalesce((select string_agg(x::text, '|' order by x::text) from (
    select concat_ws(',', 'enr', e.id, e.student_id, e.section_id, e.roll_no, e.status) from public.student_enrollments e where e.academic_year_id = '2c000000-0000-4000-fc00-000000000001'
    union all select concat_ws(',', 'sec', s.id, s.class_id, s.name, s.medium, s.class_teacher_id) from public.sections s where s.academic_year_id = '2c000000-0000-4000-fc00-000000000001'
    union all select concat_ws(',', 'due', d.id, d.student_id, d.amount_paise, d.concession_paise, d.paid_paise, (d.voided_at is null)) from public.student_fee_dues d where d.academic_year_id = '2c000000-0000-4000-fc00-000000000001'
    union all select concat_ws(',', 'rcpt', r.id, r.total_paise, r.status) from public.fee_receipts r where r.student_id in (select student_id from public.student_enrollments where academic_year_id = '2c000000-0000-4000-fc00-000000000001')
    union all select concat_ws(',', 'ritem', i.id, i.due_id, i.amount_paise) from public.fee_receipt_items i join public.student_fee_dues d on d.id = i.due_id where d.academic_year_id = '2c000000-0000-4000-fc00-000000000001'
    union all select concat_ws(',', 'att', a.id, a.section_id, a.att_date) from public.attendance_sessions a where a.academic_year_id = '2c000000-0000-4000-fc00-000000000001'
    union all select concat_ws(',', 'sa', a.id, a.student_id, a.status) from public.student_attendance a where a.session_id = 'a5c00000-0000-4000-fc00-000000000001'
    union all select concat_ws(',', 'mark', m.id, m.student_id, m.marks, m.status) from public.marks m where m.academic_year_id = '2c000000-0000-4000-fc00-000000000001'
    union all select concat_ws(',', 'res', r.id, r.student_id, r.result, r.scored) from public.student_results r where r.academic_year_id = '2c000000-0000-4000-fc00-000000000001'
    union all select concat_ws(',', 'grp', g.id, g.name, g.locked_at is null) from public.result_groups g where g.academic_year_id = '2c000000-0000-4000-fc00-000000000001'
    union all select concat_ws(',', 'plan', p.id, p.student_id, p.plan_id) from public.student_fee_plans p where p.academic_year_id = '2c000000-0000-4000-fc00-000000000001'
    union all select concat_ws(',', 'conc', c.id, c.student_id, c.percent_bp) from public.fee_concessions c where c.academic_year_id = '2c000000-0000-4000-fc00-000000000001'
  ) x), ''))
$$;
create function pg_temp.fp_touched() returns text language sql as $$
  select md5(coalesce((select string_agg(x::text, '|' order by x::text) from (
    select concat_ws(',', 'stu', st.id, st.status, st.status_date, st.status_reason) from public.students st where st.id::text like '56c00000-0000-4000-fc00-%'
    union all select concat_ws(',', 'enr', e.id, e.student_id, e.section_id, e.roll_no, e.status) from public.student_enrollments e where e.academic_year_id = '2c000000-0000-4000-fc00-000000000002'
    union all select concat_ws(',', 'sec', s.id, s.class_id, s.name, s.medium, s.class_teacher_id, s.capacity) from public.sections s where s.academic_year_id = '2c000000-0000-4000-fc00-000000000002'
    union all select concat_ws(',', 'due', d.id, d.student_id, d.fee_head_id, d.plan_id, d.installment_seq, d.amount_paise, d.concession_paise, d.paid_paise, (d.voided_at is null)) from public.student_fee_dues d where d.academic_year_id = '2c000000-0000-4000-fc00-000000000002'
    union all select concat_ws(',', 'plan', p.id, p.student_id, p.plan_id) from public.student_fee_plans p where p.academic_year_id = '2c000000-0000-4000-fc00-000000000002'
    union all select concat_ws(',', 'conc', c.id, c.student_id) from public.fee_concessions c where c.academic_year_id = '2c000000-0000-4000-fc00-000000000002'
    union all select concat_ws(',', 'yr', y.id, y.status, y.is_current) from public.academic_years y where y.id in ('2c000000-0000-4000-fc00-000000000001', '2c000000-0000-4000-fc00-000000000002')
  ) x), ''))
$$;
create temp table _fp as select pg_temp.fp_old() old_fp, pg_temp.fp_touched() touched_fp;
grant all on _fp to authenticated;
create function pg_temp.pv(p_plan jsonb default '{}') returns jsonb language sql as $$ select public.rollover_preview('2c000000-0000-4000-fc00-000000000001', '2c000000-0000-4000-fc00-000000000002', p_plan) $$;
grant execute on function pg_temp.pv(jsonb) to authenticated;
create function pg_temp.row_of(p jsonb, n text) returns jsonb language sql as $$ select r from jsonb_array_elements(p -> 'students') r where r ->> 'name' = n $$;
create function pg_temp.class_of(p jsonb, n text) returns jsonb language sql as $$ select c from jsonb_array_elements(p -> 'classes') c where c ->> 'class' = n $$;
create function pg_temp.sec_of(p jsonb, c text, n text) returns jsonb language sql as $$ select s from jsonb_array_elements(p -> 'sections') s where s ->> 'class' = c and s ->> 'name' = n $$;
create function pg_temp.check_of(p jsonb, k text) returns text language sql as $$ select c ->> 'status' from jsonb_array_elements(p -> 'checklist') c where c ->> 'key' = k $$;
grant execute on function pg_temp.row_of(jsonb, text), pg_temp.class_of(jsonb, text), pg_temp.sec_of(jsonb, text, text), pg_temp.check_of(jsonb, text) to authenticated;

-- ================= PREVIEW (changes nothing)
select pg_temp.login_as('00000000-0000-4000-fc00-000000000001');
create temp table _p as select pg_temp.pv() j;
grant all on _p to authenticated;
select pg_temp.ok((select pg_temp.row_of(j, 'Zed') ->> 'to_class' from _p) = 'RO K2' and (select pg_temp.row_of(j, 'Zed') ->> 'to_section' from _p) = 'A', 'preview: K1-A moves to K2-A (same letter)');
select pg_temp.ok((select pg_temp.row_of(j, 'Bhim') ->> 'to_class' || '-' || (pg_temp.row_of(j, 'Bhim') ->> 'to_section') from _p) = 'RO K2-B', 'preview: K1-B moves to K2-B');
select pg_temp.ok((select pg_temp.row_of(j, 'Fay') ->> 'outcome' from _p) = 'passed_out' and (select pg_temp.row_of(j, 'Fay') ->> 'to_class' from _p) is null, 'preview: the top class defaults to "passed out", no new class');
select pg_temp.ok((select (pg_temp.row_of(j, 'Eka') ->> 'suggested_detain')::boolean from _p) and not (select (pg_temp.row_of(j, 'Dev') ->> 'suggested_detain')::boolean from _p), 'preview: a locked "fail" is only a SUGGESTION to detain; the outcome stays "promote"');
select pg_temp.ok((select pg_temp.row_of(j, 'Eka') ->> 'outcome' from _p) = 'promote', 'preview: nobody is detained automatically');
select pg_temp.ok((select (pg_temp.class_of(j, 'RO K1') ->> 'last_year')::int from _p) = 4 and (select (pg_temp.class_of(j, 'RO K1') ->> 'left_midyear')::int from _p) = 1, 'totals: K1 had 4 active students and 1 who left in the middle of the year (not in the preview)');
select pg_temp.ok((select (pg_temp.class_of(j, 'RO K2') ->> 'promoted_in')::int from _p) = 4 and (select (pg_temp.class_of(j, 'RO K2') ->> 'next_year')::int from _p) = 4, 'totals: K2 receives 4 from K1');
select pg_temp.ok((select (pg_temp.class_of(j, 'RO K3') ->> 'next_year')::int from _p) = 2 and (select (pg_temp.class_of(j, 'RO K3') ->> 'passed_out')::int from _p) = 2, 'totals: K3 receives 2 from K2 and 2 leave');
select pg_temp.ok((select (pg_temp.class_of(j, 'RO K1') ->> 'new_in')::int from _p) = 1 and (select (pg_temp.class_of(j, 'RO K1') ->> 'next_year')::int from _p) = 1, 'totals: K1 next year = the 1 new admission');
select pg_temp.ok((select pg_temp.row_of(j, 'Indu New') ->> 'outcome' from _p) = 'new', 'preview: the new admission already placed in the new year takes part, tagged new');
select pg_temp.ok((select string_agg(r ->> 'name' || '=' || (r ->> 'to_roll'), ',' order by (r ->> 'to_roll')::int) from _p, jsonb_array_elements(j -> 'students') r where r ->> 'to_class' = 'RO K2' and r ->> 'to_section' = 'A') = 'Amar=1,Cat=2,Zed=3', 'preview: roll numbers are alphabetical by name');
select pg_temp.ok((select (j -> 'summary' ->> 'promoted')::int = 6 and (j -> 'summary' ->> 'passed_out')::int = 2 and (j -> 'summary' ->> 'detained')::int = 0 and (j -> 'summary' ->> 'new_sections_created')::int = 3 and (j -> 'summary' ->> 'left_midyear')::int = 1 from _p), 'summary: promoted 6, passed out 2, detained 0, 3 new sections, 1 mid-year leaver');
select pg_temp.ok((select (j -> 'summary' ->> 'carried_dues_paise')::bigint from _p) = (select sum(greatest(amount_paise - concession_paise - paid_paise, 0)) from public.student_fee_dues where academic_year_id = '2c000000-0000-4000-fc00-000000000001' and student_id in (select student_id from public.student_enrollments where academic_year_id = '2c000000-0000-4000-fc00-000000000001' and student_id <> '56c00000-0000-4000-fc00-000000000009' and student_id not in ('56c00000-0000-4000-fc00-000000000007', '56c00000-0000-4000-fc00-000000000008')) and voided_at is null), 'summary: the carried-over dues total is the unpaid old-year dues of the students moving up');
select pg_temp.ok((select (j -> 'summary' ->> 'carried_dues_paise')::bigint from _p) > 0 and (select (j -> 'summary' ->> 'leavers_dues_paise')::bigint from _p) > 0, 'summary: old unpaid dues are shown for those moving up and, separately, for leavers');
select pg_temp.ok((select pg_temp.sec_of(j, 'RO K2', 'A') ->> 'medium' from _p) = 'Telugu' and (select pg_temp.sec_of(j, 'RO K2', 'A') ->> 'class_teacher_id' from _p) = '1a000000-0000-4000-fc00-000000000002', 'preview: medium and class teacher carry over from the old section');
select pg_temp.ok((select pg_temp.sec_of(j, 'RO K2', 'B') ->> 'medium' from _p) = 'English', 'preview: K2-B keeps English');
select pg_temp.ok((select pg_temp.check_of(j, 'new_year') || pg_temp.check_of(j, 'fee_structure') || pg_temp.check_of(j, 'class_subjects') || pg_temp.check_of(j, 'all_placed') || pg_temp.check_of(j, 'section_size') from _p) = 'okokokokok', 'checklist: year, fees, subjects, placement and size are green');
select pg_temp.ok((select pg_temp.check_of(j, 'results_locked') from _p) = 'warn', 'checklist: a result that is not locked is only a warning');
select pg_temp.ok((select (j ->> 'can_confirm')::boolean from _p), 'checklist: nothing red, so Confirm is possible');
select pg_temp.ok((select pg_temp.fp_old() = old_fp and pg_temp.fp_touched() = touched_fp from _fp), 'preview changes nothing at all');
select pg_temp.logout();

-- ================= the Admin's own choices in the preview
select pg_temp.login_as('00000000-0000-4000-fc00-000000000001');
create temp table _p2 as select pg_temp.pv('{"students": {"56c00000-0000-4000-fc00-000000000002": {"outcome": "detain"}, "56c00000-0000-4000-fc00-000000000001": {"to_section": "B", "roll_no": 9}, "56c00000-0000-4000-fc00-000000000004": {"outcome": "left"}}}') j;
grant all on _p2 to authenticated;
select pg_temp.ok((select pg_temp.row_of(j, 'Amar') ->> 'to_class' || '-' || (pg_temp.row_of(j, 'Amar') ->> 'to_section') from _p2) = 'RO K1-A', 'choice: a detained student stays in the same class and section letter');
select pg_temp.ok((select (pg_temp.class_of(j, 'RO K1') ->> 'detained_in')::int from _p2) = 1 and (select (pg_temp.class_of(j, 'RO K2') ->> 'next_year')::int from _p2) = 2, 'choice: totals follow (K1 keeps 1 detained, K2 receives 2)');
select pg_temp.ok((select pg_temp.row_of(j, 'Zed') ->> 'to_section' from _p2) = 'B' and (select (pg_temp.row_of(j, 'Zed') ->> 'to_roll')::int from _p2) = 9, 'choice: one student moved to another section with their own roll number');
select pg_temp.ok((select pg_temp.row_of(j, 'Bhim') ->> 'outcome' from _p2) = 'left' and (select pg_temp.row_of(j, 'Bhim') ->> 'to_class' from _p2) is null, 'choice: a student marked Left gets no new class');
select pg_temp.ok((select (j -> 'summary' ->> 'left')::int = 1 and (j -> 'summary' ->> 'detained')::int = 1 from _p2), 'choice: the summary shows detained 1, left 1');
select pg_temp.ok((select (j ->> 'can_confirm')::boolean from pg_temp.pv('{"max_size": 1}') j) = false and (select pg_temp.check_of(j, 'section_size') from pg_temp.pv('{"max_size": 1}') j) = 'fail', 'checklist: a section over the size limit is red and blocks Confirm');
select pg_temp.ok((select pg_temp.check_of(j, 'all_placed') from pg_temp.pv('{"students": {"56c00000-0000-4000-fc00-000000000007": {"outcome": "promote"}}}') j) = 'fail', 'checklist: promoting the top class (no next class) is red');
select pg_temp.ok((select pg_temp.check_of(j, 'all_placed') from pg_temp.pv('{"students": {"56c00000-0000-4000-fc00-000000000003": {"roll_no": 1}, "56c00000-0000-4000-fc00-000000000002": {"roll_no": 1}}}') j) = 'fail', 'checklist: the same roll number twice in a section is red');
select pg_temp.throws($$select pg_temp.pv('{"students": {"56c00000-0000-4000-fc00-000000000003": {"outcome": "explode"}}}')$$, 'an unknown outcome is refused', '23514');
select pg_temp.ok((select pg_temp.sec_of(j, 'RO K2', 'A') ->> 'medium' from pg_temp.pv(format('{"sections": {"%s:A": {"medium": "English"}}}', '3c100000-0000-4000-fc00-000000000002')::jsonb) j) = 'English', 'choice: the Admin can change the medium of a new section');
select pg_temp.throws($$select pg_temp.pv(format('{"sections": {"%s:A": {"medium": "Klingon"}}}', '3c100000-0000-4000-fc00-000000000002')::jsonb)$$, 'a medium the school does not have is refused', '23514');
select pg_temp.ok((select pg_temp.sec_of(j, 'RO K2', 'A') ->> 'class_teacher_id' from pg_temp.pv(format('{"sections": {"%s:A": {"class_teacher_id": null}}}', '3c100000-0000-4000-fc00-000000000002')::jsonb) j) is null, 'choice: the Admin can remove or change the carried-over class teacher');

-- ================= CONFIRM needs the tick and the typed year name
select pg_temp.throws($$select public.rollover_confirm('2c000000-0000-4000-fc00-000000000001', '2c000000-0000-4000-fc00-000000000002', '{}', false, 'RO-2075-76')$$, 'confirm: refused without "I have checked the totals"', '23514');
select pg_temp.throws($$select public.rollover_confirm('2c000000-0000-4000-fc00-000000000001', '2c000000-0000-4000-fc00-000000000002', '{}', true, 'wrong name')$$, 'confirm: refused when the year name is not typed correctly', '23514');
select pg_temp.throws($$select public.rollover_confirm('2c000000-0000-4000-fc00-000000000001', '2c000000-0000-4000-fc00-000000000002', '{"max_size": 1}', true, 'RO-2075-76')$$, 'confirm: refused while the checklist has a red item', '23514');
select pg_temp.ok((select pg_temp.fp_old() = old_fp and pg_temp.fp_touched() = touched_fp from _fp), 'a refused confirm changes nothing');

-- ================= CONFIRM (s2 detained, s4 left, the rest as proposed)
create temp table _c as select public.rollover_confirm('2c000000-0000-4000-fc00-000000000001', '2c000000-0000-4000-fc00-000000000002',
  '{"students": {"56c00000-0000-4000-fc00-000000000002": {"outcome": "detain"}, "56c00000-0000-4000-fc00-000000000004": {"outcome": "left"}}}', true, ' ro-2075-76 ') j;
grant all on _c to authenticated;
select pg_temp.ok((select j -> 'summary' ->> 'detained' from _c) = '1' and (select j -> 'summary' ->> 'left' from _c) = '1' and (select j -> 'summary' ->> 'promoted' from _c) = '4', 'confirm: result summary promoted 4, detained 1, left 1');
select pg_temp.counts($$select count(*) from public.student_enrollments where academic_year_id = '2c000000-0000-4000-fc00-000000000002'$$, 6, 'confirm: 5 new enrolments (4 promoted + 1 detained) + the new admission = 6 in the new year');
select pg_temp.ok((select string_agg(st.full_name, ',' order by st.full_name) from public.student_enrollments e join public.students st on st.id = e.student_id join public.sections s on s.id = e.section_id join public.classes c on c.id = s.class_id
                    where e.academic_year_id = '2c000000-0000-4000-fc00-000000000002' and c.name = 'RO K2' and s.name = 'A') = 'Cat,Zed', 'confirm: K2-A holds Zed and Cat (Amar was detained)');
select pg_temp.ok((select e.roll_no from public.student_enrollments e where e.student_id = '56c00000-0000-4000-fc00-000000000003' and e.academic_year_id = '2c000000-0000-4000-fc00-000000000002') = 1
              and (select e.roll_no from public.student_enrollments e where e.student_id = '56c00000-0000-4000-fc00-000000000001' and e.academic_year_id = '2c000000-0000-4000-fc00-000000000002') = 2, 'confirm: roll numbers alphabetical (Cat 1, Zed 2)');
select pg_temp.ok((select c.name || s.name from public.student_enrollments e join public.sections s on s.id = e.section_id join public.classes c on c.id = s.class_id where e.student_id = '56c00000-0000-4000-fc00-000000000002' and e.academic_year_id = '2c000000-0000-4000-fc00-000000000002') = 'RO K1A', 'confirm: the detained student is in K1-A again');
select pg_temp.ok((select s.medium || coalesce(s.class_teacher_id::text, '') from public.sections s join public.classes c on c.id = s.class_id where s.academic_year_id = '2c000000-0000-4000-fc00-000000000002' and c.name = 'RO K2' and s.name = 'A') = 'Telugu1a000000-0000-4000-fc00-000000000002', 'confirm: the new K2-A has the old medium and class teacher');
select pg_temp.counts($$select count(*) from public.sections where academic_year_id = '2c000000-0000-4000-fc00-000000000002'$$, 4, 'confirm: sections K1-A, K2-A, K3-A are created and K1-B already existed; K2-B is not created because nobody moves into it');
select pg_temp.ok((select status from public.students where id = '56c00000-0000-4000-fc00-000000000007') = 'passed_out' and (select status_date from public.students where id = '56c00000-0000-4000-fc00-000000000007') is not null, 'confirm: the top class is marked passed out with a date');
select pg_temp.ok((select status from public.students where id = '56c00000-0000-4000-fc00-000000000004') = 'left', 'confirm: a student marked Left is Left');
select pg_temp.counts($$select count(*) from public.student_enrollments where student_id in ('56c00000-0000-4000-fc00-000000000004', '56c00000-0000-4000-fc00-000000000007', '56c00000-0000-4000-fc00-000000000008', '56c00000-0000-4000-fc00-000000000009') and academic_year_id = '2c000000-0000-4000-fc00-000000000002'$$, 0, 'confirm: leavers get no new-year place');
select pg_temp.ok((select y.status || y.is_current::text from public.academic_years y where y.id = '2c000000-0000-4000-fc00-000000000001') = 'closedfalse'
              and (select y.status || y.is_current::text from public.academic_years y where y.id = '2c000000-0000-4000-fc00-000000000002') = 'activetrue', 'confirm: the old year is closed, the new year is current');
select pg_temp.ok((select pg_temp.fp_old() = old_fp from _fp), 'confirm: the OLD year (enrolments, dues, receipts, attendance, marks, results, plans, concessions) is exactly as it was');

-- fees
select pg_temp.counts($$select count(*) from public.student_fee_dues where academic_year_id = '2c000000-0000-4000-fc00-000000000002' and student_id = '56c00000-0000-4000-fc00-000000000003'$$, 12, 'fees: the new year''s dues come from the new fee structure (12 monthly)');
select pg_temp.counts($$select count(*) from public.student_fee_dues where academic_year_id = '2c000000-0000-4000-fc00-000000000002' and student_id in ('56c00000-0000-4000-fc00-000000000004', '56c00000-0000-4000-fc00-000000000007', '56c00000-0000-4000-fc00-000000000008')$$, 0, 'fees: leavers get no new-year dues');
select pg_temp.ok((select plan_id::text from public.student_fee_plans where student_id = '56c00000-0000-4000-fc00-000000000001' and academic_year_id = '2c000000-0000-4000-fc00-000000000002') = '63c00000-0000-4000-fc00-000000000004', 'fees: a fee plan carries over, matched to the new year''s plan of the same name');
select pg_temp.counts($$select count(*) from public.student_fee_plans where student_id = '56c00000-0000-4000-fc00-000000000002' and academic_year_id = '2c000000-0000-4000-fc00-000000000002'$$, 0, 'fees: a plan with no match in the new year is not invented');
select pg_temp.ok((select (j -> 'summary' ->> 'plans_not_matched')::int from _c) = 1, 'fees: the result says how many plans had no match');
select pg_temp.counts($$select count(*) from public.fee_concessions where academic_year_id = '2c000000-0000-4000-fc00-000000000002'$$, 0, 'fees: concessions are NOT carried over (re-approved each year)');
select pg_temp.counts($$select count(*) from public.fee_concessions where academic_year_id = '2c000000-0000-4000-fc00-000000000001' and student_id = '56c00000-0000-4000-fc00-000000000003'$$, 1, 'fees: the old year''s concession is still there');
select pg_temp.ok((select (public.previous_year_balance('56c00000-0000-4000-fc00-000000000003') ->> 'total_paise')::bigint) = (select sum(greatest(amount_paise - concession_paise - paid_paise, 0)) from public.student_fee_dues where student_id = '56c00000-0000-4000-fc00-000000000003' and academic_year_id = '2c000000-0000-4000-fc00-000000000001' and voided_at is null)
              and (select (public.previous_year_balance('56c00000-0000-4000-fc00-000000000003') ->> 'total_paise')::bigint) > 0, 'fees: unpaid old dues are a separate "previous year balance" line, equal to what was unpaid');
select pg_temp.ok((select public.previous_year_balance('56c00000-0000-4000-fc00-000000000003') -> 'years' -> 0 ->> 'year') = 'RO-2074-75', 'fees: the balance names the old year');
select pg_temp.ok((select sum(amount_paise) from public.student_fee_dues where academic_year_id = '2c000000-0000-4000-fc00-000000000002' and student_id = '56c00000-0000-4000-fc00-000000000003') = 1200000, 'fees: the new year''s dues do not include the old balance (never merged)');
select pg_temp.counts($$select count(*) from public.fee_receipts where student_id = '56c00000-0000-4000-fc00-000000000003' and status = 'valid'$$, 1, 'fees: the old receipt is untouched');

-- audit
select pg_temp.ok(exists (select 1 from public.audit_logs where action = 'rollover.confirm' and actor_user_id = '00000000-0000-4000-fc00-000000000001' and (details ->> 'students_affected')::int > 0 and details ->> 'from' = 'RO-2074-75'), 'audit: the rollover is logged with who, and how many students');
select pg_temp.ok(position('Year rollover' in (public.audit_entries(now() - interval '1 hour', null, null, 'students', null, null, null, 50) ->> 'rows')) > 0, 'audit: it reads as a plain sentence under "Students"');

-- a second run is refused
select pg_temp.throws($$select public.rollover_confirm('2c000000-0000-4000-fc00-000000000001', '2c000000-0000-4000-fc00-000000000002', '{}', true, 'RO-2075-76')$$, 'confirm: cannot be run twice', '23514');

-- ================= UNDO is refused once new-year work exists (each case is tried and rolled back)
create function pg_temp.blocked_by(p_writer uuid, p_sql text, p_run uuid, p_key text) returns boolean language plpgsql as $$
declare r jsonb;
begin
  begin
    if p_writer is null then perform pg_temp.logout(); else perform pg_temp.login_as(p_writer); end if;
    execute p_sql;
    perform pg_temp.login_as('00000000-0000-4000-fc00-000000000001');
    r := public.rollover_undo_check(p_run);
    raise exception 'RESULT %', r::text;
  exception when others then
    perform pg_temp.login_as('00000000-0000-4000-fc00-000000000001');
    if sqlerrm like 'RESULT %' then
      r := substr(sqlerrm, 8)::jsonb;
      return not (r ->> 'allowed')::boolean and exists (select 1 from jsonb_array_elements(r -> 'reasons') x where x ->> 'key' = p_key) and (r ->> 'instead') is not null;
    end if;
    raise;
  end;
end $$;
select pg_temp.login_as('00000000-0000-4000-fc00-000000000001');
create temp table _run as select (j ->> 'run_id')::uuid id from _c;
grant all on _run to authenticated;
grant execute on function pg_temp.blocked_by(uuid, text, uuid, text) to authenticated;
select pg_temp.ok((select (public.rollover_undo_check(id) ->> 'allowed')::boolean from _run), 'undo check: allowed while nothing has been recorded in the new year');
select pg_temp.ok(pg_temp.blocked_by(null, $$insert into public.attendance_sessions (academic_year_id, section_id, att_date, session, kind, status) select '2c000000-0000-4000-fc00-000000000002', id, '2075-07-01', 'morning', 'regular', 'marked' from public.sections where academic_year_id = '2c000000-0000-4000-fc00-000000000002' limit 1$$, (select id from _run), 'attendance'), 'undo refused: attendance marked in the new year (with the reason and what to do instead)');
select pg_temp.ok(pg_temp.blocked_by(null, $$insert into public.exam_components (id, academic_year_id, class_id, name, max_marks) values ('65c00000-0000-4000-fc00-000000000009', '2c000000-0000-4000-fc00-000000000002', '3c100000-0000-4000-fc00-000000000002', 'RO FA9', 20)$$, (select id from _run), 'marks') = false, 'an exam set up in the new year alone is not "work" (no marks yet)');
select pg_temp.ok(pg_temp.blocked_by(null, $$insert into public.marks (academic_year_id, class_id, section_id, student_id, component_id, subject_id, status, marks) select '2c000000-0000-4000-fc00-000000000002', s.class_id, e.section_id, e.student_id, (select id from public.exam_components where name = 'RO FA1' limit 1), '5c100000-0000-4000-fc00-000000000001', 'marked', 5 from public.student_enrollments e join public.sections s on s.id = e.section_id where e.academic_year_id = '2c000000-0000-4000-fc00-000000000002' limit 1$$, (select id from _run), 'marks'), 'undo refused: marks entered in the new year');
select pg_temp.ok(pg_temp.blocked_by('00000000-0000-4000-fc00-000000000001', $$select public.collect_fee('56c00000-0000-4000-fc00-000000000003', 100000, 'cash', null, null, (select array_agg(id) from (select id from public.student_fee_dues where student_id = '56c00000-0000-4000-fc00-000000000003' and academic_year_id = '2c000000-0000-4000-fc00-000000000002' order by installment_seq limit 1) q))$$, (select id from _run), 'receipts'), 'undo refused: a fee receipt in the new year');
select pg_temp.ok(pg_temp.blocked_by(null, $$update public.student_enrollments set roll_no = 30 where student_id = '56c00000-0000-4000-fc00-000000000003' and academic_year_id = '2c000000-0000-4000-fc00-000000000002'$$, (select id from _run), 'student_changed'), 'undo refused: a promoted student changed by hand');
select pg_temp.ok(pg_temp.blocked_by(null, $$update public.student_enrollments set roll_no = 31 where student_id = '56c00000-0000-4000-fc00-000000000010' and academic_year_id = '2c000000-0000-4000-fc00-000000000002'$$, (select id from _run), 'student_changed'), 'undo refused: a new admission that was placed by the rollover is changed by hand');
select pg_temp.ok(pg_temp.blocked_by(null, $$insert into public.students (id, admission_no, full_name, gender, date_of_birth, admission_date) values ('56c00000-0000-4000-fc00-000000000011', 'RO-11', 'Late Joiner', 'male', '2072-01-01', '2075-07-01'); insert into public.student_enrollments (student_id, academic_year_id, section_id) select '56c00000-0000-4000-fc00-000000000011', '2c000000-0000-4000-fc00-000000000002', id from public.sections where academic_year_id = '2c000000-0000-4000-fc00-000000000002' limit 1$$, (select id from _run), 'new_admission'), 'undo refused: a new admission after the rollover');
select pg_temp.ok(pg_temp.blocked_by(null, $$insert into public.fee_concessions (student_id, academic_year_id, fee_head_id, kind, percent_bp, reason) values ('56c00000-0000-4000-fc00-000000000003', '2c000000-0000-4000-fc00-000000000002', '62c00000-0000-4000-fc00-000000000001', 'percent', 500, 'Re-approved')$$, (select id from _run), 'fee_changes'), 'undo refused: a concession approved in the new year');
select pg_temp.ok(pg_temp.blocked_by(null, $$insert into public.timetable_entries (academic_year_id, section_id, weekday, period_no, activity) select '2c000000-0000-4000-fc00-000000000002', id, 1, 1, 'Assembly' from public.sections where academic_year_id = '2c000000-0000-4000-fc00-000000000002' and id <> '3d100000-0000-4000-fc00-000000000005' limit 1$$, (select id from _run), 'section_used'), 'undo refused: the new sections are already used elsewhere (timetable)');
select pg_temp.ok((select (public.rollover_undo_check(id) ->> 'allowed')::boolean from _run), 'undo check: still allowed after those trials were rolled back');

-- ================= UNDO restores exactly
create temp table _u as select public.rollover_undo((select id from _run)) j;
grant all on _u to authenticated;
select pg_temp.ok((select pg_temp.fp_touched() = touched_fp from _fp), 'undo: everything the rollover touched is exactly as before (sections, enrolments, dues, plans, students, years)');
select pg_temp.ok((select pg_temp.fp_old() = old_fp from _fp), 'undo: the OLD year is exactly as it was');
select pg_temp.ok((select e.roll_no::text || s.name from public.student_enrollments e join public.sections s on s.id = e.section_id where e.student_id = '56c00000-0000-4000-fc00-000000000010') = '5B', 'undo: the new admission is back in its section with its own roll number');
select pg_temp.ok((select status from public.students where id = '56c00000-0000-4000-fc00-000000000007') = 'active' and (select status from public.students where id = '56c00000-0000-4000-fc00-000000000009') = 'left' and (select status_reason from public.students where id = '56c00000-0000-4000-fc00-000000000009') = 'Moved away', 'undo: students are back (the mid-year leaver is still Left with his reason)');
select pg_temp.ok((select y.is_current from public.academic_years y where y.id = '2c000000-0000-4000-fc00-000000000001') and not (select y.is_current from public.academic_years y where y.id = '2c000000-0000-4000-fc00-000000000002'), 'undo: the old year is current again');
select pg_temp.ok((select status from public.rollover_runs where id = (select id from _run)) = 'undone', 'undo: the run is marked undone');
select pg_temp.ok(exists (select 1 from public.audit_logs where action = 'rollover.undo' and actor_user_id = '00000000-0000-4000-fc00-000000000001' and (details ->> 'students_affected')::int > 0), 'audit: the undo is logged with who and how many students');
select pg_temp.throws($$select public.rollover_undo((select id from public.rollover_runs order by applied_at desc limit 1))$$, 'undo: cannot be done twice', '23514');
select pg_temp.ok((select (pg_temp.pv() ->> 'can_confirm')::boolean), 'after an undo the rollover can be previewed and confirmed again');
select pg_temp.logout();

-- ================= Admin only
create function pg_temp.refused(p_who text) returns void language plpgsql as $$
declare f text;
begin
  foreach f in array array[
    $q$select public.rollover_preview('2c000000-0000-4000-fc00-000000000001', '2c000000-0000-4000-fc00-000000000002', '{}')$q$,
    $q$select public.rollover_confirm('2c000000-0000-4000-fc00-000000000001', '2c000000-0000-4000-fc00-000000000002', '{}', true, 'RO-2075-76')$q$,
    $q$select public.rollover_undo_check((select id from public.rollover_runs limit 1))$q$,
    $q$select public.rollover_undo((select id from public.rollover_runs limit 1))$q$,
    $q$select public.rollover_runs_list()$q$] loop
    perform pg_temp.throws(f, p_who || ': refused — ' || split_part(split_part(f, '(', 1), '.', 2), '42501');
  end loop;
end $$;
select pg_temp.login_as('00000000-0000-4000-fc00-000000000002'); select pg_temp.refused('teacher with every other duty');
select pg_temp.counts($$select count(*) from public.rollover_runs$$, 0, 'teacher: reads no rollover records');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000003'); select pg_temp.refused('office with fee access');
select pg_temp.counts($$select count(*) from public.rollover_runs$$, 0, 'office with fee access: reads no rollover records');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000004'); select pg_temp.refused('office without fee access');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000005'); select pg_temp.refused('deactivated Admin');
select pg_temp.counts($$select count(*) from public.rollover_runs$$, 0, 'deactivated Admin: reads no rollover records');
select pg_temp.login_as(null); select pg_temp.refused('not signed in');
select pg_temp.logout();
-- the previous-year balance follows the fee rules
select pg_temp.login_as('00000000-0000-4000-fc00-000000000002');
select pg_temp.throws($$select public.previous_year_balance('56c00000-0000-4000-fc00-000000000003')$$, 'previous-year balance: teacher refused', '42501');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000004');
select pg_temp.throws($$select public.previous_year_balance('56c00000-0000-4000-fc00-000000000003')$$, 'previous-year balance: office without fee access refused', '42501');
select pg_temp.login_as('00000000-0000-4000-fc00-000000000003');
select pg_temp.lives($$select public.previous_year_balance('56c00000-0000-4000-fc00-000000000003')$$, 'previous-year balance: office with fee access allowed');
select pg_temp.login_as(null);
select pg_temp.throws($$select public.previous_year_balance('56c00000-0000-4000-fc00-000000000003')$$, 'previous-year balance: not signed in refused', '42501');
select pg_temp.logout();
