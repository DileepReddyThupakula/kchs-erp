-- Attendance + staff leave + staff attendance: rules, scope, half-day math. Rolled back.
-- Every day is a school day for the fixture year so "today" works whatever day this runs.
update public.school_settings set mediums = '{English,Telugu}', working_days = '{1,2,3,4,5,6,7}', second_saturday_holiday = false where id = 1;

create function pg_temp.today() returns date language sql as $$ select app.today_ist() $$;
create function pg_temp.wd() returns integer language sql as $$ select extract(isodow from app.today_ist())::integer $$;

select pg_temp.fixture_user('00000000-0000-4000-f400-000000000001', 'admin@at.test');
select pg_temp.fixture_user('00000000-0000-4000-f400-000000000002', 'duty@at.test');
select pg_temp.fixture_user('00000000-0000-4000-f400-000000000003', 't1@at.test');
select pg_temp.fixture_user('00000000-0000-4000-f400-000000000004', 't2@at.test');
select pg_temp.fixture_user('00000000-0000-4000-f400-000000000005', 't3@at.test');
select pg_temp.fixture_user('00000000-0000-4000-f400-000000000006', 't4@at.test');
select pg_temp.fixture_user('00000000-0000-4000-f400-000000000007', 't5@at.test');
select pg_temp.fixture_user('00000000-0000-4000-f400-000000000008', 't6@at.test');
select pg_temp.fixture_user('00000000-0000-4000-f400-000000000009', 'tt@at.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('18000000-0000-4000-f400-000000000001', '00000000-0000-4000-f400-000000000001', 'admin',   'AT-ADM', 'At Admin'),
  ('18000000-0000-4000-f400-000000000002', '00000000-0000-4000-f400-000000000002', 'teacher', 'AT-DUT', 'At Duty'),
  ('18000000-0000-4000-f400-000000000003', '00000000-0000-4000-f400-000000000003', 'teacher', 'AT-T1',  'At One (scheduled P1 of A, substituted)'),
  ('18000000-0000-4000-f400-000000000004', '00000000-0000-4000-f400-000000000004', 'teacher', 'AT-T2',  'At Two (scheduled P5 of A)'),
  ('18000000-0000-4000-f400-000000000005', '00000000-0000-4000-f400-000000000005', 'teacher', 'AT-T3',  'At Three (class teacher of A)'),
  ('18000000-0000-4000-f400-000000000006', '00000000-0000-4000-f400-000000000006', 'teacher', 'AT-T4',  'At Four (substitute today)'),
  ('18000000-0000-4000-f400-000000000007', '00000000-0000-4000-f400-000000000007', 'teacher', 'AT-T5',  'At Five (P1 of B)'),
  ('18000000-0000-4000-f400-000000000008', '00000000-0000-4000-f400-000000000008', 'teacher', 'AT-T6',  'At Six (unrelated)'),
  ('18000000-0000-4000-f400-000000000009', '00000000-0000-4000-f400-000000000009', 'teacher', 'AT-TT',  'At Seven (timetable duty)');
insert into public.staff_permissions (staff_id, duty) values
  ('18000000-0000-4000-f400-000000000002', 'all_class_attendance'),
  ('18000000-0000-4000-f400-000000000009', 'timetable_edit');

insert into public.academic_years (id, name, start_date, end_date) values
  ('28000000-0000-4000-f400-000000000001', 'AT-YEAR', app.today_ist() - 100, app.today_ist() + 300);
insert into public.classes (id, name, sort_order) values ('3c000000-0000-4000-f400-000000000001', 'AT C1', 971);
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id) values
  ('3d000000-0000-4000-f400-000000000001', '28000000-0000-4000-f400-000000000001', '3c000000-0000-4000-f400-000000000001', 'A', '18000000-0000-4000-f400-000000000005'),
  ('3d000000-0000-4000-f400-000000000002', '28000000-0000-4000-f400-000000000001', '3c000000-0000-4000-f400-000000000001', 'B', null);
insert into public.subjects (id, name, code) values ('5b000000-0000-4000-f400-000000000001', 'AT Maths', 'ATM');
insert into public.teacher_assignments (staff_id, section_id, subject_id) values
  ('18000000-0000-4000-f400-000000000003', '3d000000-0000-4000-f400-000000000001', '5b000000-0000-4000-f400-000000000001'),
  ('18000000-0000-4000-f400-000000000004', '3d000000-0000-4000-f400-000000000001', '5b000000-0000-4000-f400-000000000001'),
  ('18000000-0000-4000-f400-000000000007', '3d000000-0000-4000-f400-000000000002', '5b000000-0000-4000-f400-000000000001');
