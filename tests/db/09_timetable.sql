-- Timetable: rules, session markers, counts and permissions. Rolled back.
update public.school_settings set mediums = '{English,Telugu}' where id = 1;

create function pg_temp.mon() returns date language sql as $$ select date_trunc('week', date '2085-06-10')::date $$;
-- 2nd Saturday of June 2085
create function pg_temp.sat2() returns date language sql as $$
  select (date_trunc('month', date '2085-06-01')::date + ((6 - extract(isodow from date_trunc('month', date '2085-06-01'))::int + 7) % 7) + 7)
$$;

select pg_temp.fixture_user('00000000-0000-4000-f300-000000000001', 'admin@tt.test');
select pg_temp.fixture_user('00000000-0000-4000-f300-000000000002', 'editor@tt.test');
select pg_temp.fixture_user('00000000-0000-4000-f300-000000000003', 't1@tt.test');
select pg_temp.fixture_user('00000000-0000-4000-f300-000000000004', 't2@tt.test');
select pg_temp.fixture_user('00000000-0000-4000-f300-000000000005', 't3@tt.test');
select pg_temp.fixture_user('00000000-0000-4000-f300-000000000006', 't4@tt.test');
insert into public.staff (id, user_id, app_role, employee_code, full_name) values
  ('17000000-0000-4000-f300-000000000001', '00000000-0000-4000-f300-000000000001', 'admin',   'TT-ADM', 'Tt Admin'),
  ('17000000-0000-4000-f300-000000000002', '00000000-0000-4000-f300-000000000002', 'teacher', 'TT-EDT', 'Tt Editor'),
  ('17000000-0000-4000-f300-000000000003', '00000000-0000-4000-f300-000000000003', 'teacher', 'TT-T1',  'Tt One'),
  ('17000000-0000-4000-f300-000000000004', '00000000-0000-4000-f300-000000000004', 'teacher', 'TT-T2',  'Tt Two'),
  ('17000000-0000-4000-f300-000000000005', '00000000-0000-4000-f300-000000000005', 'teacher', 'TT-T3',  'Tt Three (class teacher A)'),
  ('17000000-0000-4000-f300-000000000006', '00000000-0000-4000-f300-000000000006', 'teacher', 'TT-T4',  'Tt Four (duty later revoked)');
insert into public.staff_permissions (staff_id, duty) values
  ('17000000-0000-4000-f300-000000000002', 'timetable_edit'),
  ('17000000-0000-4000-f300-000000000006', 'timetable_edit');

insert into public.academic_years (id, name, start_date, end_date) values ('27000000-0000-4000-f300-000000000001', 'TT-2085-86', '2085-04-01', '2086-03-31');
insert into public.classes (id, name, sort_order) values ('3c000000-0000-4000-f300-000000000001', 'TT C1', 961);
insert into public.sections (id, academic_year_id, class_id, name, class_teacher_id) values
  ('3d000000-0000-4000-f300-000000000001', '27000000-0000-4000-f300-000000000001', '3c000000-0000-4000-f300-000000000001', 'A', '17000000-0000-4000-f300-000000000005'),
  ('3d000000-0000-4000-f300-000000000002', '27000000-0000-4000-f300-000000000001', '3c000000-0000-4000-f300-000000000001', 'B', null),
  ('3d000000-0000-4000-f300-000000000003', '27000000-0000-4000-f300-000000000001', '3c000000-0000-4000-f300-000000000001', 'C', null);
insert into public.subjects (id, name, code) values
  ('5b000000-0000-4000-f300-000000000001', 'TT Maths', 'TTM'), ('5b000000-0000-4000-f300-000000000002', 'TT English', 'TTE');
