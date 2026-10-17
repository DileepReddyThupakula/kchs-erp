-- Reports (Module 8, database part): who may ask for what, the numbers, and that no report carries an ID number. Rolled back.
update public.school_settings set mediums = '{English,Telugu}', receipt_no_prefix = 'RCPT-' where id = 1;
select pg_temp.fixture_user('00000000-0000-4000-fb00-000000000001', 'admin@rp.test');
select pg_temp.fixture_user('00000000-0000-4000-fb00-000000000002', 'ct@rp.test');      -- class teacher of A
select pg_temp.fixture_user('00000000-0000-4000-fb00-000000000003', 'sub@rp.test');     -- subject teacher in B
select pg_temp.fixture_user('00000000-0000-4000-fb00-000000000004', 'duty@rp.test');    -- teacher with every duty except fees
select pg_temp.fixture_user('00000000-0000-4000-fb00-000000000005', 'fee@rp.test');     -- office with fee access
select pg_temp.fixture_user('00000000-0000-4000-fb00-000000000006', 'desk@rp.test');    -- office without fee access, with student_records
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('1f000000-0000-4000-fb00-000000000001', '00000000-0000-4000-fb00-000000000001', 'admin',          'RP-ADM', 'Rp Admin'),
  ('1f000000-0000-4000-fb00-000000000002', '00000000-0000-4000-fb00-000000000002', 'teacher',        'RP-CT',  'Rp Class teacher'),
  ('1f000000-0000-4000-fb00-000000000003', '00000000-0000-4000-fb00-000000000003', 'teacher',        'RP-SUB', 'Rp Subject teacher'),
  ('1f000000-0000-4000-fb00-000000000004', '00000000-0000-4000-fb00-000000000004', 'teacher',        'RP-DUT', 'Rp Duty teacher'),
  ('1f000000-0000-4000-fb00-000000000005', '00000000-0000-4000-fb00-000000000005', 'computer_staff', 'RP-FEE', 'Rp Fee clerk'),
  ('1f000000-0000-4000-fb00-000000000006', '00000000-0000-4000-fb00-000000000006', 'computer_staff', 'RP-DSK', 'Rp Desk');
insert into public.staff_permissions (staff_id, duty) select '1f000000-0000-4000-fb00-000000000004', d from unnest(enum_range(null::public.staff_duty)) d where d <> 'fee_collection';
insert into public.staff_permissions (staff_id, duty) values ('1f000000-0000-4000-fb00-000000000005', 'fee_collection'), ('1f000000-0000-4000-fb00-000000000006', 'student_records');

insert into public.academic_years (id, name, start_date, end_date) values ('2f000000-0000-4000-fb00-000000000001', 'RP-2078-79', '2078-04-01', '2079-03-31');
insert into public.classes (id, name, sort_order) values ('3a300000-0000-4000-fb00-000000000001', 'RP C1', 981);
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id) values
  ('3b300000-0000-4000-fb00-000000000001', '2f000000-0000-4000-fb00-000000000001', '3a300000-0000-4000-fb00-000000000001', 'A', '1f000000-0000-4000-fb00-000000000002'),
  ('3b300000-0000-4000-fb00-000000000002', '2f000000-0000-4000-fb00-000000000001', '3a300000-0000-4000-fb00-000000000001', 'B', null);
insert into public.subjects (id, name, code) values ('5d100000-0000-4000-fb00-000000000001', 'RP Maths', 'RPM'), ('5d100000-0000-4000-fb00-000000000002', 'RP Science', 'RPS');
insert into public.teacher_assignments (staff_id, section_id, subject_id) values
  ('1f000000-0000-4000-fb00-000000000003', '3b300000-0000-4000-fb00-000000000002', '5d100000-0000-4000-fb00-000000000001');
