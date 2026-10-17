-- Speed: one call instead of one per notice, and the foreign-key indexes that were missing.

-- Admin: how many of the audience have read each published notice (the dashboard and the notices list used to call
-- notice_readers once per notice, up to 80 calls)
create function public.notice_read_counts() returns table (notice_id uuid, read_count integer, total integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
  select n.id,
         (select count(*)::int from app.notice_audience_staff(n.id) a join public.notice_reads r on r.notice_id = n.id and r.staff_id = a.staff_id),
         (select count(*)::int from app.notice_audience_staff(n.id))
  from public.notices n
  where n.status = 'published' and n.archived_at is null;
end $$;
revoke execute on function public.notice_read_counts() from public, anon;
grant execute on function public.notice_read_counts() to authenticated;

create index if not exists diary_skips_subject_idx on public.diary_skips (subject_id);
create index if not exists exam_class_modes_class_idx on public.exam_class_modes (class_id);
create index if not exists fee_concessions_year_idx on public.fee_concessions (academic_year_id);
create index if not exists fee_concessions_head_idx on public.fee_concessions (fee_head_id);
create index if not exists grade_entries_year_idx on public.grade_entries (academic_year_id);
create index if not exists report_remarks_year_idx on public.report_remarks (academic_year_id);
create index if not exists student_fee_dues_year_idx on public.student_fee_dues (academic_year_id);
create index if not exists student_fee_plans_year_idx on public.student_fee_plans (academic_year_id);
create index if not exists student_fee_plans_head_idx on public.student_fee_plans (fee_head_id);
create index if not exists timetable_substitutions_sub_idx on public.timetable_substitutions (substitute_teacher_id);