insert into public.teacher_assignments (staff_id, section_id, subject_id, periods_per_week) values
  ('17000000-0000-4000-f300-000000000003', '3d000000-0000-4000-f300-000000000001', '5b000000-0000-4000-f300-000000000001', 3),  -- t1 A Maths (target 3)
  ('17000000-0000-4000-f300-000000000004', '3d000000-0000-4000-f300-000000000001', '5b000000-0000-4000-f300-000000000002', 2),  -- t2 A English
  ('17000000-0000-4000-f300-000000000003', '3d000000-0000-4000-f300-000000000002', '5b000000-0000-4000-f300-000000000001', 1),  -- t1 B Maths (target 1)
  ('17000000-0000-4000-f300-000000000004', '3d000000-0000-4000-f300-000000000002', '5b000000-0000-4000-f300-000000000002', null); -- t2 B English (no target)
insert into public.holidays (academic_year_id, date, name) select '27000000-0000-4000-f300-000000000001', pg_temp.mon() + 2, 'TT Holiday';

-- =====================================================================
-- Defaults that ship with the migration
-- =====================================================================
select pg_temp.counts($$select count(*) from public.bell_schedules where is_default$$, 1, 'exactly one default bell schedule');
select pg_temp.counts($$select count(*) from public.bell_periods p join public.bell_schedules b on b.id = p.schedule_id where b.is_default and p.kind = 'teaching'$$, 8, 'default schedule: 8 teaching periods');
select pg_temp.counts($$select count(*) from public.bell_periods p join public.bell_schedules b on b.id = p.schedule_id where b.is_default and p.kind in ('break', 'lunch')$$, 3, 'default schedule: two short breaks and lunch');
select pg_temp.ok((select p.start_time = '12:40' and p.end_time = '13:20' from public.bell_periods p join public.bell_schedules b on b.id = p.schedule_id where b.is_default and p.period_no = 5), 'default P5 is 12:40-13:20 (after lunch)');

-- =====================================================================
-- Admin: rules
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f300-000000000001');
-- Monday: A p1 Maths t1, A p2 English t2, A p3 Games, B p2 English t2?? (t2 busy at A p2 -> must clash)
select pg_temp.lives($$insert into public.timetable_entries (section_id, weekday, period_no, subject_id, teacher_id) values
  ('3d000000-0000-4000-f300-000000000001', 1, 1, '5b000000-0000-4000-f300-000000000001', '17000000-0000-4000-f300-000000000003')$$, 'admin: schedules Maths (t1) in A, Monday P1');
select pg_temp.lives($$insert into public.timetable_entries (section_id, weekday, period_no, subject_id, teacher_id) values
  ('3d000000-0000-4000-f300-000000000001', 1, 2, '5b000000-0000-4000-f300-000000000002', '17000000-0000-4000-f300-000000000004')$$, 'admin: schedules English (t2) in A, Monday P2');
select pg_temp.lives($$insert into public.timetable_entries (section_id, weekday, period_no, activity) values ('3d000000-0000-4000-f300-000000000001', 1, 3, 'Games')$$, 'a Games period needs no teacher');
select pg_temp.counts($$select count(*) from public.timetable_entries where academic_year_id = '27000000-0000-4000-f300-000000000001'$$, 3, 'academic year is filled in from the section');
select pg_temp.throws($$insert into public.timetable_entries (section_id, weekday, period_no, activity) values ('3d000000-0000-4000-f300-000000000001', 1, 1, 'Library')$$, 'a section has one entry per weekday and period', '23505');
select pg_temp.throws($$insert into public.timetable_entries (section_id, weekday, period_no, subject_id, teacher_id) values
  ('3d000000-0000-4000-f300-000000000002', 1, 1, '5b000000-0000-4000-f300-000000000001', '17000000-0000-4000-f300-000000000003')$$, 'a teacher cannot be in two sections in the same weekday and period', '23505');
select pg_temp.throws($$insert into public.timetable_entries (section_id, weekday, period_no, subject_id, teacher_id) values
  ('3d000000-0000-4000-f300-000000000002', 1, 2, '5b000000-0000-4000-f300-000000000002', '17000000-0000-4000-f300-000000000004')$$, 'second double-booking case (English teacher t2, P2)', '23505');
