-- =====================================================================
--  Speed, without changing who can see what.
--  Row-level policies on students, guardians, enrolments, marks, results and grades called a
--  function for EVERY row (a teacher reading 439 students ran the scope check 439 times, about
--  0.7 s; marks about 2.4 s). The same rules are now worked out ONCE per query as lists
--  ("my sections", "my (section, subject) pairs", "my students") and each row is just checked
--  against the list. The rules themselves are unchanged and the same tests prove them.
-- =====================================================================

-- sections where the signed-in person is class teacher or has any assignment (what teaches_section() checks)
create function app.my_section_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array(
    select s.id from public.sections s where s.class_teacher_id = app.current_staff_id()
    union
    select a.section_id from public.teacher_assignments a where a.staff_id = app.current_staff_id()), '{}'::uuid[])
$$;

-- sections where they are the class teacher
create function app.my_class_teacher_section_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array(select s.id from public.sections s where s.class_teacher_id = app.current_staff_id()), '{}'::uuid[])
$$;

-- "section:subject" for every (section, subject) assigned to them
create function app.my_pair_keys() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array(select a.section_id::text || ':' || a.subject_id::text from public.teacher_assignments a where a.staff_id = app.current_staff_id()), '{}'::text[])
$$;

-- every student that is (or was) enrolled in one of their sections
create function app.my_student_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array(select e.student_id from public.student_enrollments e where e.section_id = any (app.my_section_ids())), '{}'::uuid[])
$$;

create function app.my_guardian_ids() returns uuid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array(select sg.guardian_id from public.student_guardians sg where sg.student_id = any (app.my_student_ids())), '{}'::uuid[])
$$;

-- Admin, student_records or any section-wide duty: every student's basic record
create function app.sees_all_students() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.can_manage_students() or app.has_section_duty()
$$;
grant execute on function app.my_section_ids(), app.my_class_teacher_section_ids(), app.my_pair_keys(), app.my_student_ids(), app.my_guardian_ids(), app.sees_all_students() to authenticated;

-- students and what hangs on them (same rule as app.can_view_student)
drop policy stu_select on public.students;
create policy stu_select on public.students for select to authenticated
  using (case when (select app.sees_all_students()) then true else id = any (((select app.my_student_ids()))::uuid[]) end);
drop policy sg_select on public.student_guardians;
create policy sg_select on public.student_guardians for select to authenticated
  using (case when (select app.sees_all_students()) then true else student_id = any (((select app.my_student_ids()))::uuid[]) end);
drop policy g_select on public.guardians;
create policy g_select on public.guardians for select to authenticated
  using (case when (select app.sees_all_students()) then true else id = any (((select app.my_guardian_ids()))::uuid[]) end);
drop policy se_select on public.student_enrollments;
create policy se_select on public.student_enrollments for select to authenticated
  using (case when (select app.sees_all_students()) then true else section_id = any (((select app.my_section_ids()))::uuid[]) end);

-- marks, results and grades: Admin / the marks duty see all; a teacher only their own (section, subject) pairs (R18)
drop policy mk_select on public.marks;
create policy mk_select on public.marks for select to authenticated
  using ((select app.is_staff_user()) and case when (select public.has_duty('all_class_marks')) then true else (section_id::text || ':' || subject_id::text) = any (((select app.my_pair_keys()))::text[]) end);
drop policy sr_select on public.subject_results;
create policy sr_select on public.subject_results for select to authenticated
  using ((select app.is_staff_user()) and case when (select public.has_duty('all_class_marks')) then true else (section_id::text || ':' || subject_id::text) = any (((select app.my_pair_keys()))::text[]) end);
drop policy ge_select on public.grade_entries;
create policy ge_select on public.grade_entries for select to authenticated
  using ((select app.is_staff_user()) and case when (select public.has_duty('all_class_marks')) then true else (section_id::text || ':' || subject_id::text) = any (((select app.my_pair_keys()))::text[]) end);
drop policy rr_select on public.report_remarks;
create policy rr_select on public.report_remarks for select to authenticated
  using ((select public.has_duty('all_class_marks')) or section_id = any (((select app.my_class_teacher_section_ids()))::uuid[]));
