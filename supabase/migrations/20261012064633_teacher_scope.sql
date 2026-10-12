-- =====================================================================
-- Teacher scope rule (standing rule, DECISIONS.md R18)
--   A teacher's sections = class teacher of it, or any teacher assignment in it.
--   Teachers read only: those sections (+ their class names), the subjects they
--   personally teach there, their own assignments, the class teacher's name of
--   their own sections. Admin (and the dormant computer_staff role) read all.
--   Duties override only for their module: a section-level duty lets a teacher
--   look up all sections/classes/subjects (reference data every module needs);
--   timetable_edit additionally shows every assignment.
-- =====================================================================

-- Any duty whose module works across all sections (government_ids_view is
-- not one: it only unmasks IDs of students the teacher can already see).
create function app.has_section_duty() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_duty('student_records') or public.has_duty('fee_collection')
      or public.has_duty('all_class_attendance') or public.has_duty('all_class_marks')
      or public.has_duty('notices_diary') or public.has_duty('timetable_edit')
      or public.has_duty('certificates_idcards')
$$;

-- Teacher is class teacher of, or assigned in, some section of this class.
create function app.teaches_class(p_class_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.sections s
    where s.class_id = p_class_id
      and (s.class_teacher_id = app.current_staff_id()
           or exists (select 1 from public.teacher_assignments a
                      where a.section_id = s.id and a.staff_id = app.current_staff_id())))
$$;

-- Teacher personally teaches this subject somewhere.
create function app.teaches_subject_anywhere(p_subject_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teacher_assignments a
                 where a.subject_id = p_subject_id and a.staff_id = app.current_staff_id())
$$;

-- Teacher personally teaches this subject in a section of this class/year.
create function app.teaches_class_subject(p_year_id uuid, p_class_id uuid, p_subject_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.teacher_assignments a
                 join public.sections s on s.id = a.section_id
                 where a.staff_id = app.current_staff_id() and a.subject_id = p_subject_id
                   and s.class_id = p_class_id and s.academic_year_id = p_year_id)
$$;
grant execute on function app.has_section_duty(), app.teaches_class(uuid),
  app.teaches_subject_anywhere(uuid), app.teaches_class_subject(uuid, uuid, uuid) to authenticated;

-- sections ----------------------------------------------------------------
drop policy sec_select on public.sections;
create policy sec_select on public.sections for select to authenticated
  using ((select app.is_office()) or (select app.has_section_duty()) or app.teaches_section(id));

-- classes (names of their own sections' classes only) -----------------------
drop policy cls_select on public.classes;
create policy cls_select on public.classes for select to authenticated
  using ((select app.is_office()) or (select app.has_section_duty()) or app.teaches_class(id));

-- subjects (only those they teach) -------------------------------------------
drop policy sub_select on public.subjects;
create policy sub_select on public.subjects for select to authenticated
  using ((select app.is_office()) or (select app.has_section_duty()) or app.teaches_subject_anywhere(id));

-- class-subject links (only the subjects they teach in their classes) --------
drop policy cs_select on public.class_subjects;
create policy cs_select on public.class_subjects for select to authenticated
  using ((select app.is_office()) or (select app.has_section_duty())
         or app.teaches_class_subject(academic_year_id, class_id, subject_id));

-- teacher assignments (own only; timetable_edit sees all) --------------------
drop policy ta_select on public.teacher_assignments;
create policy ta_select on public.teacher_assignments for select to authenticated
  using ((select app.is_office()) or (select public.has_duty('timetable_edit'))
         or staff_id = (select app.current_staff_id()));

-- staff directory: teachers see themselves + class teachers of their sections
create or replace function public.staff_directory()
returns table (id uuid, full_name text, designation text, department text, status text)
language sql stable security definer set search_path = '' as $$
  select s.id, s.full_name, s.designation, s.department, s.status
  from public.staff s
  where app.is_staff_user()
    and (app.is_office() or app.has_section_duty()
         or s.id = app.current_staff_id()
         or exists (select 1 from public.sections sec
                    where sec.class_teacher_id = s.id and app.teaches_section(sec.id)))
  order by s.full_name
$$;