-- A: 3 boys + 2 girls active, 1 left; B: 1 girl active
insert into public.students (id, admission_no, full_name, gender, date_of_birth, admission_date, status, status_date) values
  ('56300000-0000-4000-fb00-000000000001', 'RP-1', 'Rp One',   'male',   '2070-01-01', '2078-06-10', 'active', null),
  ('56300000-0000-4000-fb00-000000000002', 'RP-2', 'Rp Two',   'male',   '2070-01-01', '2078-06-12', 'active', null),
  ('56300000-0000-4000-fb00-000000000003', 'RP-3', 'Rp Three', 'male',   '2070-01-01', '2070-06-01', 'active', null),
  ('56300000-0000-4000-fb00-000000000004', 'RP-4', 'Rp Four',  'female', '2070-01-01', '2070-06-01', 'active', null),
  ('56300000-0000-4000-fb00-000000000005', 'RP-5', 'Rp Five',  'female', '2070-01-01', '2070-06-01', 'active', null),
  ('56300000-0000-4000-fb00-000000000006', 'RP-6', 'Rp Six',   'female', '2070-01-01', '2070-06-01', 'left',   '2078-09-01'),
  ('56300000-0000-4000-fb00-000000000007', 'RP-7', 'Rp Seven', 'female', '2070-01-01', '2070-06-01', 'active', null);
insert into public.student_enrollments (student_id, academic_year_id, section_id)
select ('56300000-0000-4000-fb00-00000000000' || n)::uuid, '2f000000-0000-4000-fb00-000000000001', case when n <= 6 then '3b300000-0000-4000-fb00-000000000001'::uuid else '3b300000-0000-4000-fb00-000000000002'::uuid end from generate_series(1, 7) n;
insert into public.student_profiles (student_id, details) values ('56300000-0000-4000-fb00-000000000001', '{"social_category": "OBC", "religion": "Hindu"}'), ('56300000-0000-4000-fb00-000000000002', '{"social_category": "OBC", "religion": "Hindu"}');

-- fees: tuition 12,000 a year in 12 monthly dues (dues start Apr 2078); S1 pays one month
insert into public.fee_heads (id, name, code, sort_order) values ('62100000-0000-4000-fb00-000000000001', 'RP Tuition', 'RP-TUI', 93);
insert into public.fee_plans (id, academic_year_id, name, kind, due_day) values ('63100000-0000-4000-fb00-000000000001', '2f000000-0000-4000-fb00-000000000001', 'RP Monthly', 'monthly', 10);
insert into public.fee_structure (academic_year_id, class_id, fee_head_id, amount_paise, default_plan_id) values
  ('2f000000-0000-4000-fb00-000000000001', '3a300000-0000-4000-fb00-000000000001', '62100000-0000-4000-fb00-000000000001', 1200000, '63100000-0000-4000-fb00-000000000001');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000005');
select pg_temp.lives($$select public.collect_fee('56300000-0000-4000-fb00-000000000001', 100000, 'cash')$$, 'fee clerk collects 1,000 from S1');
select pg_temp.logout();

-- results (direct rows, as the calculation would leave them)
insert into public.result_groups (id, academic_year_id, class_id, name, kind) values ('64100000-0000-4000-fb00-000000000001', '2f000000-0000-4000-fb00-000000000001', '3a300000-0000-4000-fb00-000000000001', 'RP Term 1', 'term');
insert into public.student_results (academic_year_id, class_id, section_id, student_id, group_id, scored, max_marks, pct, grade, result, subjects_count, failed_count)
select '2f000000-0000-4000-fb00-000000000001', '3a300000-0000-4000-fb00-000000000001', '3b300000-0000-4000-fb00-000000000001', ('56300000-0000-4000-fb00-00000000000' || n)::uuid, '64100000-0000-4000-fb00-000000000001',
       v.sc, 100, v.sc, v.g, v.r, 2, case when v.r = 'fail' then 1 else 0 end
  from (values (1, 90, 'A1', 'pass'), (2, 60, 'B2', 'pass'), (3, 30, 'E', 'fail'), (4, 0, null, 'incomplete')) v(n, sc, g, r) where true;
