-- The annual (Final) report card showed empty co-scholastic grades and an empty remark box, because grades and remarks are
-- entered per term. A final card now shows the latest term's grade and remark (its own, if it has one). Found in a browser test.
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
    left join lateral (
      -- a term card uses its own grade; a final card uses the grade of its latest term that has one
      select e.* from public.grade_entries e
       where e.student_id = p_student and e.subject_id = s.id
         and (e.group_id = p_group or e.group_id in (select m.child_group_id from public.result_group_members m where m.group_id = p_group and m.child_group_id is not null))
       order by (e.group_id = p_group) desc,
                (select m.sort_order from public.result_group_members m where m.group_id = p_group and m.child_group_id = e.group_id) desc nulls last
       limit 1
    ) ge on true
    left join public.descriptive_grades d on d.code = ge.grade
    where cs.academic_year_id = g.academic_year_id and cs.class_id = g.class_id and (s.type = 'co_scholastic' or mode <> 'marks');

  -- the groups this result is built from (a final shows its terms)
  select coalesce(jsonb_agg(jsonb_build_object('id', g2.id, 'name', g2.name, 'kind', g2.kind) order by m.sort_order), '[]'::jsonb) into kids
    from public.result_group_members m join public.result_groups g2 on g2.id = m.child_group_id where m.group_id = p_group;
  select coalesce(jsonb_object_agg(sr.group_id::text, jsonb_build_object('scored', sr.scored, 'max', sr.max_marks, 'pct', sr.pct, 'grade', sr.grade, 'result', sr.result)), '{}'::jsonb) into kidtot
    from public.student_results sr where sr.student_id = p_student and sr.group_id in (select m.child_group_id from public.result_group_members m where m.group_id = p_group and m.child_group_id is not null);
  select * into tot from public.student_results where student_id = p_student and group_id = p_group;
  -- same rule for the class teacher's remark: the card's own, else (final) its latest term's
  select r2.* into rem from public.report_remarks r2
   where r2.student_id = p_student
     and (r2.group_id = p_group or r2.group_id in (select m.child_group_id from public.result_group_members m where m.group_id = p_group and m.child_group_id is not null))
   order by (r2.group_id = p_group) desc,
            (select m.sort_order from public.result_group_members m where m.group_id = p_group and m.child_group_id = r2.group_id) desc nulls last
   limit 1;

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
