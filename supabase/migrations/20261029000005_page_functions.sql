-- One database call per page for Fees -> Collect, Exams -> Marks entry and Exams -> Results (they made 20 to 27 calls each).
-- All three run AS THE CALLER (security invoker): row-level security decides what comes back, exactly as before.
-- Rules unchanged: fee data only with fee access (checked here AND by the tables), marks only for the caller's own
-- (section, subject) pairs unless they hold the marks duty, locks are read-only facts here (saving still goes through save_marks).

-- ---------------------------------------------------------------- shared: the sections this person can see, in order
create or replace function app.sections_json(p_year uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'classId', c.id, 'className', c.name, 'classOrder', c.sort_order, 'name', s.name,
                                               'label', c.name || ' – ' || s.name, 'classTeacherId', s.class_teacher_id) order by c.sort_order, s.name), '[]'::jsonb)
    from public.sections s join public.classes c on c.id = s.class_id
   where s.academic_year_id = p_year
$$;

-- the exam scheme of one class + its subjects (names, type, order)
create or replace function app.exam_scheme_json(p_year uuid, p_class uuid) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'mode', coalesce((select m.mode from public.exam_class_modes m where m.academic_year_id = p_year and m.class_id = p_class),
                     case when lower((select name from public.classes where id = p_class)) in ('nursery', 'lkg', 'ukg') then 'grades' else 'marks' end),
    'components', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'name', e.name, 'max_marks', e.max_marks, 'sort_order', e.sort_order, 'locked_at', e.locked_at, 'lock_note', e.lock_note) order by e.sort_order, e.name)
                              from public.exam_components e where e.academic_year_id = p_year and e.class_id = p_class), '[]'::jsonb),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'kind', g.kind, 'method', g.method, 'best_n', g.best_n, 'scale_to', g.scale_to,
                                                         'start_date', g.start_date, 'end_date', g.end_date, 'sort_order', g.sort_order, 'locked_at', g.locked_at) order by g.sort_order, g.name)
                          from public.result_groups g where g.academic_year_id = p_year and g.class_id = p_class), '[]'::jsonb),
    'members', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'group_id', m.group_id, 'component_id', m.component_id, 'child_group_id', m.child_group_id, 'scale_to', m.scale_to, 'sort_order', m.sort_order))
                           from public.result_group_members m join public.result_groups g on g.id = m.group_id where g.academic_year_id = p_year and g.class_id = p_class), '[]'::jsonb),
    'subjectMax', coalesce((select jsonb_agg(jsonb_build_object('component_id', x.component_id, 'subject_id', x.subject_id, 'max_marks', x.max_marks))
                              from public.exam_subject_max x join public.exam_components e on e.id = x.component_id where e.academic_year_id = p_year and e.class_id = p_class), '[]'::jsonb),
    'passMarks', coalesce((select jsonb_object_agg(p.subject_id, p.pass_percent) from public.subject_pass_marks p where p.academic_year_id = p_year and p.class_id = p_class), '{}'::jsonb),
    'subjects', coalesce((select jsonb_agg(jsonb_build_object('id', cs.subject_id, 'name', coalesce(n.name, 'Subject'), 'type', coalesce(s.type, 'scholastic'), 'sort_order', cs.sort_order) order by cs.sort_order)
                            from public.class_subjects cs left join public.subjects s on s.id = cs.subject_id left join public.subject_names() n on n.id = cs.subject_id
                           where cs.academic_year_id = p_year and cs.class_id = p_class), '[]'::jsonb))
$$;

-- the section asked for if allowed, else the first allowed one whose class has a scheme, else the first allowed one
create or replace function app.pick_section(p_year uuid, p_allowed jsonb, p_wanted uuid) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(
    (select s from jsonb_array_elements(p_allowed) s where (s ->> 'id')::uuid = p_wanted),
    (select s from jsonb_array_elements(p_allowed) with ordinality t(s, o)
      where exists (select 1 from public.result_groups g where g.academic_year_id = p_year and g.class_id = (s ->> 'classId')::uuid) order by o limit 1),
    p_allowed -> 0)
$$;

-- ---------------------------------------------------------------- Exams -> Marks entry
create or replace function public.marks_page(p_year uuid, p_section uuid default null, p_component uuid default null, p_subject uuid default null) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_all boolean := app.is_admin() or public.has_duty('all_class_marks');
  me uuid := app.current_staff_id();
  v_allowed jsonb;
  v_sec jsonb;
  v_scheme jsonb;
  v_subjects jsonb;
  v_subject uuid;
  v_comp uuid;
