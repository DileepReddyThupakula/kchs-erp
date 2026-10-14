-- =====================================================================
-- Attendance roster for the marking screen.
-- A substitute teacher (assigned to mark a section only for the day) is not
-- one of that section's teachers, so the scope rule hides its students from
-- them. This function gives the marker exactly the list they need to mark
-- (roll, admission no, name) and nothing else, only for the section and
-- date they are assigned to (or Admin / all_class_attendance duty / the
-- class teacher).
-- =====================================================================
create function public.attendance_roster(p_section uuid, p_date date)
returns table (student_id uuid, admission_no text, full_name text, roll_no integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  me  uuid := app.current_staff_id();
  sec public.sections;
begin
  if me is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into sec from public.sections where id = p_section;
  if not found then
    return;
  end if;
  if not (public.has_duty('all_class_attendance')
          or sec.class_teacher_id = me
          or exists (select 1 from app.session_resolve(p_section, p_date) r where r.staff_id = me)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select s.id, s.admission_no, s.full_name, en.roll_no
  from public.student_enrollments en
  join public.students s on s.id = en.student_id
  where en.section_id = p_section and en.academic_year_id = sec.academic_year_id
    and en.status = 'active' and s.status = 'active' and s.admission_date <= p_date
  order by en.roll_no nulls last, s.full_name;
end $$;
revoke execute on function public.attendance_roster(uuid, date) from public, anon;
grant execute on function public.attendance_roster(uuid, date) to authenticated;