insert into public.subject_results (academic_year_id, class_id, section_id, student_id, group_id, subject_id, scored, max_marks, pct, pass_percent, passed, missing)
values ('2f000000-0000-4000-fb00-000000000001', '3a300000-0000-4000-fb00-000000000001', '3b300000-0000-4000-fb00-000000000001', '56300000-0000-4000-fb00-000000000001', '64100000-0000-4000-fb00-000000000001', '5d100000-0000-4000-fb00-000000000002', 80, 100, 80, 35, true, 0),
       ('2f000000-0000-4000-fb00-000000000001', '3a300000-0000-4000-fb00-000000000001', '3b300000-0000-4000-fb00-000000000002', '56300000-0000-4000-fb00-000000000007', '64100000-0000-4000-fb00-000000000001', '5d100000-0000-4000-fb00-000000000001', 40, 100, 40, 35, true, 0),
       ('2f000000-0000-4000-fb00-000000000001', '3a300000-0000-4000-fb00-000000000001', '3b300000-0000-4000-fb00-000000000002', '56300000-0000-4000-fb00-000000000007', '64100000-0000-4000-fb00-000000000001', '5d100000-0000-4000-fb00-000000000002', 20, 100, 20, 35, false, 0);

-- ================= strength
select pg_temp.login_as('00000000-0000-4000-fb00-000000000001');
select pg_temp.counts($$select active from public.report_strength('2f000000-0000-4000-fb00-000000000001') where section_name = 'A'$$, 5, 'strength (Admin): A has 5 active');
select pg_temp.counts($$select boys * 100 + girls from public.report_strength('2f000000-0000-4000-fb00-000000000001') where section_name = 'A'$$, 302, 'strength: 3 boys, 2 girls');
select pg_temp.counts($$select left_school from public.report_strength('2f000000-0000-4000-fb00-000000000001') where section_name = 'A'$$, 1, 'strength: 1 left');
select pg_temp.counts($$select count(*) from public.report_strength('2f000000-0000-4000-fb00-000000000001')$$, 2, 'strength: both sections');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000002');
select pg_temp.counts($$select count(*) from public.report_strength('2f000000-0000-4000-fb00-000000000001')$$, 1, 'strength (class teacher): only their own section');
select pg_temp.counts($$select active from public.report_strength('2f000000-0000-4000-fb00-000000000001')$$, 5, 'strength (class teacher): its numbers');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000003');
select pg_temp.counts($$select sum(active) from public.report_strength('2f000000-0000-4000-fb00-000000000001')$$, 1, 'strength (subject teacher): only section B''s 1 student');

-- ================= demographics / admissions: Admin and student_records only
select pg_temp.login_as('00000000-0000-4000-fb00-000000000001');
select pg_temp.counts($$select students from public.report_demographics('2f000000-0000-4000-fb00-000000000001') where social_category = 'OBC'$$, 2, 'demographics (Admin): 2 OBC');
select pg_temp.counts($$select sum(students) from public.report_demographics('2f000000-0000-4000-fb00-000000000001')$$, 6, 'demographics: 6 active students in all');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000006');
select pg_temp.lives($$select * from public.report_demographics('2f000000-0000-4000-fb00-000000000001')$$, 'demographics: office with student_records may');
select pg_temp.counts($$select count(*) from public.report_admissions('2f000000-0000-4000-fb00-000000000001', '2078-06-01', '2078-06-30') where kind = 'admitted'$$, 2, 'admissions: two in June');
select pg_temp.counts($$select count(*) from public.report_admissions('2f000000-0000-4000-fb00-000000000001', '2078-09-01', '2078-09-30') where kind = 'left'$$, 1, 'admissions: one leaver in September');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000002');
select pg_temp.throws($$select * from public.report_demographics('2f000000-0000-4000-fb00-000000000001')$$, 'demographics: a class teacher cannot', '42501');
select pg_temp.throws($$select * from public.report_admissions('2f000000-0000-4000-fb00-000000000001', '2078-01-01', '2079-01-01')$$, 'admissions list: a class teacher cannot', '42501');