select pg_temp.throws($$insert into public.timetable_entries (section_id, weekday, period_no, subject_id, teacher_id) values
  ('3d000000-0000-4000-f300-000000000001', 1, 4, '5b000000-0000-4000-f300-000000000002', '17000000-0000-4000-f300-000000000003')$$, 'a teacher who does not teach that subject in that section is rejected', '23503');
select pg_temp.throws($$insert into public.timetable_entries (section_id, weekday, period_no, subject_id, teacher_id) values
  ('3d000000-0000-4000-f300-000000000001', 1, 4, '5b000000-0000-4000-f300-000000000001', '17000000-0000-4000-f300-000000000004')$$, 'wrong teacher for the right subject is rejected', '23503');
select pg_temp.throws($$insert into public.timetable_entries (section_id, weekday, period_no, subject_id) values
  ('3d000000-0000-4000-f300-000000000001', 1, 4, '5b000000-0000-4000-f300-000000000001')$$, 'a subject period without a teacher is rejected', '23514');
select pg_temp.throws($$insert into public.timetable_entries (section_id, weekday, period_no, subject_id, teacher_id, activity) values
  ('3d000000-0000-4000-f300-000000000001', 1, 4, '5b000000-0000-4000-f300-000000000001', '17000000-0000-4000-f300-000000000003', 'Games')$$, 'an entry is a subject OR an activity, not both', '23514');
select pg_temp.throws($$insert into public.timetable_entries (section_id, weekday, period_no, activity) values ('3d000000-0000-4000-f300-000000000001', 1, 9, 'Free')$$, 'period 9 does not exist in the schedule', '23514');
select pg_temp.throws($$insert into public.timetable_entries (section_id, weekday, period_no, activity) values ('3d000000-0000-4000-f300-000000000001', 7, 1, 'Free')$$, 'Sunday is not a working day', '23514');
select pg_temp.lives($$insert into public.timetable_entries (section_id, weekday, period_no, subject_id, teacher_id) values
  ('3d000000-0000-4000-f300-000000000002', 1, 4, '5b000000-0000-4000-f300-000000000001', '17000000-0000-4000-f300-000000000003')$$, 'the same teacher in a different period is fine');
select pg_temp.lives($$insert into public.timetable_entries (section_id, weekday, period_no, subject_id, teacher_id) values
  ('3d000000-0000-4000-f300-000000000001', 2, 1, '5b000000-0000-4000-f300-000000000001', '17000000-0000-4000-f300-000000000003')$$, 'the same teacher the next day is fine');

-- =====================================================================
-- Weekly counts vs the assignment's periods_per_week
-- =====================================================================
select pg_temp.ok((select scheduled = 2 and target = 3 and difference = -1 and status = 'under' from public.timetable_period_counts where section_id = '3d000000-0000-4000-f300-000000000001' and staff_id = '17000000-0000-4000-f300-000000000003'), 'counts: 2 of 3 scheduled = under by 1');
select pg_temp.ok((select scheduled = 1 and difference = 0 and status = 'ok' from public.timetable_period_counts where section_id = '3d000000-0000-4000-f300-000000000002' and staff_id = '17000000-0000-4000-f300-000000000003'), 'counts: exact target = ok');
select pg_temp.ok((select status = 'no_target' and difference is null from public.timetable_period_counts where section_id = '3d000000-0000-4000-f300-000000000002' and staff_id = '17000000-0000-4000-f300-000000000004'), 'counts: no target set');
insert into public.timetable_entries (section_id, weekday, period_no, subject_id, teacher_id) values
  ('3d000000-0000-4000-f300-000000000002', 2, 2, '5b000000-0000-4000-f300-000000000001', '17000000-0000-4000-f300-000000000003');
select pg_temp.ok((select scheduled = 2 and difference = 1 and status = 'over' from public.timetable_period_counts where section_id = '3d000000-0000-4000-f300-000000000002' and staff_id = '17000000-0000-4000-f300-000000000003'), 'counts: over target by 1');