-- today's weekday: A P1 = t1 (substituted today by t4), A P5 = t2, B P1 = t5
insert into public.timetable_entries (section_id, weekday, period_no, subject_id, teacher_id) values
  ('3d000000-0000-4000-f400-000000000001', pg_temp.wd(), 1, '5b000000-0000-4000-f400-000000000001', '18000000-0000-4000-f400-000000000003'),
  ('3d000000-0000-4000-f400-000000000001', pg_temp.wd(), 5, '5b000000-0000-4000-f400-000000000001', '18000000-0000-4000-f400-000000000004'),
  ('3d000000-0000-4000-f400-000000000002', pg_temp.wd(), 1, '5b000000-0000-4000-f400-000000000001', '18000000-0000-4000-f400-000000000007');
insert into public.staff (id, employee_code, full_name) values ('18000000-0000-4000-f400-000000000010', 'AT-SUB', 'At Substitute holder');
insert into public.timetable_substitutions (sub_date, section_id, period_no, original_teacher_id, substitute_teacher_id, reason) values
  (pg_temp.today(), '3d000000-0000-4000-f400-000000000001', 1, '18000000-0000-4000-f400-000000000003', '18000000-0000-4000-f400-000000000006', 'Test');

insert into public.students (id, admission_no, full_name, gender, date_of_birth, admission_date) values
  ('55000000-0000-4000-f400-000000000001', 'AT-A1', 'At A1', 'male',   '2075-01-01', '2020-06-01'),
  ('55000000-0000-4000-f400-000000000002', 'AT-A2', 'At A2', 'female', '2075-01-01', '2020-06-01'),
  ('55000000-0000-4000-f400-000000000003', 'AT-A3', 'At A3', 'male',   '2075-01-01', '2020-06-01'),
  ('55000000-0000-4000-f400-000000000004', 'AT-A4', 'At A4', 'female', '2075-01-01', '2020-06-01'),
  ('55000000-0000-4000-f400-000000000005', 'AT-B1', 'At B1', 'male',   '2075-01-01', '2020-06-01');
insert into public.student_enrollments (student_id, academic_year_id, section_id) values
  ('55000000-0000-4000-f400-000000000001', '28000000-0000-4000-f400-000000000001', '3d000000-0000-4000-f400-000000000001'),
  ('55000000-0000-4000-f400-000000000002', '28000000-0000-4000-f400-000000000001', '3d000000-0000-4000-f400-000000000001'),
  ('55000000-0000-4000-f400-000000000003', '28000000-0000-4000-f400-000000000001', '3d000000-0000-4000-f400-000000000001'),
  ('55000000-0000-4000-f400-000000000004', '28000000-0000-4000-f400-000000000001', '3d000000-0000-4000-f400-000000000001'),
  ('55000000-0000-4000-f400-000000000005', '28000000-0000-4000-f400-000000000001', '3d000000-0000-4000-f400-000000000002');

create function pg_temp.entries(p1 text, p2 text, p3 text, p4 text) returns text language sql as $$
  select jsonb_build_array(
    jsonb_build_object('student_id', '55000000-0000-4000-f400-000000000001', 'status', p1),
    jsonb_build_object('student_id', '55000000-0000-4000-f400-000000000002', 'status', p2),
    jsonb_build_object('student_id', '55000000-0000-4000-f400-000000000003', 'status', p3),
    jsonb_build_object('student_id', '55000000-0000-4000-f400-000000000004', 'status', p4))::text
$$;
create function pg_temp.entriesB() returns text language sql as $$
  select jsonb_build_array(jsonb_build_object('student_id', '55000000-0000-4000-f400-000000000005', 'status', 'present'))::text
$$;
grant execute on function pg_temp.entries(text, text, text, text), pg_temp.entriesB(), pg_temp.today(), pg_temp.wd() to authenticated;

-- =====================================================================
-- Who is the marker (session_markers from the Timetable module)
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f400-000000000001');
select pg_temp.ok((select staff_id = '18000000-0000-4000-f400-000000000006' and source = 'substitute' from public.session_markers('3d000000-0000-4000-f400-000000000001', pg_temp.today()) where session = 'morning'), 'marker: morning of A today = the substitute');
select pg_temp.ok((select staff_id = '18000000-0000-4000-f400-000000000004' and source = 'scheduled' from public.session_markers('3d000000-0000-4000-f400-000000000001', pg_temp.today()) where session = 'afternoon'), 'marker: afternoon of A today = scheduled P5 teacher');