-- ================= fee reports
select pg_temp.login_as('00000000-0000-4000-fb00-000000000001');
select pg_temp.counts($$select (select count(*) from public.student_fee_dues where academic_year_id = '2f000000-0000-4000-fb00-000000000001' and voided_at is null)$$, 68, 'fixture: 4 students x 12 monthly dues + 2 June joiners x 10');
select pg_temp.counts($$select billed_paise from public.report_fee_dues_by_class('2f000000-0000-4000-fb00-000000000001', '2079-03-31')$$, 6800000, 'fee dues by class: billed = 68 x 1,000');
select pg_temp.counts($$select paid_paise from public.report_fee_dues_by_class('2f000000-0000-4000-fb00-000000000001', '2079-03-31')$$, 100000, 'fee dues by class: paid = the 1,000 collected');
select pg_temp.counts($$select overdue_paise from public.report_fee_dues_by_class('2f000000-0000-4000-fb00-000000000001', '2079-03-31')$$, 6700000, 'fee dues by class: everything due by year end, less what was paid');
select pg_temp.counts($$select overdue_paise from public.report_fee_dues_by_class('2f000000-0000-4000-fb00-000000000001', '2078-04-10')$$, 400000, 'fee dues by class: on 10 April only the 4 early students'' April installments are due (the 1,000 paid goes to June)');
select pg_temp.counts($$select count(*) from public.report_fee_defaulters('2f000000-0000-4000-fb00-000000000001', '2078-04-10')$$, 4, 'defaulters on 10 April: the 4 students whose April installment is unpaid');
select pg_temp.counts($$select count(*) from public.report_fee_defaulters('2f000000-0000-4000-fb00-000000000001', '2078-04-10', 100000)$$, 4, 'defaulters with a minimum of 1,000: the same 4');
select pg_temp.counts($$select count(*) from public.report_fee_defaulters('2f000000-0000-4000-fb00-000000000001', '2078-04-10') where admission_no = 'RP-1'$$, 0, 'defaulters: S1 joined in June, nothing due on 10 April');
select pg_temp.counts($$select count(*) from public.report_fee_collection_monthly('2f000000-0000-4000-fb00-000000000001')$$, 0, 'monthly collection: payments are dated today, outside this fixture year (nothing counted)');
select pg_temp.counts($$select count(*) from public.report_fee_concessions('2f000000-0000-4000-fb00-000000000001')$$, 0, 'concessions: none in this fixture');

-- who else may ask for fee reports?
create function pg_temp.fee_report_calls() returns text language plpgsql as $$
declare out text := '';
begin
  begin perform * from public.report_fee_dues_by_class('2f000000-0000-4000-fb00-000000000001'); out := out || 'dues '; exception when others then null; end;
  begin perform * from public.report_fee_defaulters('2f000000-0000-4000-fb00-000000000001'); out := out || 'defaulters '; exception when others then null; end;
  begin perform * from public.report_fee_collection_monthly('2f000000-0000-4000-fb00-000000000001'); out := out || 'monthly '; exception when others then null; end;
  begin perform * from public.report_fee_concessions('2f000000-0000-4000-fb00-000000000001'); out := out || 'concessions '; exception when others then null; end;
  return out;
end $$;
select pg_temp.login_as('00000000-0000-4000-fb00-000000000005');
select pg_temp.ok(pg_temp.fee_report_calls() = 'dues defaulters monthly concessions ', 'office with fee access: all four fee reports', pg_temp.fee_report_calls());
select pg_temp.login_as('00000000-0000-4000-fb00-000000000004');
select pg_temp.ok(pg_temp.fee_report_calls() = '', 'a teacher with every other duty: none of the fee reports', pg_temp.fee_report_calls());
select pg_temp.login_as('00000000-0000-4000-fb00-000000000002');
select pg_temp.ok(pg_temp.fee_report_calls() = '', 'a class teacher: none of the fee reports');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000006');
select pg_temp.ok(pg_temp.fee_report_calls() = '', 'office without fee access (even with student_records): none of the fee reports', pg_temp.fee_report_calls());
select pg_temp.login_as(null);
select pg_temp.throws($$select * from public.report_fee_dues_by_class('2f000000-0000-4000-fb00-000000000001')$$, 'anonymous: no fee report', '42501');
-- access removed: reports stop at once
select pg_temp.login_as('00000000-0000-4000-fb00-000000000001');
select pg_temp.affects($$delete from public.staff_permissions where staff_id = '1f000000-0000-4000-fb00-000000000005' and duty = 'fee_collection'$$, 1, 'admin removes the clerk''s fee access');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000005');
select pg_temp.ok(pg_temp.fee_report_calls() = '', 'access removed: the fee reports stop at once', pg_temp.fee_report_calls());