-- =====================================================================
-- Substitutions (Monday of the test week; P1 = t1 in A)
-- =====================================================================
select pg_temp.lives($$insert into public.timetable_substitutions (sub_date, section_id, period_no, original_teacher_id, substitute_teacher_id, reason)
  values (pg_temp.mon(), '3d000000-0000-4000-f300-000000000001', 1, '17000000-0000-4000-f300-000000000003', '17000000-0000-4000-f300-000000000005', 'Sick leave')$$, 'admin: substitutes t1 with t3 on Monday P1');
select pg_temp.counts($$select count(*) from public.timetable_substitutions where entered_by = '17000000-0000-4000-f300-000000000001'$$, 1, 'substitution records who entered it');
select pg_temp.throws($$insert into public.timetable_substitutions (sub_date, section_id, period_no, original_teacher_id, substitute_teacher_id)
  values (pg_temp.mon(), '3d000000-0000-4000-f300-000000000001', 1, '17000000-0000-4000-f300-000000000003', '17000000-0000-4000-f300-000000000004')$$, 'one substitution per section and period', '23505');
-- t2 also teaches B in Monday P1 (t2 is not in A P1 any more than t1 is in B P1)
insert into public.timetable_entries (section_id, weekday, period_no, subject_id, teacher_id) values
  ('3d000000-0000-4000-f300-000000000002', 1, 1, '5b000000-0000-4000-f300-000000000002', '17000000-0000-4000-f300-000000000004');
select pg_temp.throws($$insert into public.timetable_substitutions (sub_date, section_id, period_no, original_teacher_id, substitute_teacher_id)
  values (pg_temp.mon(), '3d000000-0000-4000-f300-000000000002', 1, '17000000-0000-4000-f300-000000000004', '17000000-0000-4000-f300-000000000005')$$, 'a teacher cannot cover two classes in the same period', '23505');
-- t1 is relieved of A P1 on Monday, so t1 is free to cover B P1 that day
select pg_temp.lives($$insert into public.timetable_substitutions (sub_date, section_id, period_no, original_teacher_id, substitute_teacher_id)
  values (pg_temp.mon(), '3d000000-0000-4000-f300-000000000002', 1, '17000000-0000-4000-f300-000000000004', '17000000-0000-4000-f300-000000000003')$$, 'a teacher relieved of their own class that period is free to cover another');
-- but the next Monday t1 is NOT relieved: t1 teaches A P1 -> cannot cover B P1
select pg_temp.throws($$insert into public.timetable_substitutions (sub_date, section_id, period_no, original_teacher_id, substitute_teacher_id)
  values (pg_temp.mon() + 7, '3d000000-0000-4000-f300-000000000002', 1, '17000000-0000-4000-f300-000000000004', '17000000-0000-4000-f300-000000000003')$$, 'a teacher busy with their own class that day cannot be the substitute', '23505');
select pg_temp.throws($$insert into public.timetable_substitutions (sub_date, section_id, period_no, original_teacher_id, substitute_teacher_id)
  values (pg_temp.mon() + 2, '3d000000-0000-4000-f300-000000000001', 1, '17000000-0000-4000-f300-000000000003', '17000000-0000-4000-f300-000000000004')$$, 'no substitution on a holiday', '23514');
select pg_temp.throws($$insert into public.timetable_substitutions (sub_date, section_id, period_no, original_teacher_id, substitute_teacher_id)
  values (pg_temp.mon(), '3d000000-0000-4000-f300-000000000001', 3, '17000000-0000-4000-f300-000000000003', '17000000-0000-4000-f300-000000000004')$$, 'no substitution where no teacher is scheduled (Games)', '23514');
select pg_temp.throws($$insert into public.timetable_substitutions (sub_date, section_id, period_no, original_teacher_id, substitute_teacher_id)
  values (pg_temp.mon() + 7, '3d000000-0000-4000-f300-000000000001', 1, '17000000-0000-4000-f300-000000000003', '17000000-0000-4000-f300-000000000003')$$, 'the substitute must be a different teacher', '23514');