begin
  if me is null then raise exception 'not allowed' using errcode = '42501'; end if;
  select coalesce(jsonb_agg(s), '[]'::jsonb) into v_allowed from jsonb_array_elements(app.sections_json(p_year)) s
   where v_all or exists (select 1 from public.teacher_assignments a where a.staff_id = me and a.section_id = (s ->> 'id')::uuid);
  if jsonb_array_length(v_allowed) = 0 then return jsonb_build_object('all', v_all, 'sections', v_allowed); end if;
  v_sec := app.pick_section(p_year, v_allowed, p_section);
  v_scheme := app.exam_scheme_json(p_year, (v_sec ->> 'classId')::uuid);
  -- the subjects this person enters here: scholastic, and (marks duty or their own pair)
  select coalesce(jsonb_agg(s order by (s ->> 'sort_order')::int), '[]'::jsonb) into v_subjects from jsonb_array_elements(v_scheme -> 'subjects') s
   where s ->> 'type' = 'scholastic'
     and (v_all or exists (select 1 from public.teacher_assignments a where a.staff_id = me and a.section_id = (v_sec ->> 'id')::uuid and a.subject_id = (s ->> 'id')::uuid));
  v_subject := coalesce((select (s ->> 'id')::uuid from jsonb_array_elements(v_subjects) s where (s ->> 'id')::uuid = p_subject), (v_subjects -> 0 ->> 'id')::uuid);
  v_comp := coalesce((select (c ->> 'id')::uuid from jsonb_array_elements(v_scheme -> 'components') c where (c ->> 'id')::uuid = p_component), (v_scheme -> 'components' -> 0 ->> 'id')::uuid);
  return jsonb_build_object(
    'all', v_all, 'sections', v_allowed, 'section', v_sec, 'scheme', v_scheme, 'subjects', v_subjects, 'subject_id', v_subject, 'component_id', v_comp,
    'students', coalesce((select jsonb_agg(jsonb_build_object('id', e.student_id, 'roll', e.roll_no, 'name', st.full_name, 'adm', st.admission_no) order by e.roll_no nulls last, st.full_name)
                            from public.student_enrollments e join public.students st on st.id = e.student_id
                           where e.section_id = (v_sec ->> 'id')::uuid and e.status = 'active'), '[]'::jsonb),
    'marks', coalesce((select jsonb_object_agg(m.student_id, jsonb_build_object('status', m.status, 'marks', m.marks)) from public.marks m
                        where m.component_id = v_comp and m.subject_id = v_subject and m.section_id = (v_sec ->> 'id')::uuid), '{}'::jsonb),
    'results', coalesce((select jsonb_agg(jsonb_build_object('student_id', r.student_id, 'group_id', r.group_id, 'scored', r.scored, 'max_marks', r.max_marks, 'pct', r.pct, 'grade', r.grade, 'grade_point', r.grade_point,
                                                          'pass_percent', r.pass_percent, 'passed', r.passed, 'missing', r.missing, 'has_absent', r.has_absent, 'locked', r.locked))
                           from public.subject_results r where r.subject_id = v_subject and r.section_id = (v_sec ->> 'id')::uuid), '[]'::jsonb),
    'pending', case when v_all and v_comp is not null then (select coalesce(sum(p.pending), 0) from public.exam_pending(v_comp) p where p.section_id = (v_sec ->> 'id')::uuid and p.subject_id = v_subject) else 0 end);
end $$;

-- ---------------------------------------------------------------- Exams -> Results
create or replace function public.results_page(p_year uuid, p_section uuid default null, p_group uuid default null) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_all boolean := app.is_admin() or public.has_duty('all_class_marks');
  v_allowed jsonb := app.sections_json(p_year);   -- row-level security: a teacher sees their own sections only
  v_sec jsonb;
  v_scheme jsonb;
  v_group uuid;
begin
  if app.current_staff_id() is null then raise exception 'not allowed' using errcode = '42501'; end if;
  if jsonb_array_length(v_allowed) = 0 then return jsonb_build_object('all', v_all, 'sections', v_allowed); end if;
  v_sec := app.pick_section(p_year, v_allowed, p_section);
  v_scheme := app.exam_scheme_json(p_year, (v_sec ->> 'classId')::uuid);
  v_group := coalesce((select (g ->> 'id')::uuid from jsonb_array_elements(v_scheme -> 'groups') g where g ->> 'kind' <> 'part' and (g ->> 'id')::uuid = p_group),
                      (select (g ->> 'id')::uuid from jsonb_array_elements(v_scheme -> 'groups') with ordinality t(g, o) where g ->> 'kind' <> 'part' order by o limit 1));
  return jsonb_build_object(
    'all', v_all, 'sections', v_allowed, 'section', v_sec, 'scheme', v_scheme, 'group_id', v_group,
    'students', coalesce((select jsonb_agg(jsonb_build_object('id', e.student_id, 'roll', e.roll_no, 'name', st.full_name) order by e.roll_no nulls last, st.full_name)
                            from public.student_enrollments e join public.students st on st.id = e.student_id
                           where e.section_id = (v_sec ->> 'id')::uuid and e.status = 'active'), '[]'::jsonb),
    'results', coalesce((select jsonb_agg(jsonb_build_object('student_id', r.student_id, 'subject_id', r.subject_id, 'scored', r.scored, 'max_marks', r.max_marks, 'pct', r.pct, 'grade', r.grade, 'grade_point', r.grade_point,
                                                          'pass_percent', r.pass_percent, 'passed', r.passed, 'missing', r.missing, 'has_absent', r.has_absent, 'locked', r.locked))
                           from public.subject_results r where r.group_id = v_group and r.section_id = (v_sec ->> 'id')::uuid), '[]'::jsonb),
    -- overall totals: Admin and the marks duty only (row-level security also hides them from teachers)
    'totals', case when v_all then coalesce((select jsonb_agg(jsonb_build_object('student_id', t.student_id, 'scored', t.scored, 'max_marks', t.max_marks, 'pct', t.pct, 'grade', t.grade, 'grade_point', t.grade_point, 'result', t.result))
                                              from public.student_results t where t.group_id = v_group and t.section_id = (v_sec ->> 'id')::uuid), '[]'::jsonb) else '[]'::jsonb end);