-- =====================================================================
-- Permissions to mark
-- =====================================================================
-- t1 is scheduled for P1 but substituted today: not their session
select pg_temp.login_as('00000000-0000-4000-f400-000000000003');
select pg_temp.throws($$select public.mark_attendance('3d000000-0000-4000-f400-000000000001', pg_temp.today(), 'morning', pg_temp.entries('present','present','present','present')::jsonb)$$, 'scheduled teacher replaced by a substitute cannot mark that session', '42501');
-- class teacher: not the marker of either session of A today
select pg_temp.login_as('00000000-0000-4000-f400-000000000005');
select pg_temp.throws($$select public.mark_attendance('3d000000-0000-4000-f400-000000000001', pg_temp.today(), 'afternoon', pg_temp.entries('present','present','present','present')::jsonb)$$, 'class teacher cannot mark a session assigned to someone else', '42501');
-- unrelated teacher
select pg_temp.login_as('00000000-0000-4000-f400-000000000008');
select pg_temp.throws($$select public.mark_attendance('3d000000-0000-4000-f400-000000000001', pg_temp.today(), 'morning', pg_temp.entries('present','present','present','present')::jsonb)$$, 'unrelated teacher cannot mark', '42501');
-- B's teacher cannot mark A
select pg_temp.login_as('00000000-0000-4000-f400-000000000007');
select pg_temp.throws($$select public.mark_attendance('3d000000-0000-4000-f400-000000000001', pg_temp.today(), 'morning', pg_temp.entries('present','present','present','present')::jsonb)$$, 'a teacher of another section cannot mark this one', '42501');

-- the substitute marks the morning
select pg_temp.login_as('00000000-0000-4000-f400-000000000006');
select pg_temp.ok((select count(*) = 1 and bool_and(marked = false) from public.my_attendance_sessions() where section_id = '3d000000-0000-4000-f400-000000000001' and session = 'morning'), 'substitute sees the morning session waiting');
select pg_temp.counts($$select count(*) from public.my_attendance_sessions() where section_id = '3d000000-0000-4000-f400-000000000001' and session = 'afternoon'$$, 0, 'substitute does not see the afternoon session');
select pg_temp.throws($$select public.mark_attendance('3d000000-0000-4000-f400-000000000001', pg_temp.today(), 'morning', pg_temp.entries('present','present','present', null)::jsonb)$$, 'a missing/invalid status is rejected', '23514');
select pg_temp.throws($$select public.mark_attendance('3d000000-0000-4000-f400-000000000001', pg_temp.today(), 'morning', (jsonb_build_array(jsonb_build_object('student_id', '55000000-0000-4000-f400-000000000001', 'status', 'present')))::jsonb)$$, 'first marking must cover every student', '23514');
select pg_temp.throws($$select public.mark_attendance('3d000000-0000-4000-f400-000000000001', pg_temp.today(), 'morning', pg_temp.entriesB()::jsonb)$$, 'a student of another section cannot be marked here', '23514');
select pg_temp.lives($$select public.mark_attendance('3d000000-0000-4000-f400-000000000001', pg_temp.today(), 'morning', pg_temp.entries('present','absent','late','leave')::jsonb)$$, 'substitute: marks the morning session');
select pg_temp.counts($$select count(*) from public.attendance_sessions where kind = 'substitute' and marked_by = '18000000-0000-4000-f400-000000000006' and assigned_to = '18000000-0000-4000-f400-000000000006'$$, 1, 'session records marker, assignee and kind = substitute');
select pg_temp.ok((select marked and marked_kind = 'substitute' from public.my_attendance_sessions() where section_id = '3d000000-0000-4000-f400-000000000001' and session = 'morning'), 'the screen function shows it as marked');

-- the same marker may save again today (update, no duplicates)
select pg_temp.lives($$select public.mark_attendance('3d000000-0000-4000-f400-000000000001', pg_temp.today(), 'morning', pg_temp.entries('present','absent','present','leave')::jsonb)$$, 'marker: re-saves the same session today');
select pg_temp.login_as('00000000-0000-4000-f400-000000000001');
select pg_temp.counts($$select count(*) from public.student_attendance where att_date = pg_temp.today() and session = 'morning' and student_id = '55000000-0000-4000-f400-000000000003'$$, 1, 'no duplicate row per student, date and session');
select pg_temp.counts($$select count(*) from public.attendance_sessions where section_id = '3d000000-0000-4000-f400-000000000001' and att_date = pg_temp.today() and session = 'morning'$$, 1, 'one session row per section, date and session');
select pg_temp.ok(exists (select 1 from public.audit_logs where table_name = 'student_attendance' and action = 'update' and old_data ->> 'status' = 'late' and new_data ->> 'status' = 'present'), 'a change is audit-logged with old and new value');

-- afternoon by the scheduled teacher (t2): regular
select pg_temp.login_as('00000000-0000-4000-f400-000000000004');
select pg_temp.lives($$select public.mark_attendance('3d000000-0000-4000-f400-000000000001', pg_temp.today(), 'afternoon', pg_temp.entries('present','present','present','absent')::jsonb)$$, 'scheduled teacher: marks the afternoon session');
select pg_temp.counts($$select count(*) from public.attendance_sessions where session = 'afternoon' and kind = 'regular' and marked_by = '18000000-0000-4000-f400-000000000004'$$, 1, 'kind = regular');
-- but not for a past day
select pg_temp.throws($$select public.mark_attendance('3d000000-0000-4000-f400-000000000001', pg_temp.today() - 1, 'afternoon', pg_temp.entries('present','present','present','present')::jsonb)$$, 'ordinary teacher cannot mark a past date', '42501');