-- entries vs upcoming substitutions
select pg_temp.throws($$delete from public.timetable_entries where section_id = '3d000000-0000-4000-f300-000000000001' and weekday = 1 and period_no = 1$$, 'cannot remove a period that has upcoming substitutions', '23514');
-- t3 substitutes Monday P1 (A): a permanent entry for t3 at Monday P1 elsewhere must be refused
select pg_temp.lives($$insert into public.timetable_substitutions (sub_date, section_id, period_no, original_teacher_id, substitute_teacher_id)
  values (pg_temp.mon() + 14, '3d000000-0000-4000-f300-000000000001', 1, '17000000-0000-4000-f300-000000000003', '17000000-0000-4000-f300-000000000005')$$, 'second substitution (two weeks later)');
insert into public.teacher_assignments (staff_id, section_id, subject_id) values
  ('17000000-0000-4000-f300-000000000005', '3d000000-0000-4000-f300-000000000002', '5b000000-0000-4000-f300-000000000002');
select pg_temp.throws($$insert into public.timetable_entries (section_id, weekday, period_no, subject_id, teacher_id) values
  ('3d000000-0000-4000-f300-000000000002', 1, 1, '5b000000-0000-4000-f300-000000000002', '17000000-0000-4000-f300-000000000005')$$, 'a new entry that collides with an upcoming substitution is refused', '23505');

-- =====================================================================
-- Session markers
-- =====================================================================
-- Monday P5 (afternoon) in A: add English t2 so we can see scheduled vs fallback
insert into public.timetable_entries (section_id, weekday, period_no, subject_id, teacher_id) values
  ('3d000000-0000-4000-f300-000000000001', 2, 5, '5b000000-0000-4000-f300-000000000002', '17000000-0000-4000-f300-000000000004');
-- Monday (substitution on P1): morning = substitute t3, afternoon (P5, no entry) = class teacher t3
select pg_temp.ok((select staff_id = '17000000-0000-4000-f300-000000000005' and source = 'substitute' and period_no = 1 from public.session_markers('3d000000-0000-4000-f300-000000000001', pg_temp.mon()) where session = 'morning'), 'marker: morning on a substitution day = the substitute');
select pg_temp.ok((select staff_id = '17000000-0000-4000-f300-000000000005' and source = 'class_teacher' and period_no = 5 from public.session_markers('3d000000-0000-4000-f300-000000000001', pg_temp.mon()) where session = 'afternoon'), 'marker: afternoon with no entry falls back to the class teacher');
-- Next Monday: no substitution -> scheduled t1 for the morning
select pg_temp.ok((select staff_id = '17000000-0000-4000-f300-000000000003' and source = 'scheduled' from public.session_markers('3d000000-0000-4000-f300-000000000001', pg_temp.mon() + 7) where session = 'morning'), 'marker: normal day morning = scheduled P1 teacher');
-- Tuesday: afternoon P5 scheduled t2
select pg_temp.ok((select staff_id = '17000000-0000-4000-f300-000000000004' and source = 'scheduled' and period_no = 5 from public.session_markers('3d000000-0000-4000-f300-000000000001', pg_temp.mon() + 1) where session = 'afternoon'), 'marker: afternoon = first period after lunch (P5), scheduled teacher');
-- Section B has no class teacher: no entry at Tuesday P1 -> source none, staff null
select pg_temp.ok((select staff_id is null and source = 'none' from public.session_markers('3d000000-0000-4000-f300-000000000002', pg_temp.mon() + 3) where session = 'morning'), 'marker: no entry and no class teacher = nobody (source none)');
-- Games with no teacher in P1 -> class teacher
insert into public.timetable_entries (section_id, weekday, period_no, activity) values ('3d000000-0000-4000-f300-000000000001', 4, 1, 'Games');
select pg_temp.ok((select staff_id = '17000000-0000-4000-f300-000000000005' and source = 'class_teacher' from public.session_markers('3d000000-0000-4000-f300-000000000001', pg_temp.mon() + 3) where session = 'morning'), 'marker: a teacherless first period falls back to the class teacher');
-- Holiday (Wednesday), Sunday, 2nd Saturday, outside the year
select pg_temp.counts($$select count(*) from public.session_markers('3d000000-0000-4000-f300-000000000001', pg_temp.mon() + 2)$$, 0, 'marker: nothing on a holiday');
select pg_temp.counts($$select count(*) from public.session_markers('3d000000-0000-4000-f300-000000000001', pg_temp.mon() + 6)$$, 0, 'marker: nothing on a Sunday');
select pg_temp.counts($$select count(*) from public.session_markers('3d000000-0000-4000-f300-000000000001', pg_temp.sat2())$$, 0, 'marker: nothing on the 2nd Saturday');
select pg_temp.counts($$select count(*) from public.session_markers('3d000000-0000-4000-f300-000000000001', date '2087-01-05')$$, 0, 'marker: nothing outside the academic year');
select pg_temp.counts($$select count(*) from public.session_markers('3d000000-0000-4000-f300-000000000001', pg_temp.sat2() + 7)$$, 2, 'marker: a normal Saturday has both sessions (same schedule)');

