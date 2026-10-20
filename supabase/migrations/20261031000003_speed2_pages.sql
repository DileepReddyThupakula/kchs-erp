-- Speed pass 2, part 2: one database call per page for Report cards, Exams scheme, Results report, Timetable and My students.
-- All run AS THE CALLER (security invoker) except where they only call functions that already decide access themselves,
-- so row-level security and every existing rule stay exactly as the separate queries had them.

-- ---------------------------------------------------------------- Exams -> Report cards
-- Admin / marks duty: every section. Anyone else: only the sections they are class teacher of (and the list function re-checks).
create or replace function public.report_cards_page(p_year uuid, p_section uuid default null, p_group uuid default null) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_all boolean := app.is_admin() or public.has_duty('all_class_marks');
  me uuid := app.current_staff_id();
  v_allowed jsonb;
  v_sec jsonb;
  v_scheme jsonb;
  v_groups jsonb;
  v_group jsonb;
  v_rows jsonb;
  v_sample jsonb;
  v_year public.academic_years;
  v_from date;
  v_to date;
begin
  if me is null then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(s), '[]'::jsonb) into v_allowed from jsonb_array_elements(app.sections_json(p_year)) s
   where v_all or (s ->> 'classTeacherId')::uuid = me;
  if jsonb_array_length(v_allowed) = 0 then return jsonb_build_object('all', v_all, 'sections', v_allowed); end if;
  v_sec := app.pick_section(p_year, v_allowed, p_section);
  v_scheme := app.exam_scheme_json(p_year, (v_sec ->> 'classId')::uuid);
  select coalesce(jsonb_agg(g order by (g ->> 'sort_order')::int), '[]'::jsonb) into v_groups from jsonb_array_elements(v_scheme -> 'groups') g where g ->> 'kind' in ('term', 'final');
  if jsonb_array_length(v_groups) = 0 then return jsonb_build_object('all', v_all, 'sections', v_allowed, 'section', v_sec, 'groups', v_groups); end if;
  v_group := coalesce((select g from jsonb_array_elements(v_groups) g where (g ->> 'id')::uuid = p_group), v_groups -> 0);
  select coalesce(jsonb_agg(to_jsonb(l)), '[]'::jsonb) into v_rows from public.class_result_list((v_sec ->> 'id')::uuid, (v_group ->> 'id')::uuid) l;
  -- before printing: are too many attendance sessions of this period unmarked? (every student of a section shares the same sessions)
  select * into v_year from public.academic_years where id = p_year;
  v_from := coalesce((v_group ->> 'start_date')::date, v_year.start_date);
  v_to := coalesce((v_group ->> 'end_date')::date, v_year.end_date);
  if (v_group ->> 'locked_at') is not null and jsonb_array_length(v_rows) > 0 and v_from is not null and v_to is not null then
    select to_jsonb(t) into v_sample from public.student_day_totals((v_rows -> 0 ->> 'student_id')::uuid, v_from, v_to) t limit 1;
  end if;
  return jsonb_build_object('all', v_all, 'sections', v_allowed, 'section', v_sec, 'groups', v_groups, 'group', v_group, 'rows', v_rows, 'sample', v_sample);
end $$;

-- ---------------------------------------------------------------- Exams -> Scheme
create or replace function public.exams_scheme_page(p_year uuid, p_class uuid default null) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_classes jsonb;
  v_class uuid;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'sort_order', c.sort_order) order by c.sort_order), '[]'::jsonb) into v_classes
    from public.classes c where c.is_active;
  v_class := coalesce((select (c ->> 'id')::uuid from jsonb_array_elements(v_classes) c where (c ->> 'id')::uuid = p_class), (v_classes -> 0 ->> 'id')::uuid);
  return jsonb_build_object(
    'classes', v_classes,
    'class_id', v_class,
    'scheme', case when v_class is null then null else app.exam_scheme_json(p_year, v_class) end,
    'bands', coalesce((select jsonb_agg(jsonb_build_object('grade', b.grade, 'min_pct', b.min_pct, 'max_pct', b.max_pct, 'grade_point', b.grade_point, 'is_fail', b.is_fail) order by b.min_pct desc) from public.grade_bands b), '[]'::jsonb),
    'grades', coalesce((select jsonb_agg(jsonb_build_object('code', d.code, 'label', d.label) order by d.sort_order) from public.descriptive_grades d), '[]'::jsonb),
    'bank', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'text_en', r.text_en, 'text_te', r.text_te, 'te_verified', r.te_verified) order by r.sort_order) from public.remark_bank r where r.is_active), '[]'::jsonb),
    'default_pass_percent', (select s.default_pass_percent from public.school_settings s where s.id = 1));