-- B: its P1 teacher t5 marks; afternoon has nobody (no class teacher)
select pg_temp.login_as('00000000-0000-4000-f400-000000000007');
select pg_temp.lives($$select public.mark_attendance('3d000000-0000-4000-f400-000000000002', pg_temp.today(), 'morning', pg_temp.entriesB()::jsonb)$$, 'B morning marked by its P1 teacher');
select pg_temp.throws($$select public.mark_attendance('3d000000-0000-4000-f400-000000000002', pg_temp.today(), 'afternoon', pg_temp.entriesB()::jsonb)$$, 'B afternoon has no assigned teacher: ordinary teacher cannot mark', '42501');

-- =====================================================================
-- Admin / duty teacher: any section, session, date; corrections
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f400-000000000002');
select pg_temp.lives($$select public.mark_attendance('3d000000-0000-4000-f400-000000000002', pg_temp.today(), 'afternoon', pg_temp.entriesB()::jsonb)$$, 'duty teacher: marks a session with no assigned teacher');
select pg_temp.lives($$select public.mark_attendance('3d000000-0000-4000-f400-000000000001', pg_temp.today() - 1, 'morning', pg_temp.entries('present','absent','present','absent')::jsonb)$$, 'duty teacher: marks a past date');
select pg_temp.lives($$select public.mark_attendance('3d000000-0000-4000-f400-000000000001', pg_temp.today() - 1, 'afternoon', pg_temp.entries('present','absent','absent','absent')::jsonb)$$, 'duty teacher: marks the past afternoon');
select pg_temp.counts($$select count(*) from public.attendance_sessions where att_date = pg_temp.today() - 1 and kind = 'correction' and marked_by = '18000000-0000-4000-f400-000000000002'$$, 2, 'duty marking is recorded as a correction with who and when');
select pg_temp.lives($$select public.mark_attendance('3d000000-0000-4000-f400-000000000001', pg_temp.today(), 'morning', jsonb_build_array(jsonb_build_object('student_id', '55000000-0000-4000-f400-000000000002', 'status', 'late'))::jsonb)$$, 'duty teacher: corrects one student of a marked session');
select pg_temp.counts($$select count(*) from public.attendance_sessions where att_date = pg_temp.today() and session = 'morning' and section_id = '3d000000-0000-4000-f400-000000000001' and kind = 'correction'$$, 1, 'the corrected session is flagged as a correction');
select pg_temp.throws($$select public.mark_attendance('3d000000-0000-4000-f400-000000000001', pg_temp.today() + 1, 'morning', pg_temp.entries('present','present','present','present')::jsonb)$$, 'no marking for a future date (even for the duty teacher)', '23514');
select pg_temp.ok((select count(*) >= 1 from public.unmarked_sessions(pg_temp.today() - 1) where section_id = '3d000000-0000-4000-f400-000000000002'), 'unmarked sessions: B was not marked yesterday');
select pg_temp.counts($$select count(*) from public.unmarked_sessions(pg_temp.today()) where section_id in ('3d000000-0000-4000-f400-000000000001', '3d000000-0000-4000-f400-000000000002')$$, 0, 'unmarked sessions: nothing left today for A and B');

-- holidays, 2nd Saturday
select pg_temp.login_as('00000000-0000-4000-f400-000000000001');
insert into public.holidays (academic_year_id, date, name) values ('28000000-0000-4000-f400-000000000001', pg_temp.today() - 3, 'AT Holiday');
select pg_temp.throws($$select public.mark_attendance('3d000000-0000-4000-f400-000000000001', pg_temp.today() - 3, 'morning', pg_temp.entries('present','present','present','present')::jsonb)$$, 'no marking on a holiday (Admin too)', '23514');
select pg_temp.logout();
update public.school_settings set second_saturday_holiday = true where id = 1;
select pg_temp.login_as('00000000-0000-4000-f400-000000000001');
select pg_temp.throws($$select public.mark_attendance('3d000000-0000-4000-f400-000000000001',
  (date_trunc('month', pg_temp.today() - 40)::date + ((6 - extract(isodow from date_trunc('month', pg_temp.today() - 40))::int + 7) % 7) + 7), 'morning',
  pg_temp.entries('present','present','present','present')::jsonb)$$, 'no marking on a 2nd Saturday', '23514');
