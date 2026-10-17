-- The API role runs with pg-safeupdate: a DELETE without WHERE is refused ("DELETE requires a WHERE clause").
-- save_grade_bands used a bare DELETE, so the grading scale could not be saved from the screen (found in a browser test).
create or replace function public.save_grade_bands(p jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare it jsonb; prev numeric := -1; first boolean := true; mn numeric;
begin
  perform app.require_marks_admin();
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 then
    raise exception 'The grading scale needs at least one grade' using errcode = '23514';
  end if;
  -- the lowest band must start at 0 so every percentage gets a grade; starts must be distinct
  if (select min((e ->> 'min_pct')::numeric) from jsonb_array_elements(p) e) <> 0 then
    raise exception 'The lowest grade must start at 0%%' using errcode = '23514';
  end if;
  if (select count(distinct e ->> 'min_pct') from jsonb_array_elements(p) e) <> jsonb_array_length(p) then
    raise exception 'Two grades start at the same percentage' using errcode = '23514';
  end if;
  delete from public.grade_bands where true;
  for it in select * from jsonb_array_elements(p) loop
    insert into public.grade_bands (grade, min_pct, max_pct, grade_point, is_fail)
    values (trim(it ->> 'grade'), (it ->> 'min_pct')::numeric, (it ->> 'max_pct')::numeric, (it ->> 'grade_point')::numeric, coalesce((it ->> 'is_fail')::boolean, false));
  end loop;
  -- unlocked results get the new grades; locked results keep theirs (snapshot)
  perform app.recalc_class(y.academic_year_id, y.class_id) from (select distinct academic_year_id, class_id from public.marks) y;
end $$;
revoke execute on function public.save_grade_bands(jsonb) from public, anon;
grant execute on function public.save_grade_bands(jsonb) to authenticated;