-- A class on a half-day Saturday schedule (no lunch): morning only
insert into public.bell_schedules (id, name) values ('b5000000-0000-4000-f300-000000000001', 'TT Half day');
insert into public.bell_periods (schedule_id, seq, kind, period_no, label, start_time, end_time) values
  ('b5000000-0000-4000-f300-000000000001', 1, 'teaching', 1, 'P1', '09:00', '09:40'),
  ('b5000000-0000-4000-f300-000000000001', 2, 'teaching', 2, 'P2', '09:40', '10:20'),
  ('b5000000-0000-4000-f300-000000000001', 3, 'teaching', 3, 'P3', '10:20', '11:00');
insert into public.class_bell_schedules (class_id, weekday, schedule_id) values ('3c000000-0000-4000-f300-000000000001', 6, 'b5000000-0000-4000-f300-000000000001');
select pg_temp.counts($$select count(*) from public.session_markers('3d000000-0000-4000-f300-000000000001', pg_temp.sat2() + 7)$$, 1, 'marker: half-day Saturday schedule (no lunch) has only the morning session');
select pg_temp.throws($$insert into public.timetable_entries (section_id, weekday, period_no, activity) values ('3d000000-0000-4000-f300-000000000001', 6, 4, 'Free')$$, 'entries follow the class''s schedule for that weekday (period 4 not in half day)', '23514');
select pg_temp.lives($$insert into public.timetable_entries (section_id, weekday, period_no, activity) values ('3d000000-0000-4000-f300-000000000001', 6, 3, 'Free')$$, 'period 3 exists on the half day');

-- =====================================================================
-- Bell schedule rules (checked at commit -> force the checks now)
-- =====================================================================
select pg_temp.throws($$insert into public.bell_periods (schedule_id, seq, kind, label, start_time, end_time) values ('b5000000-0000-4000-f300-000000000001', 4, 'break', 'Break', '10:50', '11:10'); set constraints all immediate$$, 'overlapping bell times are refused', '23P01');
select pg_temp.throws($$delete from public.bell_periods where schedule_id = 'b5000000-0000-4000-f300-000000000001' and period_no = 2; set constraints all immediate$$, 'teaching periods cannot be numbered with a gap', '23514');
select pg_temp.throws($$delete from public.bell_schedules where is_default$$, 'the default schedule cannot be deleted', '23514');
select pg_temp.lives($$update public.bell_schedules set is_default = true where id = 'b5000000-0000-4000-f300-000000000001'$$, 'another schedule can become the default');
select pg_temp.counts($$select count(*) from public.bell_schedules where is_default$$, 1, 'still exactly one default');
select pg_temp.lives($$update public.bell_schedules set is_default = true where name = 'Regular day'$$, 'the regular schedule is the default again');
select pg_temp.throws($$delete from public.bell_schedules where id = 'b5000000-0000-4000-f300-000000000001'$$, 'a schedule used by a class cannot be deleted', '23503');