select pg_temp.logout();
update public.school_settings set second_saturday_holiday = false, working_days = '{1,2,3,4,5,6}' where id = 1;
select pg_temp.login_as('00000000-0000-4000-f400-000000000001');
select pg_temp.throws($$select public.mark_attendance('3d000000-0000-4000-f400-000000000001', pg_temp.today() - (extract(isodow from pg_temp.today())::int % 7) - 7, 'morning', pg_temp.entries('present','present','present','present')::jsonb)$$, 'no marking on a Sunday', '23514');
select pg_temp.logout();
update public.school_settings set working_days = '{1,2,3,4,5,6,7}' where id = 1;

-- =====================================================================
-- Half-day math (today: s1 P/P, s2 late(corrected)/P, s3 P/P, s4 leave/absent; yesterday: s1 P/P, s2 A/A, s3 P/A, s4 A/A)
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f400-000000000001');
select pg_temp.ok((select day_status = 'present' from public.attendance_daily where student_id = '55000000-0000-4000-f400-000000000001' and att_date = pg_temp.today()), 'daily: present both sessions');
select pg_temp.ok((select day_status = 'present' from public.attendance_daily where student_id = '55000000-0000-4000-f400-000000000002' and att_date = pg_temp.today()), 'daily: late + present counts as present both sessions');
select pg_temp.ok((select day_status = 'absent' from public.attendance_daily where student_id = '55000000-0000-4000-f400-000000000004' and att_date = pg_temp.today()), 'daily: leave + absent = absent');
select pg_temp.ok((select day_status = 'morning_only' from public.attendance_daily where student_id = '55000000-0000-4000-f400-000000000003' and att_date = pg_temp.today() - 1), 'daily: morning only (half day)');
select pg_temp.ok((select pct = 100.0 and full_days = 2 and half_days = 0 from public.attendance_summary('55000000-0000-4000-f400-000000000001', pg_temp.today() - 1, pg_temp.today())), 'percentage: two full days = 100%');
select pg_temp.ok((select sessions_marked = 4 and sessions_attended = 3 and pct = 75.0 and full_days = 1 and half_days = 1 from public.attendance_summary('55000000-0000-4000-f400-000000000003', pg_temp.today() - 1, pg_temp.today())), 'percentage: a half day counts as half (3 of 4 sessions = 75%)');
select pg_temp.ok((select pct = 50.0 and absent_days = 1 and full_days = 1 from public.attendance_summary('55000000-0000-4000-f400-000000000002', pg_temp.today() - 1, pg_temp.today())), 'percentage: 2 of 4 sessions = 50%, one absent day');
select pg_temp.ok((select pct is null and sessions_marked = 0 from public.attendance_summary('55000000-0000-4000-f400-000000000001', pg_temp.today() - 30, pg_temp.today() - 20)), 'percentage: no marked sessions = no percentage');
select pg_temp.ok((select count(*) = 4 and max(pct) = 100.0 from public.section_attendance('3d000000-0000-4000-f400-000000000001', pg_temp.today() - 1, pg_temp.today())), 'section report: all four students listed');
select pg_temp.ok((select present = 3 and absent = 1 and on_leave = 0 and total = 4 and marked from public.daily_attendance_summary(pg_temp.today()) where section_id = '3d000000-0000-4000-f400-000000000001' and session = 'afternoon'), 'daily summary counts for a session');

-- =====================================================================
-- Scope: who sees which attendance
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f400-000000000005');   -- class teacher of A
select pg_temp.counts($$select count(*) from public.attendance_sessions where section_id = '3d000000-0000-4000-f400-000000000001' and att_date = pg_temp.today()$$, 2, 'class teacher: sees both sessions of their section');
select pg_temp.counts($$select count(*) from public.attendance_sessions where section_id = '3d000000-0000-4000-f400-000000000002'$$, 0, 'class teacher: sees nothing of other sections');
select pg_temp.ok((select count(*) >= 8 from public.student_attendance), 'class teacher: sees the student rows');
select pg_temp.affects($$update public.student_attendance set status = 'present'$$, 0, 'class teacher: read only (no update)');
select pg_temp.throws($$insert into public.attendance_sessions (academic_year_id, section_id, att_date, session, kind) values ('28000000-0000-4000-f400-000000000001', '3d000000-0000-4000-f400-000000000001', pg_temp.today() - 5, 'morning', 'regular')$$, 'direct insert of a session is refused', '42501');
select pg_temp.throws($$insert into public.student_attendance (session_id, student_id, status) select id, '55000000-0000-4000-f400-000000000001', 'present' from public.attendance_sessions limit 1$$, 'direct insert of attendance rows is refused', '42501');
select pg_temp.affects($$delete from public.attendance_sessions$$, 0, 'cannot delete sessions');
select pg_temp.login_as('00000000-0000-4000-f400-000000000006');   -- substitute
select pg_temp.counts($$select count(*) from public.attendance_sessions$$, 1, 'substitute: sees only the session assigned to them');
select pg_temp.login_as('00000000-0000-4000-f400-000000000004');   -- scheduled afternoon teacher
select pg_temp.counts($$select count(*) from public.attendance_sessions where session = 'afternoon'$$, 1, 'afternoon teacher: sees their session');
select pg_temp.counts($$select count(*) from public.attendance_sessions where session = 'morning'$$, 0, 'afternoon teacher: does not see the morning session');
select pg_temp.login_as('00000000-0000-4000-f400-000000000008');   -- unrelated
select pg_temp.counts($$select count(*) from public.attendance_sessions$$, 0, 'unrelated teacher: sees no sessions');
select pg_temp.counts($$select count(*) from public.student_attendance$$, 0, 'unrelated teacher: sees no attendance rows');
select pg_temp.throws($$select * from public.unmarked_sessions(pg_temp.today())$$, 'unrelated teacher: cannot list unmarked sessions', '42501');
select pg_temp.login_as(null);
select pg_temp.throws('select count(*) from public.attendance_sessions', 'anon: no access', '42501');

