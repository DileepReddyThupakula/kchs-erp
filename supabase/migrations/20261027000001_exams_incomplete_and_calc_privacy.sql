-- Exams: (1) an exam that is NOT ENTERED is never counted as 0: it is left out of the total and of the maximum
-- and the result stays "Incomplete" until it is entered (Absent still counts as 0, Not applicable is left out).
-- (2) How a result was calculated is for Admin only: the stored steps are no longer readable by teachers.
create or replace function app.eval_group(p_group uuid, p_student uuid, p_subject uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  g        public.result_groups;
  m        record;
  c        public.exam_components;
  mk       public.marks;
  r        jsonb;
  items    jsonb := '[]'::jsonb;
  it       jsonb;
  v        numeric;
  mx       numeric;
  absent   boolean := false;
  missing  integer := 0;
  entered  integer := 0;
  n        integer;
  tot_v    numeric := 0;
  tot_mx   numeric := 0;
  taken    integer := 0;
  taken_ords bigint[];
  st       text;
  lbl      text;
begin
  select * into g from public.result_groups where id = p_group;
  if not found then
    return null;
  end if;
  for m in select * from public.result_group_members where group_id = p_group order by sort_order, created_at loop
    if m.component_id is not null then
      select * into c from public.exam_components where id = m.component_id;
      mx := app.component_max(c.id, p_subject);
      lbl := c.name;
      select * into mk from public.marks where student_id = p_student and component_id = c.id and subject_id = p_subject;
      if not found then
        -- not entered: NEVER counted as 0. It is left out and the result stays Incomplete.
        items := items || jsonb_build_object('label', lbl, 'status', 'missing', 'v', null, 'mx', null, 'raw_max', mx);
        missing := missing + 1;
        continue;
      elsif mk.status = 'na' then
        items := items || jsonb_build_object('label', lbl, 'status', 'na', 'v', null, 'mx', null);
        continue;
      elsif mk.status = 'absent' then
        st := 'absent'; v := 0; absent := true; entered := entered + 1;
      else
        st := 'marked'; v := mk.marks; entered := entered + 1;
      end if;
      it := jsonb_build_object('label', lbl, 'status', st, 'raw', v, 'raw_max', mx);
    else
      r := app.eval_group(m.child_group_id, p_student, p_subject);
      select name into lbl from public.result_groups where id = m.child_group_id;
      if r is not null then
        missing := missing + coalesce((r ->> 'missing')::int, 0);
      end if;
      if r is null or r -> 'mx' is null or r ->> 'mx' is null then
        items := items || jsonb_build_object('label', lbl, 'status', 'na', 'v', null, 'mx', null);
        continue;
      end if;
      v := (r ->> 'v')::numeric;
      mx := (r ->> 'mx')::numeric;
      entered := entered + (r ->> 'entered')::int;
      if (r ->> 'absent')::boolean then absent := true; end if;
      st := 'group';
      it := jsonb_build_object('label', lbl, 'status', st, 'raw', v, 'raw_max', mx, 'steps', r -> 'steps', 'method', r ->> 'method');
    end if;
    if m.scale_to is not null and mx > 0 then
      v := round(v / mx * m.scale_to, 2);
      mx := m.scale_to;
      it := it || jsonb_build_object('scaled_to', m.scale_to);
    end if;
    it := it || jsonb_build_object('v', v, 'mx', mx);
    items := items || it;
  end loop;

  -- combine
  select count(*) into n from jsonb_array_elements(items) e where e ->> 'status' not in ('na', 'missing');
  if n = 0 then
    return jsonb_build_object('v', null, 'mx', null, 'absent', absent, 'missing', missing, 'entered', entered, 'steps', items, 'method', g.method);
  end if;
  if g.method = 'sum' then
    select coalesce(sum((e ->> 'v')::numeric), 0), coalesce(sum((e ->> 'mx')::numeric), 0) into tot_v, tot_mx
      from jsonb_array_elements(items) e where e ->> 'status' not in ('na', 'missing');
  elsif g.method = 'average' then
    select round(coalesce(sum((e ->> 'v')::numeric), 0) / n, 2), round(coalesce(sum((e ->> 'mx')::numeric), 0) / n, 2) into tot_v, tot_mx
      from jsonb_array_elements(items) e where e ->> 'status' not in ('na', 'missing');
  else
    -- best N by percentage; remember which ones were taken
    select array_agg(q.ord) into taken_ords from (
      select ord, row_number() over (order by pc desc nulls last, ord) as rk
      from (select t.ord, (t.e ->> 'v')::numeric / nullif((t.e ->> 'mx')::numeric, 0) as pc
            from jsonb_array_elements(items) with ordinality as t(e, ord) where t.e ->> 'status' not in ('na', 'missing')) z
    ) q where q.rk <= g.best_n;
    select coalesce(sum((t.e ->> 'v')::numeric), 0), coalesce(sum((t.e ->> 'mx')::numeric), 0), count(*) into tot_v, tot_mx, taken
      from jsonb_array_elements(items) with ordinality as t(e, ord) where t.ord = any (taken_ords);
    select jsonb_agg(case when t.e ->> 'status' in ('na', 'missing') then t.e else t.e || jsonb_build_object('taken', t.ord = any (taken_ords)) end order by t.ord) into items
      from jsonb_array_elements(items) with ordinality as t(e, ord);
  end if;
  if g.scale_to is not null and tot_mx > 0 then
    tot_v := round(tot_v / tot_mx * g.scale_to, 2);
    tot_mx := g.scale_to;
  end if;
  return jsonb_build_object('v', tot_v, 'mx', tot_mx, 'absent', absent, 'missing', missing, 'entered', entered, 'steps', items,
                            'method', g.method, 'best_n', g.best_n, 'scale_to', g.scale_to);
end $$;
revoke execute on function app.eval_group(uuid, uuid, uuid) from public, anon, authenticated;


revoke select on public.subject_results from authenticated;
grant select (id, academic_year_id, class_id, section_id, student_id, group_id, subject_id, scored, max_marks, pct, grade, grade_point, pass_percent, passed, has_absent, missing, locked, updated_at)
  on public.subject_results to authenticated;

create function public.subject_result_calc(p_student uuid, p_group uuid, p_subject uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r public.subject_results;
begin
  if not app.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into r from public.subject_results where student_id = p_student and group_id = p_group and subject_id = p_subject;
  if not found then
    return null;
  end if;
  return jsonb_build_object('calc', r.calc, 'scored', r.scored, 'max', r.max_marks, 'pct', r.pct, 'grade', r.grade, 'grade_point', r.grade_point, 'pass_percent', r.pass_percent, 'passed', r.passed, 'missing', r.missing);
end $$;
revoke execute on function public.subject_result_calc(uuid, uuid, uuid) from public, anon;
grant execute on function public.subject_result_calc(uuid, uuid, uuid) to authenticated;

-- results that are still open were calculated the old way: calculate them again (locked results keep their snapshot)
select app.recalc_class(y.academic_year_id, y.class_id) from (select distinct academic_year_id, class_id from public.marks) y;

-- the report card data no longer carries the calculation steps either
create or replace function public.report_card_data(p_student uuid, p_group uuid, p_log boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  g     public.result_groups;
  en    public.student_enrollments;
  sec   public.sections;
  st    public.students;
  cls   public.classes;
  yr    public.academic_years;
  mode  text;
  comps jsonb;
  subs  jsonb;
  cosc  jsonb;
  kids  jsonb;
  kidtot jsonb;
  tot   public.student_results;
  rem   public.report_remarks;
  dup   boolean := false;
begin
  if not app.is_staff_user() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into g from public.result_groups where id = p_group;
  if g.id is null then raise exception 'Unknown result' using errcode = '23514'; end if;
  select * into en from public.student_enrollments where student_id = p_student and academic_year_id = g.academic_year_id;
  if en.id is null then raise exception 'That student is not enrolled this year' using errcode = '23514'; end if;
  select * into sec from public.sections where id = en.section_id;
  if sec.class_id <> g.class_id then raise exception 'That result belongs to another class' using errcode = '23514'; end if;
  if not (public.has_duty('all_class_marks') or app.is_class_teacher(sec.id)) then raise exception 'not allowed' using errcode = '42501'; end if;
  if g.locked_at is null then raise exception 'Report cards can be printed only after the exam is locked' using errcode = '23514'; end if;
  select * into st from public.students where id = p_student;
  select * into cls from public.classes where id = sec.class_id;
  select * into yr from public.academic_years where id = g.academic_year_id;
  mode := app.class_mode(g.academic_year_id, g.class_id);

  -- the exams under this result, in order (with their maximum)
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'max', c.max_marks) order by c.sort_order, c.name), '[]'::jsonb) into comps
    from public.exam_components c where c.id in (select component_id from app.group_components(p_group));

  -- scholastic subjects: marks per exam, group total, grade, pass
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.sort_order), '[]'::jsonb) into subs from (
    select s.id as subject_id, s.name, s.name_te, cs.sort_order,
           (select jsonb_object_agg(m.component_id::text, jsonb_build_object('status', m.status, 'marks', m.marks))
              from public.marks m where m.student_id = p_student and m.subject_id = s.id and m.component_id in (select component_id from app.group_components(p_group))) as marks,
           (select jsonb_object_agg(r2.group_id::text, jsonb_build_object('scored', r2.scored, 'max', r2.max_marks, 'grade', r2.grade, 'passed', r2.passed))
              from public.subject_results r2
             where r2.student_id = p_student and r2.subject_id = s.id and r2.group_id in (select m.child_group_id from public.result_group_members m where m.group_id = p_group and m.child_group_id is not null)) as child_results,
           r.scored, r.max_marks, r.pct, r.grade, r.grade_point, r.passed, r.pass_percent, r.has_absent, r.missing
    from public.class_subjects cs join public.subjects s on s.id = cs.subject_id
    left join public.subject_results r on r.student_id = p_student and r.group_id = p_group and r.subject_id = s.id
    where cs.academic_year_id = g.academic_year_id and cs.class_id = g.class_id and s.type = 'scholastic' and mode = 'marks'
  ) x;

  -- grades / remarks per subject (co-scholastic; every subject in grade / remark classes)
  select coalesce(jsonb_agg(jsonb_build_object('subject_id', s.id, 'name', s.name, 'name_te', s.name_te, 'grade', ge.grade, 'grade_label', d.label, 'remark', ge.remark) order by cs.sort_order), '[]'::jsonb) into cosc
    from public.class_subjects cs join public.subjects s on s.id = cs.subject_id
    left join public.grade_entries ge on ge.student_id = p_student and ge.group_id = p_group and ge.subject_id = s.id
    left join public.descriptive_grades d on d.code = ge.grade
    where cs.academic_year_id = g.academic_year_id and cs.class_id = g.class_id and (s.type = 'co_scholastic' or mode <> 'marks');

  -- the groups this result is built from (a final shows its terms)
  select coalesce(jsonb_agg(jsonb_build_object('id', g2.id, 'name', g2.name, 'kind', g2.kind) order by m.sort_order), '[]'::jsonb) into kids
    from public.result_group_members m join public.result_groups g2 on g2.id = m.child_group_id where m.group_id = p_group;
  select coalesce(jsonb_object_agg(sr.group_id::text, jsonb_build_object('scored', sr.scored, 'max', sr.max_marks, 'pct', sr.pct, 'grade', sr.grade, 'result', sr.result)), '{}'::jsonb) into kidtot
    from public.student_results sr where sr.student_id = p_student and sr.group_id in (select m.child_group_id from public.result_group_members m where m.group_id = p_group and m.child_group_id is not null);
  select * into tot from public.student_results where student_id = p_student and group_id = p_group;
  select * into rem from public.report_remarks where student_id = p_student and group_id = p_group;

  if p_log then
    select exists (select 1 from public.report_card_prints where student_id = p_student and group_id = p_group) into dup;
    insert into public.report_card_prints (student_id, group_id, section_id, printed_by, duplicate) values (p_student, p_group, sec.id, app.current_staff_id(), dup);
  end if;

  return jsonb_build_object(
    'duplicate', dup,
    'mode', mode,
    'year', yr.name,
    'group', jsonb_build_object('id', g.id, 'name', g.name, 'kind', g.kind, 'start_date', g.start_date, 'end_date', g.end_date, 'method', g.method),
    'student', jsonb_build_object('id', st.id, 'name', st.full_name, 'admission_no', st.admission_no, 'roll_no', en.roll_no, 'class', cls.name, 'section', sec.name),
    'components', comps,
    'children', kids,
    'child_totals', kidtot,
    'subjects', subs,
    'co_scholastic', cosc,
    'total', case when tot.id is null then null else jsonb_build_object('scored', tot.scored, 'max', tot.max_marks, 'pct', tot.pct, 'grade', tot.grade, 'grade_point', tot.grade_point, 'result', tot.result, 'failed', tot.failed_count) end,
    'remark', case when rem.id is null then null else jsonb_build_object('en', rem.remark_en, 'te', rem.remark_te) end);
end $$;
revoke execute on function public.report_card_data(uuid, uuid, boolean) from public, anon;
grant execute on function public.report_card_data(uuid, uuid, boolean) to authenticated;