-- audit
select pg_temp.ok(exists (select 1 from public.audit_logs where table_name = 'timetable_entries' and action ilike '%insert%'), 'entries are audit-logged');
select pg_temp.ok(exists (select 1 from public.audit_logs where table_name = 'timetable_substitutions'), 'substitutions are audit-logged');
select pg_temp.ok(exists (select 1 from public.audit_logs where table_name = 'bell_schedules'), 'bell schedule changes are audit-logged');

-- =====================================================================
-- Permissions
-- =====================================================================
select pg_temp.login_as('00000000-0000-4000-f300-000000000002');   -- timetable_edit duty
select pg_temp.lives($$insert into public.timetable_entries (section_id, weekday, period_no, activity) values ('3d000000-0000-4000-f300-000000000002', 3, 6, 'Library')$$, 'duty teacher: creates entries');
select pg_temp.lives($$update public.timetable_entries set room = 'Lab' where section_id = '3d000000-0000-4000-f300-000000000002' and weekday = 3 and period_no = 6$$, 'duty teacher: edits entries');
select pg_temp.lives($$insert into public.bell_schedules (name) values ('TT Editor schedule')$$, 'duty teacher: creates bell schedules');
select pg_temp.lives($$insert into public.timetable_substitutions (sub_date, section_id, period_no, original_teacher_id, substitute_teacher_id)
  values (pg_temp.mon() + 21, '3d000000-0000-4000-f300-000000000001', 1, '17000000-0000-4000-f300-000000000003', '17000000-0000-4000-f300-000000000005')$$, 'duty teacher: creates substitutions');
select pg_temp.ok((select count(*) > 5 from public.timetable_entries), 'duty teacher: sees every timetable entry');
select pg_temp.ok((select count(*) >= 1 from public.free_teachers(pg_temp.mon(), 6)), 'duty teacher: gets the list of free teachers');
select pg_temp.ok(not exists (select 1 from public.free_teachers(pg_temp.mon(), 1) where employee_code = 'TT-T3'), 'free list leaves out a teacher already covering that period');

select pg_temp.login_as('00000000-0000-4000-f300-000000000003');   -- t1: plain teacher with periods
select pg_temp.ok((select count(*) > 0 and bool_and(teacher_id = '17000000-0000-4000-f300-000000000003') from public.timetable_entries), 'teacher: sees only their own periods');
select pg_temp.counts($$select count(*) from public.timetable_entries where teacher_id = '17000000-0000-4000-f300-000000000004'$$, 0, 'teacher: cannot see another teacher''s periods');
select pg_temp.counts($$select count(*) from public.timetable_entries where activity is not null$$, 0, 'teacher: cannot see teacherless activity periods');
select pg_temp.throws($$insert into public.timetable_entries (section_id, weekday, period_no, activity) values ('3d000000-0000-4000-f300-000000000001', 3, 8, 'Free')$$, 'teacher: cannot create an entry', '42501');
select pg_temp.affects($$update public.timetable_entries set room = 'X'$$, 0, 'teacher: cannot edit entries');
select pg_temp.affects($$delete from public.timetable_entries$$, 0, 'teacher: cannot delete entries');
select pg_temp.throws($$insert into public.bell_schedules (name) values ('TT Sneaky')$$, 'teacher: cannot create a bell schedule', '42501');
select pg_temp.affects($$update public.bell_periods set end_time = end_time + interval '1 minute'$$, 0, 'teacher: cannot change bell times');
select pg_temp.ok((select count(*) >= 8 from public.bell_periods), 'teacher: can read bell times');
select pg_temp.throws($$insert into public.timetable_substitutions (sub_date, section_id, period_no, original_teacher_id, substitute_teacher_id)
  values (pg_temp.mon() + 28, '3d000000-0000-4000-f300-000000000001', 1, '17000000-0000-4000-f300-000000000003', '17000000-0000-4000-f300-000000000004')$$, 'teacher: cannot create a substitution', '42501');