-- a revoked duty stops working at once
select pg_temp.login_as('00000000-0000-4000-f400-000000000001');
delete from public.staff_permissions where staff_id = '18000000-0000-4000-f400-000000000002' and duty = 'all_class_attendance';
select pg_temp.login_as('00000000-0000-4000-f400-000000000002');
select pg_temp.throws($$select public.mark_attendance('3d000000-0000-4000-f400-000000000001', pg_temp.today() - 1, 'morning', pg_temp.entries('present','present','present','present')::jsonb)$$, 'revoked duty: cannot mark any more', '42501');
select pg_temp.counts($$select count(*) from public.attendance_sessions where marked_by <> '18000000-0000-4000-f400-000000000002'$$, 0, 'revoked duty: sees only the sessions they marked themselves, nothing else');

-- =====================================================================
-- Leave: types, requests, decision flow, balances
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f400-000000000003');   -- t1
select pg_temp.lives($$insert into public.leave_requests (staff_id, leave_type_id, from_date, to_date, reason)
  values ('18000000-0000-4000-f400-000000000003', (select id from public.leave_types where name = 'Casual'), pg_temp.today(), pg_temp.today() + 1, 'Family function')$$, 'teacher: applies for leave for themselves');
select pg_temp.counts($$select count(*) from public.leave_requests where status = 'pending' and days = 2 and staff_id = '18000000-0000-4000-f400-000000000003'$$, 1, 'days are counted by the database');
select pg_temp.throws($$insert into public.leave_requests (staff_id, leave_type_id, from_date, to_date, reason)
  values ('18000000-0000-4000-f400-000000000004', (select id from public.leave_types where name = 'Casual'), pg_temp.today() + 10, pg_temp.today() + 11, 'For somebody else')$$, 'teacher cannot apply on behalf of another person', '42501');
select pg_temp.throws($$insert into public.leave_requests (staff_id, leave_type_id, from_date, to_date, reason, status)
  values ('18000000-0000-4000-f400-000000000003', (select id from public.leave_types where name = 'Casual'), pg_temp.today() + 10, pg_temp.today() + 11, 'Self approved', 'approved')$$, 'teacher cannot create an approved request', '42501');
select pg_temp.throws($$insert into public.leave_requests (staff_id, leave_type_id, from_date, to_date, reason)
  values ('18000000-0000-4000-f400-000000000003', (select id from public.leave_types where name = 'Sick'), pg_temp.today() + 1, pg_temp.today() + 2, 'Overlaps the first')$$, 'overlapping requests are refused', '23505');
select pg_temp.throws($$insert into public.leave_requests (staff_id, leave_type_id, from_date, to_date, reason)
  values ('18000000-0000-4000-f400-000000000003', (select id from public.leave_types where name = 'Sick'), pg_temp.today() + 20, pg_temp.today() + 19, 'Backwards')$$, 'end date before start date is refused', '23514');
select pg_temp.throws($$select public.decide_leave((select id from public.leave_requests where staff_id = '18000000-0000-4000-f400-000000000003' limit 1), true)$$, 'teacher cannot approve leave', '42501');
select pg_temp.throws($$select public.decide_leave((select id from public.leave_requests where staff_id = '18000000-0000-4000-f400-000000000003' limit 1), true)$$, 'teacher cannot approve even their own leave', '42501');
select pg_temp.affects($$update public.leave_requests set status = 'approved'$$, 0, 'no direct update of a request');
select pg_temp.login_as('00000000-0000-4000-f400-000000000004');   -- t2
select pg_temp.counts($$select count(*) from public.leave_requests$$, 0, 'another teacher cannot see someone else''s leave');
select pg_temp.counts($$select count(*) from public.leave_types where is_active$$, 3, 'every staff member sees the leave types');
select pg_temp.throws($$insert into public.leave_types (name) values ('Sneaky')$$, 'teacher cannot add a leave type', '42501');