-- ================= exam reports
select pg_temp.login_as('00000000-0000-4000-fb00-000000000001');
select pg_temp.counts($$select passed * 100 + failed * 10 + incomplete from public.report_class_results('64100000-0000-4000-fb00-000000000001') where section_name = 'A'$$, 211, 'class results (Admin): 2 pass, 1 fail, 1 incomplete');
select pg_temp.counts($$select (grades ->> 'A1')::int from public.report_class_results('64100000-0000-4000-fb00-000000000001') where section_name = 'A'$$, 1, 'class results: grade spread');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000002');
select pg_temp.counts($$select count(*) from public.report_class_results('64100000-0000-4000-fb00-000000000001')$$, 1, 'class results (class teacher): their own section only');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000003');
select pg_temp.throws($$select * from public.report_class_results('64100000-0000-4000-fb00-000000000001')$$, 'class results: a subject teacher cannot', '42501');
select pg_temp.counts($$select count(*) from public.report_subject_results('64100000-0000-4000-fb00-000000000001')$$, 1, 'subject results (subject teacher): only their own (section, subject): Maths in B');
select pg_temp.counts($$select count(*) from public.report_subject_results('64100000-0000-4000-fb00-000000000001') where subject_name = 'RP Maths'$$, 1, 'subject results: and it is the right one');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000004');
select pg_temp.counts($$select count(*) from public.report_subject_results('64100000-0000-4000-fb00-000000000001')$$, 3, 'subject results (marks duty): every row');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000006');
select pg_temp.throws($$select * from public.report_class_results('64100000-0000-4000-fb00-000000000001')$$, 'class results: office without the marks duty cannot', '42501');

-- ================= staff report: Admin only
select pg_temp.login_as('00000000-0000-4000-fb00-000000000001');
select pg_temp.lives($$select * from public.report_staff_attendance('2078-04-01', '2078-04-30')$$, 'staff attendance report: Admin');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000004');
select pg_temp.throws($$select * from public.report_staff_attendance('2078-04-01', '2078-04-30')$$, 'staff attendance report: not even a teacher with every other duty', '42501');

-- ================= my own summary
select pg_temp.login_as('00000000-0000-4000-fb00-000000000003');
select pg_temp.counts($$select (public.report_my_load('2f000000-0000-4000-fb00-000000000001') ->> 'sections')::int$$, 1, 'my load: their one section');
select pg_temp.login_as(null);
select pg_temp.throws($$select public.report_my_load('2f000000-0000-4000-fb00-000000000001')$$, 'my load: anonymous cannot', '42501');

-- ================= logging of exports and prints
select pg_temp.login_as('00000000-0000-4000-fb00-000000000002');
select pg_temp.lives($$select public.log_report('strength', 'csv', '{"year": "RP"}', 12)$$, 'a teacher logs the export of their own report');
select pg_temp.lives($$select public.log_report('strength', 'print', '{"year": "RP"}', 12)$$, 'and a print');
select pg_temp.throws($$select public.log_report('strength', 'whatsapp', '{}', 1)$$, 'sharing by WhatsApp is not a report format', '23514');
select pg_temp.login_as('00000000-0000-4000-fb00-000000000001');
select pg_temp.counts($$select count(*) from public.audit_logs where action = 'report.export' and details ->> 'report' = 'strength' and details ->> 'format' = 'csv' and details -> 'filters' ->> 'year' = 'RP' and (details ->> 'rows')::int = 12 and actor_role = 'teacher'$$, 1, 'the export is in the audit log: who (role), which report, format, filters, rows');
select pg_temp.counts($$select count(*) from public.audit_logs where action = 'report.print' and details ->> 'report' = 'strength' and details -> 'filters' ->> 'year' = 'RP'$$, 1, 'the print is in the audit log');
select pg_temp.login_as(null);
select pg_temp.throws($$select public.log_report('strength', 'csv')$$, 'anonymous cannot log', '42501');

-- ================= no report carries an ID number or contact detail
select pg_temp.logout();
select pg_temp.counts($$select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace, unnest(coalesce(p.proargnames, '{}'::text[])) a
                         where n.nspname = 'public' and p.proname like 'report\_%' and a ~* '(aadhaar|udid|ration|child_id|pen|phone|mobile|address|dob|date_of_birth)'$$, 0, 'no report function has an ID, phone, address or birth date in its columns');
