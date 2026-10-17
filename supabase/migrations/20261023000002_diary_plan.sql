-- Class diary screens for the notices & diary duty, who cannot read the
-- timetable or other teachers' assignments directly:
--   * diary_board gains "pending" (submitted lines waiting to be published)
--   * diary_class_plan: what the timetable expects for one class and day, in
--     period order, with the assigned teachers' names and the skip flag.

drop function public.diary_board(date);
create function public.diary_board(p_date date)
returns table (section_id uuid, expected integer, submitted integer, published integer, pending integer, skipped integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_notices_duty();
  return query
  select s.id,
    (select count(*)::int from app.diary_expected(s.id, p_date)),
    (select count(distinct e.subject_id)::int from public.diary_entries e join public.diary_entry_sections es on es.entry_id = e.id
       where es.section_id = s.id and e.entry_date = p_date and e.kind = 'subject' and e.status in ('submitted', 'published')
         and e.archived_at is null and e.subject_id in (select * from app.diary_expected(s.id, p_date))),
    (select count(*)::int from public.diary_entries e join public.diary_entry_sections es on es.entry_id = e.id
       where es.section_id = s.id and e.entry_date = p_date and e.status = 'published' and e.archived_at is null),
    (select count(*)::int from public.diary_entries e join public.diary_entry_sections es on es.entry_id = e.id
       where es.section_id = s.id and e.entry_date = p_date and e.status = 'submitted' and e.archived_at is null),
    (select count(*)::int from public.diary_skips k where k.section_id = s.id and k.entry_date = p_date)
  from public.sections s
  join public.academic_years y on y.id = s.academic_year_id and p_date between y.start_date and y.end_date;
end $$;
revoke execute on function public.diary_board(date) from public, anon;
grant execute on function public.diary_board(date) to authenticated;

create function public.diary_class_plan(p_section uuid, p_date date)
returns table (subject_id uuid, first_period integer, teachers text, skipped boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_notices_duty();
  return query
  select t.subject_id, min(t.period_no)::int,
         (select string_agg(st.full_name, ', ' order by st.full_name)
            from public.teacher_assignments a join public.staff st on st.id = a.staff_id
           where a.section_id = p_section and a.subject_id = t.subject_id),
         exists (select 1 from public.diary_skips k where k.section_id = p_section and k.entry_date = p_date and k.subject_id = t.subject_id)
  from public.timetable_entries t
  where t.section_id = p_section and t.weekday = extract(isodow from p_date)::int and t.subject_id is not null
  group by t.subject_id
  order by min(t.period_no);
end $$;
revoke execute on function public.diary_class_plan(uuid, date) from public, anon;
grant execute on function public.diary_class_plan(uuid, date) to authenticated;