select pg_temp.login_as('00000000-0000-4000-f400-000000000001');
select pg_temp.counts($$select count(*) from public.leave_requests where status = 'pending' and staff_id = '18000000-0000-4000-f400-000000000003'$$, 1, 'Admin sees the pending request');
select pg_temp.throws($$select public.decide_leave((select id from public.leave_requests where status = 'pending' and staff_id = '18000000-0000-4000-f400-000000000003'), false)$$, 'rejecting needs a note', '23514');
-- balance: Casual limited to 1 day by default -> a 2-day request cannot be approved
update public.leave_types set default_days = 1 where name = 'Casual';
select pg_temp.throws($$select public.decide_leave((select id from public.leave_requests where status = 'pending' and staff_id = '18000000-0000-4000-f400-000000000003'), true)$$, 'approval blocked when the balance is too low', '23514');
select pg_temp.lives($$insert into public.leave_balances (staff_id, leave_type_id, academic_year_id, allowance_days)
  values ('18000000-0000-4000-f400-000000000003', (select id from public.leave_types where name = 'Casual'), '28000000-0000-4000-f400-000000000001', 5)$$, 'Admin: sets a personal yearly allowance');
select pg_temp.lives($$select public.decide_leave((select id from public.leave_requests where status = 'pending' and staff_id = '18000000-0000-4000-f400-000000000003'), true, 'OK')$$, 'Admin: approves within the personal allowance');
select pg_temp.ok((select allowance = 5 and used = 2 and remaining = 3 from public.leave_balance('18000000-0000-4000-f400-000000000003', '28000000-0000-4000-f400-000000000001') where leave_type = 'Casual'), 'balance: allowance 5, used 2, remaining 3');
select pg_temp.ok((select allowance is null and remaining is null from public.leave_balance('18000000-0000-4000-f400-000000000003', '28000000-0000-4000-f400-000000000001') where leave_type = 'Sick'), 'balance: unlimited by default');
select pg_temp.throws($$select public.decide_leave((select id from public.leave_requests where staff_id = '18000000-0000-4000-f400-000000000003' limit 1), false, 'Too late')$$, 'a decided request cannot be decided again', '23514');
select pg_temp.counts($$select count(*) from public.leave_requests where status = 'approved' and decided_by = '18000000-0000-4000-f400-000000000001' and decision_note = 'OK'$$, 1, 'decision records who, when and the note');
select pg_temp.ok(exists (select 1 from public.audit_logs where table_name = 'leave_requests' and action = 'update' and new_data ->> 'status' = 'approved'), 'leave decisions are audit-logged');
-- reject another one + cancel flow
select pg_temp.login_as('00000000-0000-4000-f400-000000000004');
select pg_temp.lives($$insert into public.leave_requests (staff_id, leave_type_id, from_date, to_date, reason)
  values ('18000000-0000-4000-f400-000000000004', (select id from public.leave_types where name = 'Sick'), pg_temp.today() + 30, pg_temp.today() + 30, 'Dentist')$$, 'second teacher applies');
select pg_temp.lives($$select public.cancel_leave((select id from public.leave_requests where reason = 'Dentist'))$$, 'applicant cancels their pending request');
select pg_temp.throws($$select public.cancel_leave((select id from public.leave_requests where reason = 'Dentist'))$$, 'a cancelled request cannot be cancelled again', '23514');
select pg_temp.login_as('00000000-0000-4000-f400-000000000003');
select pg_temp.throws($$select public.cancel_leave((select id from public.leave_requests where reason = 'Family function'))$$, 'an approved request cannot be cancelled', '23514');
select pg_temp.login_as('00000000-0000-4000-f400-000000000004');
select pg_temp.lives($$insert into public.leave_requests (staff_id, leave_type_id, from_date, to_date, reason)
  values ('18000000-0000-4000-f400-000000000004', (select id from public.leave_types where name = 'Other'), pg_temp.today() + 40, pg_temp.today() + 40, 'Exam duty')$$, 'second teacher applies again');
select pg_temp.login_as('00000000-0000-4000-f400-000000000003');
select pg_temp.throws($$select public.cancel_leave((select id from public.leave_requests where reason = 'Exam duty'))$$, 'cannot cancel someone else''s request', '42501');
select pg_temp.login_as('00000000-0000-4000-f400-000000000001');
select pg_temp.lives($$select public.decide_leave((select id from public.leave_requests where reason = 'Exam duty'), false, 'Not possible that day')$$, 'Admin: rejects with a note');