end $$;

-- ---------------------------------------------------------------- Fees -> Collect (fee access only)
create or replace function public.collect_page(p_year uuid, p_today date) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_admin boolean := app.is_admin();
begin
  perform app.require_fee_access();
  return jsonb_build_object(
    'sections', app.sections_json(p_year),
    -- every active enrolled student: outstanding, overdue (due before today), last payment, first phone (primary guardian first)
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'studentId', st.id, 'name', st.full_name, 'adm', st.admission_no, 'classId', c.id, 'sectionId', sec.id,
               'classLabel', c.name || ' – ' || sec.name, 'classOrder', c.sort_order, 'roll', e.roll_no,
               'phone', (select g.phone from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
                          where sg.student_id = st.id and g.phone is not null order by sg.is_primary desc limit 1),
               'totalDue', coalesce(d.total, 0), 'overdue', coalesce(d.overdue, 0),
               'lastPayment', (select max(r.receipt_date) from public.fee_receipts r where r.student_id = st.id and r.status = 'valid')))
        from public.student_enrollments e
        join public.students st on st.id = e.student_id and st.status = 'active'
        join public.sections sec on sec.id = e.section_id
        join public.classes c on c.id = sec.class_id
        left join lateral (
          select sum(greatest(x.amount_paise - x.concession_paise - x.paid_paise, 0)) as total,
                 sum(greatest(x.amount_paise - x.concession_paise - x.paid_paise, 0)) filter (where x.due_date < p_today) as overdue
            from public.student_fee_dues x where x.student_id = st.id and x.academic_year_id = p_year and x.voided_at is null) d on true
       where e.academic_year_id = p_year), '[]'::jsonb),
    'settings', (select jsonb_build_object('upi_id', s.upi_id, 'payee_name', s.payee_name, 'qr_path', s.qr_path, 'require_upi_reference', s.require_upi_reference) from public.fee_settings s where s.id = 1),
    -- the Admin's extra tools on this page: the picker for misc receipts (active students) and the regular fee heads
    'picker', case when v_admin then coalesce((
      select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.full_name, 'adm', st.admission_no,
               'classLabel', coalesce(c.name || ' – ' || sec.name, 'Not enrolled'),
               'phones', coalesce((select jsonb_agg(distinct g.phone) from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id where sg.student_id = st.id and g.phone is not null), '[]'::jsonb))
             order by st.full_name)
        from public.students st
        left join public.student_enrollments e on e.student_id = st.id and e.academic_year_id = p_year
        left join public.sections sec on sec.id = e.section_id
        left join public.classes c on c.id = sec.class_id
       where st.status = 'active'), '[]'::jsonb) else '[]'::jsonb end,
    'miscHeads', case when v_admin then coalesce((
      select jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name) order by h.sort_order, h.name)
        from public.fee_heads h where h.is_active and not exists (select 1 from public.fee_campaigns k where k.fee_head_id = h.id)), '[]'::jsonb) else '[]'::jsonb end);
end $$;

-- the per-student lateral lookups above use these
create index if not exists student_fee_dues_student_year_idx on public.student_fee_dues (student_id, academic_year_id) where voided_at is null;
create index if not exists fee_receipts_student_valid_idx on public.fee_receipts (student_id, receipt_date) where status = 'valid';

do $$
declare f text;
begin
  foreach f in array array['public.marks_page(uuid, uuid, uuid, uuid)', 'public.results_page(uuid, uuid, uuid)', 'public.collect_page(uuid, date)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
grant execute on function app.sections_json(uuid), app.exam_scheme_json(uuid, uuid), app.pick_section(uuid, jsonb, uuid) to authenticated;