select pg_temp.ok((select count(*) > 0 and bool_and(original_teacher_id = '17000000-0000-4000-f300-000000000003' or substitute_teacher_id = '17000000-0000-4000-f300-000000000003') from public.timetable_substitutions), 'teacher: sees only substitutions that involve them');
select pg_temp.throws($$select * from public.free_teachers(pg_temp.mon(), 1)$$, 'teacher: cannot ask for the free-teacher list', '42501');
select pg_temp.ok((select count(*) > 0 and bool_and(kind in ('regular', 'substituted_out', 'substitute_in')) from public.my_week(pg_temp.mon())), 'teacher: my_week returns their own week');
select pg_temp.ok((select kind = 'substituted_out' and other_name = 'Tt Three (class teacher A)' from public.my_week(pg_temp.mon()) where weekday = 1 and period_no = 1 and kind = 'substituted_out'), 'teacher: my_week shows a period they were relieved of');
select pg_temp.ok((select count(*) from public.my_week(pg_temp.mon()) where kind = 'substitute_in') = 1, 'teacher: my_week shows periods they are covering');
select pg_temp.ok((select count(*) > 0 from public.session_markers('3d000000-0000-4000-f300-000000000001', pg_temp.mon() + 7)), 'teacher: can ask who marks a section they teach');
select pg_temp.counts($$select count(*) from public.session_markers('3d000000-0000-4000-f300-000000000003', pg_temp.mon() + 7)$$, 0, 'teacher: no marker info for a section they do not teach');

select pg_temp.login_as('00000000-0000-4000-f300-000000000005');   -- t3: class teacher, covers one period
select pg_temp.ok((select count(*) = 1 from public.my_week(pg_temp.mon()) where kind = 'substitute_in' and weekday = 1 and period_no = 1), 't3: sees the period they cover');
select pg_temp.counts($$select count(*) from public.timetable_entries$$, 0, 't3: scheduled in no period of their own, so sees no entries');
select pg_temp.ok((select count(*) = 1 from public.session_markers('3d000000-0000-4000-f300-000000000001', pg_temp.mon()) where session = 'morning'), 't3: the substitute can see the marker for that day');

select pg_temp.login_as(null);
select pg_temp.throws('select count(*) from public.timetable_entries', 'anon: no access to entries', '42501');
select pg_temp.throws('select count(*) from public.bell_periods', 'anon: no access to bell times', '42501');

-- revoked duty
select pg_temp.login_as('00000000-0000-4000-f300-000000000006');
select pg_temp.lives($$insert into public.timetable_entries (section_id, weekday, period_no, activity) values ('3d000000-0000-4000-f300-000000000002', 4, 8, 'Free')$$, 't4: duty held -> can create entries');
select pg_temp.login_as('00000000-0000-4000-f300-000000000001');
delete from public.staff_permissions where staff_id = '17000000-0000-4000-f300-000000000006' and duty = 'timetable_edit';
select pg_temp.login_as('00000000-0000-4000-f300-000000000006');
select pg_temp.throws($$insert into public.timetable_entries (section_id, weekday, period_no, activity) values ('3d000000-0000-4000-f300-000000000002', 4, 7, 'Free')$$, 'revoked duty: cannot create entries any more', '42501');
select pg_temp.counts($$select count(*) from public.timetable_entries$$, 0, 'revoked duty: sees no entries (no periods of their own)');
select pg_temp.throws($$select * from public.free_teachers(pg_temp.mon(), 1)$$, 'revoked duty: cannot list free teachers', '42501');