-- approved leave -> affected periods on the Substitutions screen
select pg_temp.login_as('00000000-0000-4000-f400-000000000009');   -- timetable_edit duty
select pg_temp.ok((select count(*) >= 1 and bool_or(staff_name like 'At One%' and period_no = 1) from public.approved_leave_periods(pg_temp.today())), 'approved leave shows the periods to cover (timetable editor)');
select pg_temp.ok((select covered from public.approved_leave_periods(pg_temp.today()) where period_no = 1 and staff_name like 'At One%'), 'a period already covered by a substitution is marked covered');
select pg_temp.login_as('00000000-0000-4000-f400-000000000008');
select pg_temp.throws($$select * from public.approved_leave_periods(pg_temp.today())$$, 'normal teacher cannot list leave periods', '42501');

-- =====================================================================
-- Staff attendance
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f400-000000000001');
select pg_temp.ok((select status = 'on_leave' and prefilled from public.staff_attendance_sheet(pg_temp.today()) where employee_code = 'AT-T1'), 'sheet: approved leave pre-fills "on leave"');
select pg_temp.ok((select status is null and not prefilled from public.staff_attendance_sheet(pg_temp.today()) where employee_code = 'AT-T2'), 'sheet: others start empty');
select pg_temp.lives($$select public.mark_staff_attendance(pg_temp.today(), jsonb_build_array(
  jsonb_build_object('staff_id', '18000000-0000-4000-f400-000000000003', 'status', 'on_leave'),
  jsonb_build_object('staff_id', '18000000-0000-4000-f400-000000000004', 'status', 'late', 'note', 'Bus'),
  jsonb_build_object('staff_id', '18000000-0000-4000-f400-000000000005', 'status', 'present')))$$, 'Admin: marks staff attendance');
select pg_temp.lives($$select public.mark_staff_attendance(pg_temp.today(), jsonb_build_array(jsonb_build_object('staff_id', '18000000-0000-4000-f400-000000000004', 'status', 'present')))$$, 'Admin: corrects one person');
select pg_temp.counts($$select count(*) from public.staff_attendance where att_date = pg_temp.today()$$, 3, 'one row per person and date (no duplicates)');
select pg_temp.throws($$select public.mark_staff_attendance(pg_temp.today() + 1, '[]'::jsonb)$$, 'no future staff attendance', '23514');
select pg_temp.throws($$select public.mark_staff_attendance(pg_temp.today() - 3, jsonb_build_array(jsonb_build_object('staff_id', '18000000-0000-4000-f400-000000000004', 'status', 'present')))$$, 'no staff attendance on a holiday', '23514');
select pg_temp.throws($$select public.mark_staff_attendance(pg_temp.today(), jsonb_build_array(jsonb_build_object('staff_id', '18000000-0000-4000-f400-000000000004', 'status', 'maybe')))$$, 'invalid staff status refused', '23514');
select pg_temp.ok((select present = 1 and on_leave = 0 from public.staff_attendance_month(pg_temp.today()) where full_name like 'At Two%'), 'monthly report: counts per person');
select pg_temp.ok((select days = 2 and leave_type = 'Casual' from public.leave_taken(pg_temp.today() - 5, pg_temp.today() + 5) where full_name like 'At One%'), 'leave taken report: approved days per type');
select pg_temp.login_as('00000000-0000-4000-f400-000000000004');   -- t2
select pg_temp.counts($$select count(*) from public.staff_attendance$$, 1, 'teacher: sees only their own staff attendance record');
select pg_temp.counts($$select count(*) from public.staff_attendance where staff_id <> '18000000-0000-4000-f400-000000000004'$$, 0, 'teacher: cannot see colleagues'' records');
select pg_temp.throws($$select public.mark_staff_attendance(pg_temp.today(), jsonb_build_array(jsonb_build_object('staff_id', '18000000-0000-4000-f400-000000000004', 'status', 'present')))$$, 'teacher cannot mark staff attendance', '42501');
select pg_temp.throws($$select * from public.staff_attendance_sheet(pg_temp.today())$$, 'teacher cannot open the staff sheet', '42501');
select pg_temp.throws($$insert into public.staff_attendance (staff_id, att_date, status) values ('18000000-0000-4000-f400-000000000004', pg_temp.today() - 6, 'present')$$, 'direct insert refused', '42501');
select pg_temp.ok((select count(*) = 1 from public.staff_attendance_month(pg_temp.today())), 'monthly report for a teacher lists only themselves');
select pg_temp.ok((select count(*) = 0 from public.leave_taken(pg_temp.today() - 5, pg_temp.today() + 5)), 'leave-taken report for a teacher shows only their own leave');

-- low-attendance threshold is an Admin setting
select pg_temp.ok((select low_attendance_pct = 75 from public.school_settings where id = 1), 'low-attendance threshold defaults to 75%');