end $$;

-- ---------------------------------------------------------------- Reports -> Exams (results summary)
-- The two report functions below already decide who may see what (Admin / marks duty / class teacher / own pairs); this only runs them once.
create or replace function public.report_exams_page(p_year uuid, p_exam text default null, p_tab text default 'subjects') returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_names jsonb;
  v_exam text;
  v_ids uuid[];
  v_sections_ok boolean := app.is_admin() or public.has_duty('all_class_marks') or cardinality(app.my_class_teacher_section_ids()) > 0;
  v_rows jsonb := '[]'::jsonb;
begin
  select coalesce(jsonb_agg(n order by o), '[]'::jsonb) into v_names
    from (select g.name n, min(g.sort_order) o from public.result_groups g where g.academic_year_id = p_year and g.kind in ('term', 'final') group by g.name) x;
  v_exam := case when v_names ? coalesce(p_exam, '') then p_exam else v_names ->> 0 end;
  if v_exam is null then return jsonb_build_object('names', v_names, 'exam', null, 'sectionsOk', v_sections_ok, 'rows', v_rows); end if;
  select coalesce(array_agg(g.id), '{}') into v_ids from public.result_groups g where g.academic_year_id = p_year and g.name = v_exam and g.kind in ('term', 'final');
  if p_tab = 'sections' then
    if not v_sections_ok then return jsonb_build_object('names', v_names, 'exam', v_exam, 'sectionsOk', false, 'rows', v_rows, 'forbidden', true); end if;
    select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows from unnest(v_ids) g, lateral public.report_class_results(g) r;
  else
    select coalesce(jsonb_agg(to_jsonb(r)), '[]'::jsonb) into v_rows from unnest(v_ids) g, lateral public.report_subject_results(g) r;
  end if;
  return jsonb_build_object('names', v_names, 'exam', v_exam, 'sectionsOk', v_sections_ok, 'rows', v_rows);
end $$;

-- ---------------------------------------------------------------- Academics -> Timetable (class editor)
create or replace function public.timetable_page(p_year uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'schedules', coalesce((select jsonb_agg(to_jsonb(b) order by b.name) from (select id, name, note, is_default from public.bell_schedules) b), '[]'::jsonb),
    'periods', coalesce((select jsonb_agg(to_jsonb(p) order by p.seq) from (select id, schedule_id, seq, kind, period_no, label, start_time, end_time from public.bell_periods) p), '[]'::jsonb),
    'classBells', coalesce((select jsonb_agg(to_jsonb(c)) from (select class_id, weekday, schedule_id from public.class_bell_schedules) c), '[]'::jsonb),
    'sections', app.sections_json(p_year),
    'entries', coalesce((select jsonb_agg(to_jsonb(e)) from (select id, section_id, weekday, period_no, subject_id, activity, teacher_id, room from public.timetable_entries where academic_year_id = p_year) e), '[]'::jsonb),
    'assignments', coalesce((select jsonb_agg(to_jsonb(a)) from (select id, section_id, subject_id, staff_id, periods_per_week from public.teacher_assignments) a), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.full_name)) from public.staff_directory() s where s.status = 'active'), '[]'::jsonb),
    'subjects', coalesce((select jsonb_object_agg(s.id, s.name) from public.subjects s), '{}'::jsonb),
    'workingDays', (select s.working_days from public.school_settings s where s.id = 1))
$$;

-- ---------------------------------------------------------------- My work -> My students (the section filter)
-- the sections the caller is class teacher of or teaches in (the student list itself is students_page, one call already)
create or replace function public.my_section_options(p_year uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(s order by (s ->> 'classOrder')::int, s ->> 'name'), '[]'::jsonb)
    from jsonb_array_elements(app.sections_json(p_year)) s
   where (s ->> 'classTeacherId')::uuid = app.current_staff_id()
      or exists (select 1 from public.teacher_assignments a where a.staff_id = app.current_staff_id() and a.section_id = (s ->> 'id')::uuid)
$$;

do $$ declare f text; begin
  foreach f in array array['report_cards_page(uuid,uuid,uuid)', 'exams_scheme_page(uuid,uuid)', 'report_exams_page(uuid,text,text)', 'timetable_page(uuid)', 'my_section_options(uuid)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
