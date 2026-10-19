-- Rollover: subject-teacher assignments are copied to the new sections (part of the rollover; undo removes them; only later manual changes block undo).
create or replace function app.rollover_compute(p_from uuid, p_to uuid, p_plan jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  yf public.academic_years;
  yt public.academic_years;
  pl jsonb := coalesce(p_plan, '{}'::jsonb);
  maxsz int := coalesce(nullif(pl ->> 'max_size', '')::int, 40);
  ord text := coalesce(nullif(pl ->> 'roll_order', ''), 'alpha');
  g record;
  med_arr text[];
  explicit int[];
  free int[];
  grp_n int;
  checklist jsonb := '[]'::jsonb;
  classes_json jsonb;
  secs_json jsonb;
  rows_json jsonb;
  summary jsonb;
  problems int; dup_n int; over_n int; empty_existing int; unlocked int; no_fee text; no_subj text; midyear int;
  can boolean;
begin
  select * into yf from public.academic_years where id = p_from;
  select * into yt from public.academic_years where id = p_to;
  if yf.id is null or yt.id is null then raise exception 'Unknown academic year' using errcode = '23514'; end if;
  if ord not in ('alpha', 'keep') then raise exception 'roll_order must be alpha or keep' using errcode = '23514'; end if;
  if maxsz < 1 or maxsz > 500 then raise exception 'The section size limit must be between 1 and 500' using errcode = '23514'; end if;

  drop table if exists pg_temp._ro_rows;
  drop table if exists pg_temp._ro_secs;
  create temp table _ro_rows (
    student_id uuid primary key, enr_id uuid, name text, admission_no text, gender text,
    from_class_id uuid, from_class text, from_order int, from_section_id uuid, from_section text, from_roll int,
    outcome text not null, suggested boolean not null default false, is_new boolean not null default false,
    next_class_id uuid, to_class_id uuid, to_class text, to_section text, to_roll int, roll_override int,
    dues_paise bigint not null default 0, problem text
  ) on commit drop;
  create temp table _ro_secs (
    to_class_id uuid, to_class text, name text, existing_id uuid, src_id uuid, medium text, teacher_id uuid, teacher_name text, n int not null default 0,
    primary key (to_class_id, name)
  ) on commit drop;

  -- 1. everyone enrolled in the old year and still active
  insert into _ro_rows (student_id, enr_id, name, admission_no, gender, from_class_id, from_class, from_order, from_section_id, from_section, from_roll, outcome, suggested, next_class_id, dues_paise)
  select st.id, e.id, st.full_name, st.admission_no, st.gender, c.id, c.name, c.sort_order, s.id, s.name, e.roll_no,
         coalesce(nullif(pl -> 'students' -> (st.id::text) ->> 'outcome', ''), case when nx.nxt is null then 'passed_out' else 'promote' end),
         exists (select 1 from public.student_results sr join public.result_groups g2 on g2.id = sr.group_id
                  where sr.student_id = st.id and sr.academic_year_id = p_from and sr.result = 'fail' and g2.locked_at is not null
                    and not exists (select 1 from public.result_group_members m where m.child_group_id = g2.id)),
         nx.nxt,
         coalesce((select sum(greatest(d.amount_paise - d.concession_paise - d.paid_paise, 0)) from public.student_fee_dues d
                    where d.student_id = st.id and d.academic_year_id <> p_to and d.voided_at is null), 0)
    from public.student_enrollments e
    join public.students st on st.id = e.student_id
    join public.sections s on s.id = e.section_id
    join public.classes c on c.id = s.class_id
    left join (select id, lead(id) over (order by sort_order, name) nxt from public.classes where is_active) nx on nx.id = c.id
   where e.academic_year_id = p_from and st.status = 'active';

  if exists (select 1 from _ro_rows where outcome not in ('promote', 'detain', 'passed_out', 'left')) then
    raise exception 'Unknown outcome in the plan (use promote, detain, passed_out or left)' using errcode = '23514';
  end if;
  select count(*) into midyear from public.student_enrollments e join public.students st on st.id = e.student_id where e.academic_year_id = p_from and st.status <> 'active';

  -- 2. where each one goes
  update _ro_rows r set to_class_id = case outcome when 'promote' then next_class_id when 'detain' then from_class_id end,
                        to_section = case when outcome in ('promote', 'detain') then left(btrim(coalesce(nullif(pl -> 'students' -> (r.student_id::text) ->> 'to_section', ''), from_section)), 20) end,
                        roll_override = nullif(pl -> 'students' -> (r.student_id::text) ->> 'roll_no', '')::int
   where true;
  update _ro_rows r set to_class = c.name from public.classes c where c.id = r.to_class_id;
  update _ro_rows set problem = 'There is no next class: choose detain or passed out' where outcome = 'promote' and to_class_id is null;
  update _ro_rows r set problem = 'Already has a place in ' || yt.name || ': remove it there first'
   where exists (select 1 from public.student_enrollments e2 where e2.student_id = r.student_id and e2.academic_year_id = p_to);

  -- 3. new admissions already placed in the new year (they take part so the totals are complete)
  insert into _ro_rows (student_id, enr_id, name, admission_no, gender, outcome, is_new, to_class_id, to_class, to_section, from_roll, dues_paise)
  select st.id, e.id, st.full_name, st.admission_no, st.gender, 'new', true, s.class_id, c.name,
         left(btrim(coalesce(nullif(pl -> 'students' -> (st.id::text) ->> 'to_section', ''), s.name)), 20), e.roll_no, 0
    from public.student_enrollments e
    join public.students st on st.id = e.student_id and st.status = 'active'
    join public.sections s on s.id = e.section_id
    join public.classes c on c.id = s.class_id
   where e.academic_year_id = p_to and not exists (select 1 from _ro_rows r where r.student_id = st.id);
  update _ro_rows set roll_override = nullif(pl -> 'students' -> (student_id::text) ->> 'roll_no', '')::int where is_new;

  -- 4. the sections the new year will have (a section with nobody in it is simply not created)
  insert into _ro_secs (to_class_id, to_class, name, n)
  select to_class_id, to_class, to_section, count(*) from _ro_rows where to_class_id is not null and to_section is not null group by 1, 2, 3;
  update _ro_secs x set existing_id = s.id, medium = s.medium, teacher_id = s.class_teacher_id
    from public.sections s where s.academic_year_id = p_to and s.class_id = x.to_class_id and s.name = x.name;
  insert into _ro_secs (to_class_id, to_class, name, existing_id, medium, teacher_id, n)
  select s.class_id, c.name, s.name, s.id, s.medium, s.class_teacher_id, 0
    from public.sections s join public.classes c on c.id = s.class_id
   where s.academic_year_id = p_to and not exists (select 1 from _ro_secs x where x.to_class_id = s.class_id and x.name = s.name);
  -- new sections inherit medium and class teacher from the old section they come from (the class below, else the same class), unless the Admin changes them
  update _ro_secs x set
    src_id = src.id,
    medium = coalesce(nullif(pl -> 'sections' -> (x.to_class_id::text || ':' || x.name) ->> 'medium', ''), src.medium),
    teacher_id = case when pl -> 'sections' -> (x.to_class_id::text || ':' || x.name) ? 'class_teacher_id'
                      then nullif(pl -> 'sections' -> (x.to_class_id::text || ':' || x.name) ->> 'class_teacher_id', '')::uuid
                      else case when t.status = 'active' then src.class_teacher_id end end
    from (select x2.to_class_id, x2.name, (
            select s.id from public.sections s join public.classes c on c.id = s.class_id
             where s.academic_year_id = p_from and s.name = x2.name
               and c.id in (select pc.id from (select id, lead(id) over (order by sort_order, name) nxt from public.classes where is_active) pc where pc.nxt = x2.to_class_id)
             limit 1) prev_id,
                 (select s.id from public.sections s where s.academic_year_id = p_from and s.class_id = x2.to_class_id and s.name = x2.name) same_id
            from _ro_secs x2 where x2.existing_id is null) k
    join public.sections src on src.id = coalesce(k.prev_id, k.same_id)
    left join public.staff t on t.id = src.class_teacher_id
   where x.to_class_id = k.to_class_id and x.name = k.name and x.existing_id is null;
  update _ro_secs x set teacher_name = t.full_name from public.staff t where t.id = x.teacher_id;
  select mediums into med_arr from public.school_settings where id = 1;
  if exists (select 1 from _ro_secs x where x.medium is not null and x.medium <> all (med_arr)) then
    raise exception 'A medium in the plan is not one of the school''s mediums' using errcode = '23514';
  end if;

  -- 5. roll numbers: alphabetical by name (or the old order), the Admin's own numbers kept
  for g in select distinct to_class_id, to_section from _ro_rows where to_class_id is not null and to_section is not null loop
    select coalesce(array_agg(roll_override) filter (where roll_override is not null), '{}'), count(*) into explicit, grp_n
      from _ro_rows where to_class_id = g.to_class_id and to_section = g.to_section;
    select array_agg(x order by x) into free from generate_series(1, grp_n + coalesce(cardinality(explicit), 0)) x where x <> all (explicit);
    update _ro_rows r set to_roll = free[q.k]
      from (select student_id, row_number() over (order by case when ord = 'keep' then from_roll end nulls last, lower(name), admission_no) k
              from _ro_rows where to_class_id = g.to_class_id and to_section = g.to_section and roll_override is null) q
     where r.student_id = q.student_id;
    update _ro_rows set to_roll = roll_override where to_class_id = g.to_class_id and to_section = g.to_section and roll_override is not null;
  end loop;

  -- 6. totals per class
  select coalesce(jsonb_agg(jsonb_build_object(
           'class_id', c.id, 'class', c.name, 'sort_order', c.sort_order,
           'last_year', (select count(*) from _ro_rows r where r.from_class_id = c.id),
           'left_midyear', (select count(*) from public.student_enrollments e join public.sections s on s.id = e.section_id join public.students st on st.id = e.student_id
                              where e.academic_year_id = p_from and s.class_id = c.id and st.status <> 'active'),
           'promoted_out', (select count(*) from _ro_rows r where r.from_class_id = c.id and r.outcome = 'promote'),
           'detained', (select count(*) from _ro_rows r where r.from_class_id = c.id and r.outcome = 'detain'),
           'passed_out', (select count(*) from _ro_rows r where r.from_class_id = c.id and r.outcome = 'passed_out'),
           'left', (select count(*) from _ro_rows r where r.from_class_id = c.id and r.outcome = 'left'),
           'promoted_in', (select count(*) from _ro_rows r where r.to_class_id = c.id and r.outcome = 'promote'),
           'detained_in', (select count(*) from _ro_rows r where r.to_class_id = c.id and r.outcome = 'detain'),
           'new_in', (select count(*) from _ro_rows r where r.to_class_id = c.id and r.outcome = 'new'),
           'next_year', (select count(*) from _ro_rows r where r.to_class_id = c.id)) order by c.sort_order, c.name), '[]'::jsonb)
    into classes_json from public.classes c where c.is_active;

  select coalesce(jsonb_agg(jsonb_build_object('class_id', to_class_id, 'class', to_class, 'name', name, 'exists', existing_id is not null, 'section_id', existing_id,
           'medium', medium, 'class_teacher_id', teacher_id, 'class_teacher', teacher_name, 'count', n, 'over_limit', n > maxsz) order by to_class, name), '[]'::jsonb)
    into secs_json from _ro_secs;

  select coalesce(jsonb_agg(jsonb_build_object(
           'student_id', student_id, 'name', name, 'admission_no', admission_no, 'gender', gender,
           'from_class_id', from_class_id, 'from_class', from_class, 'from_section_id', from_section_id, 'from_section', from_section, 'from_roll', from_roll,
           'outcome', outcome, 'suggested_detain', suggested, 'is_new', is_new,
           'to_class_id', to_class_id, 'to_class', to_class, 'to_section', to_section, 'to_roll', to_roll,
           'dues_paise', dues_paise, 'problem', problem) order by from_order nulls last, from_section, lower(name)), '[]'::jsonb)
    into rows_json from _ro_rows;

  -- 7. checklist
  select count(*) into problems from _ro_rows where problem is not null;
  select count(*) into dup_n from (select to_class_id, to_section, to_roll from _ro_rows where to_roll is not null group by 1, 2, 3 having count(*) > 1) d;
  select count(*) into over_n from _ro_secs where n > maxsz;
  select count(*) into empty_existing from _ro_secs where existing_id is not null and n = 0;
  select count(*) into unlocked from public.result_groups gx
   where gx.academic_year_id = p_from and gx.locked_at is null and exists (select 1 from _ro_rows r where r.from_class_id = gx.class_id);
  select string_agg(distinct c.name, ', ' order by c.name) into no_fee from _ro_secs x join public.classes c on c.id = x.to_class_id
   where x.n > 0 and not exists (select 1 from public.fee_structure f where f.academic_year_id = p_to and f.class_id = x.to_class_id);
  select string_agg(distinct c.name, ', ' order by c.name) into no_subj from _ro_secs x join public.classes c on c.id = x.to_class_id
   where x.n > 0 and not exists (select 1 from public.class_subjects f where f.academic_year_id = p_to and f.class_id = x.to_class_id);

  checklist := jsonb_build_array(
    jsonb_build_object('key', 'new_year', 'label', 'The new academic year exists and is next',
      'status', case when yt.id <> yf.id and yt.start_date > yf.start_date and yt.status = 'planned' and not yt.is_current and yf.is_current then 'ok' else 'fail' end,
      'detail', case when yt.id = yf.id then 'The new year must be a different year'
                     when not yf.is_current then 'The year you are moving from (' || yf.name || ') is not the current year'
                     when yt.status <> 'planned' or yt.is_current then yt.name || ' has already started'
                     when yt.start_date <= yf.start_date then yt.name || ' must start after ' || yf.name
                     else yf.name || ' → ' || yt.name end, 'href', '/setup/academic-years'),
    jsonb_build_object('key', 'not_done', 'label', 'This rollover has not been done already',
      'status', case when exists (select 1 from public.rollover_runs where to_year_id = p_to and status = 'applied') then 'fail' else 'ok' end,
      'detail', 'One rollover per new year', 'href', '/students/promotion'),
    jsonb_build_object('key', 'fee_structure', 'label', 'The new year''s fee structure is set',
      'status', case when no_fee is null then 'ok' else 'fail' end, 'detail', case when no_fee is null then 'Every class that receives students has fees' else 'No fees set for: ' || no_fee end, 'href', '/fees/setup'),
    jsonb_build_object('key', 'class_subjects', 'label', 'The new year''s class subjects are set',
      'status', case when no_subj is null then 'ok' else 'fail' end, 'detail', case when no_subj is null then 'Every class that receives students has subjects' else 'No subjects set for: ' || no_subj end, 'href', '/setup/subjects'),
    jsonb_build_object('key', 'results_locked', 'label', 'Old-year results are locked',
      'status', case when unlocked = 0 then 'ok' else 'warn' end, 'detail', case when unlocked = 0 then 'All results are locked' else unlocked || ' result(s) are not locked yet (a warning, you can still continue)' end, 'href', '/exams/locks'),
    jsonb_build_object('key', 'all_placed', 'label', 'Every student is placed',
      'status', case when problems = 0 and dup_n = 0 then 'ok' else 'fail' end,
      'detail', case when problems > 0 then problems || ' student(s) cannot be placed: see the red rows' when dup_n > 0 then dup_n || ' roll number(s) used twice in a section' else 'Everyone has a class, section and roll number' end, 'href', '/students/promotion'),
    jsonb_build_object('key', 'section_size', 'label', 'No section is over the size limit (' || maxsz || ')',
      'status', case when over_n = 0 then 'ok' else 'fail' end, 'detail', case when over_n = 0 then 'All sections fit' else over_n || ' section(s) have more than ' || maxsz || ' students' end, 'href', '/students/promotion'),
    jsonb_build_object('key', 'no_empty_section', 'label', 'No section is empty',
      'status', case when empty_existing = 0 then 'ok' else 'warn' end, 'detail', case when empty_existing = 0 then 'Every section has students (a section nobody moves into is simply not created)' else empty_existing || ' existing new-year section(s) have no students' end, 'href', '/setup/classes'));
  can := not exists (select 1 from jsonb_array_elements(checklist) c where c ->> 'status' = 'fail');

  summary := jsonb_build_object(
    'students_total', (select count(*) from _ro_rows where not is_new),
    'promoted', (select count(*) from _ro_rows where outcome = 'promote'),
    'promoted_by_class', coalesce((select jsonb_agg(jsonb_build_object('class', to_class, 'count', k) order by o) from (select to_class, count(*) k, min(r.to_class_id::text) o from _ro_rows r where outcome = 'promote' group by r.to_class_id, r.to_class) z), '[]'::jsonb),
    'detained', (select count(*) from _ro_rows where outcome = 'detain'),
    'passed_out', (select count(*) from _ro_rows where outcome = 'passed_out'),
    'left', (select count(*) from _ro_rows where outcome = 'left'),
    'new_admissions', (select count(*) from _ro_rows where is_new),
    'left_midyear', midyear,
    'new_sections_created', (select count(*) from _ro_secs where existing_id is null and n > 0),
    'carried_dues_paise', coalesce((select sum(dues_paise) from _ro_rows where outcome in ('promote', 'detain')), 0),
    'carried_dues_students', (select count(*) from _ro_rows where outcome in ('promote', 'detain') and dues_paise > 0),
    'leavers_dues_paise', coalesce((select sum(dues_paise) from _ro_rows where outcome in ('passed_out', 'left')), 0),
    'assignments_to_copy', case when coalesce((pl ->> 'copy_assignments')::boolean, true) then
        (select count(*) from _ro_secs x join public.teacher_assignments ta on ta.section_id = x.src_id join public.staff st on st.id = ta.staff_id and st.status = 'active'
          where x.existing_id is null and x.n > 0
            and exists (select 1 from public.class_subjects cs where cs.academic_year_id = p_to and cs.class_id = x.to_class_id and cs.subject_id = ta.subject_id)) else 0 end);

  return jsonb_build_object('from_year', jsonb_build_object('id', yf.id, 'name', yf.name), 'to_year', jsonb_build_object('id', yt.id, 'name', yt.name),
    'max_size', maxsz, 'roll_order', ord, 'summary', summary, 'classes', classes_json, 'sections', secs_json, 'students', rows_json,
    'checklist', checklist, 'can_confirm', can);
end $$;

create or replace function public.rollover_confirm(p_from uuid, p_to uuid, p_plan jsonb, p_checked boolean, p_typed_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb;
  yt public.academic_years;
  yf public.academic_years;
  r record;
  sec record;
  sec_id uuid;
  snap_students jsonb := '[]'::jsonb;
  snap_adopted jsonb := '[]'::jsonb;
  new_secs uuid[] := '{}';
  new_enrs jsonb := '[]'::jsonb;
  new_plans uuid[] := '{}';
  new_asg uuid[] := '{}';
  asg_ids uuid[];
  plan_new uuid;
  mapped uuid;
  plans_missing int := 0;
  enr uuid;
  mark bigint;
  run_id uuid := gen_random_uuid();
  today date := (now() at time zone 'Asia/Kolkata')::date;
  sm jsonb;
begin
  perform app.require_admin_only();
  if not coalesce(p_checked, false) then raise exception 'Tick "I have checked the totals" first' using errcode = '23514'; end if;
  select * into yt from public.academic_years where id = p_to;
  select * into yf from public.academic_years where id = p_from;
  if yt.id is null or yf.id is null then raise exception 'Unknown academic year' using errcode = '23514'; end if;
  if lower(btrim(coalesce(p_typed_name, ''))) <> lower(btrim(yt.name)) then
    raise exception 'Type the new year name exactly (%) to confirm', yt.name using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(hashtext('kchs-rollover'));
  v := app.rollover_compute(p_from, p_to, p_plan);
  if not (v ->> 'can_confirm')::boolean then
    raise exception 'The checklist is not all green: fix the red items first' using errcode = '23514';
  end if;

  -- snapshot: what is about to change, exactly as it is now
  select coalesce(jsonb_agg(jsonb_build_object('id', st.id, 'status', st.status, 'status_date', st.status_date, 'status_reason', st.status_reason)), '[]'::jsonb) into snap_students
    from public.students st where st.id in (select student_id from _ro_rows where outcome in ('passed_out', 'left'));
  select coalesce(jsonb_agg(jsonb_build_object('enrollment_id', e.id, 'student_id', e.student_id, 'section_id', e.section_id, 'roll_no', e.roll_no)), '[]'::jsonb) into snap_adopted
    from public.student_enrollments e where e.id in (select enr_id from _ro_rows where is_new);

  -- 1. sections that do not exist yet
  for sec in select * from _ro_secs where existing_id is null and n > 0 loop
    insert into public.sections (academic_year_id, class_id, name, medium, class_teacher_id)
    values (p_to, sec.to_class_id, sec.name, sec.medium, sec.teacher_id) returning id into sec_id;
    new_secs := new_secs || sec_id;
    -- subject-teacher assignments are copied from the section the cohort comes from (same teacher, same subject); the Admin can change them afterwards
    if coalesce((p_plan ->> 'copy_assignments')::boolean, true) and sec.src_id is not null then
      with ins as (
        insert into public.teacher_assignments (staff_id, section_id, subject_id, periods_per_week)
        select ta.staff_id, sec_id, ta.subject_id, ta.periods_per_week
          from public.teacher_assignments ta join public.staff st on st.id = ta.staff_id and st.status = 'active'
         where ta.section_id = sec.src_id
           and exists (select 1 from public.class_subjects cs where cs.academic_year_id = p_to and cs.class_id = sec.to_class_id and cs.subject_id = ta.subject_id)
        on conflict do nothing returning id)
      select coalesce(array_agg(id), '{}') into asg_ids from ins;
      new_asg := new_asg || asg_ids;
    end if;
  end loop;

  -- 2. leavers
  update public.students st set status = case _ro_rows.outcome when 'passed_out' then 'passed_out' else 'left' end, status_date = today,
         status_reason = case _ro_rows.outcome when 'passed_out' then 'Passed out (year rollover to ' || yt.name || ')' else 'Left school (year rollover to ' || yt.name || ')' end
    from _ro_rows where _ro_rows.student_id = st.id and _ro_rows.outcome in ('passed_out', 'left');

  -- 3. new admissions already in the new year: move to their section (roll numbers are set at the end)
  update public.student_enrollments e set roll_no = null from _ro_rows q where q.enr_id = e.id and q.is_new;
  update public.student_enrollments e set section_id = (select s.id from public.sections s where s.academic_year_id = p_to and s.class_id = q.to_class_id and s.name = q.to_section)
    from _ro_rows q where q.enr_id = e.id and q.is_new;

  -- 4. fee plans carry over (matched to the new year's plan with the same name); concessions do NOT
  for r in select sp.* , r2.student_id as sid from public.student_fee_plans sp join _ro_rows r2 on r2.student_id = sp.student_id and r2.outcome in ('promote', 'detain')
            where sp.academic_year_id = p_from loop
    select np.id into mapped from public.fee_plans np join public.fee_plans op on op.name = np.name and op.id = r.plan_id where np.academic_year_id = p_to limit 1;
    if mapped is null then plans_missing := plans_missing + 1; continue; end if;
    insert into public.student_fee_plans (student_id, academic_year_id, fee_head_id, plan_id, reason)
    values (r.sid, p_to, r.fee_head_id, mapped, 'Carried over from ' || yf.name)
    on conflict (student_id, academic_year_id, fee_head_id) do nothing returning id into plan_new;
    if plan_new is not null then new_plans := new_plans || plan_new; plan_new := null; end if;
  end loop;

  -- 5. the new enrolments (the database makes the new year's dues from the new fee structure)
  for r in select * from _ro_rows where outcome in ('promote', 'detain') loop
    insert into public.student_enrollments (student_id, academic_year_id, section_id, roll_no, status)
    values (r.student_id, p_to, (select s.id from public.sections s where s.academic_year_id = p_to and s.class_id = r.to_class_id and s.name = r.to_section), r.to_roll, 'active')
    returning id into enr;
    new_enrs := new_enrs || jsonb_build_object('id', enr, 'student_id', r.student_id);
  end loop;
  update public.student_enrollments e set roll_no = q.to_roll from _ro_rows q where q.enr_id = e.id and q.is_new;

  -- 6. the switch: old year closed, new year current
  update public.academic_years set is_current = false, status = 'closed' where id = p_from;
  update public.academic_years set is_current = true, status = 'active' where id = p_to;

  select coalesce(max(id), 0) into mark from public.audit_logs;
  sm := (v -> 'summary') || jsonb_build_object('plans_not_matched', plans_missing, 'fee_plans_carried', coalesce(cardinality(new_plans), 0), 'assignments_copied', coalesce(cardinality(new_asg), 0),
                                              'enrollments_created', jsonb_array_length(new_enrs), 'students_affected', jsonb_array_length(new_enrs) + jsonb_array_length(snap_students) + jsonb_array_length(snap_adopted));
  insert into public.rollover_runs (id, from_year_id, to_year_id, plan, snapshot, summary, audit_mark, applied_by)
  values (run_id, p_from, p_to, coalesce(p_plan, '{}'::jsonb),
          jsonb_build_object('years', jsonb_build_array(
                jsonb_build_object('id', yf.id, 'status', yf.status, 'is_current', yf.is_current),
                jsonb_build_object('id', yt.id, 'status', yt.status, 'is_current', yt.is_current)),
              'students', snap_students, 'adopted', snap_adopted, 'sections', to_jsonb(new_secs), 'assignments', to_jsonb(new_asg), 'enrollments', new_enrs, 'fee_plans', to_jsonb(new_plans)),
          sm, mark, auth.uid());
  perform public.log_event('rollover.confirm', 'rollover_runs', run_id::text,
    jsonb_build_object('summary', 'Year rollover ' || yf.name || ' → ' || yt.name, 'from', yf.name, 'to', yt.name, 'students_affected', sm -> 'students_affected',
                       'promoted', sm -> 'promoted', 'detained', sm -> 'detained', 'passed_out', sm -> 'passed_out', 'left', sm -> 'left',
                       'new_sections', sm -> 'new_sections_created', 'carried_dues_paise', sm -> 'carried_dues_paise'));
  return jsonb_build_object('run_id', run_id, 'summary', sm);
end $$;

create or replace function app.rollover_blockers(p_run uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  run public.rollover_runs;
  out jsonb := '[]'::jsonb;
  n bigint;
  sec_ids uuid[];
  enr_ids uuid[];
  adopted_ids uuid[];
  fk record;
begin
  select * into run from public.rollover_runs where id = p_run;
  if run.id is null then raise exception 'Unknown rollover' using errcode = '23514'; end if;
  if run.status <> 'applied' then
    return jsonb_build_array(jsonb_build_object('key', 'already_undone', 'text', 'This rollover has already been undone', 'count', 1));
  end if;
  sec_ids := coalesce(array(select (x #>> '{}')::uuid from jsonb_array_elements(run.snapshot -> 'sections') x), '{}');
  enr_ids := coalesce(array(select (x ->> 'id')::uuid from jsonb_array_elements(run.snapshot -> 'enrollments') x), '{}');
  adopted_ids := coalesce(array(select (x ->> 'enrollment_id')::uuid from jsonb_array_elements(run.snapshot -> 'adopted') x), '{}');

  if exists (select 1 from public.rollover_runs o where o.status = 'applied' and o.from_year_id = run.to_year_id) then
    out := out || jsonb_build_object('key', 'later_rollover', 'text', 'A later year has already been rolled over from this one', 'count', 1);
  end if;
  select count(*) into n from public.attendance_sessions where academic_year_id = run.to_year_id;
  if n > 0 then out := out || jsonb_build_object('key', 'attendance', 'text', 'Attendance has been marked in the new year (' || n || ' sessions)', 'count', n); end if;
  select count(*) into n from public.marks where academic_year_id = run.to_year_id;
  if n > 0 then out := out || jsonb_build_object('key', 'marks', 'text', 'Marks have been entered in the new year (' || n || ')', 'count', n); end if;
  select count(distinct i.receipt_id) into n from public.fee_receipt_items i join public.student_fee_dues d on d.id = i.due_id where d.academic_year_id = run.to_year_id;
  if n > 0 then out := out || jsonb_build_object('key', 'receipts', 'text', 'Fees have been collected in the new year (' || n || ' receipts)', 'count', n); end if;
  select count(*) into n from public.student_enrollments e where e.academic_year_id = run.to_year_id and e.id <> all (enr_ids) and e.id <> all (adopted_ids);
  if n > 0 then out := out || jsonb_build_object('key', 'new_admission', 'text', n || ' student(s) have been admitted to the new year since the rollover', 'count', n); end if;
  select count(*) into n from public.audit_logs a
   where a.id > run.audit_mark and a.table_name = 'student_enrollments' and a.action in ('update', 'delete')
     and a.record_id in (select x::text from unnest(enr_ids || adopted_ids) x);
  if n > 0 then out := out || jsonb_build_object('key', 'student_changed', 'text', n || ' promoted student(s) have been changed by hand since the rollover', 'count', n); end if;
  select count(*) into n from public.audit_logs a
   where a.id > run.audit_mark and a.table_name = 'sections' and a.action in ('update', 'delete') and a.record_id in (select x::text from unnest(sec_ids) x);
  if n > 0 then out := out || jsonb_build_object('key', 'section_changed', 'text', 'A new section has been changed by hand since the rollover', 'count', n); end if;
  select count(*) into n from public.audit_logs a
   where a.id > run.audit_mark and a.table_name in ('fee_concessions', 'student_fee_plans') and (coalesce(a.new_data, a.old_data) ->> 'academic_year_id') = run.to_year_id::text;
  if n > 0 then out := out || jsonb_build_object('key', 'fee_changes', 'text', 'Fee concessions or plans have been changed in the new year (' || n || ' changes)', 'count', n); end if;
  select count(*) into n from public.audit_logs a
   where a.id > run.audit_mark and a.table_name = 'teacher_assignments' and (coalesce(a.new_data, a.old_data) ->> 'section_id') in (select x::text from unnest(sec_ids) x);
  if n > 0 then out := out || jsonb_build_object('key', 'assignments_changed', 'text', 'Teacher assignments of the new sections have been changed by hand since the rollover (' || n || ' changes)', 'count', n); end if;
  -- anything else already hanging on the new sections (timetable, teacher assignments, ...)
  for fk in select c.conrelid::regclass::text tbl, a.attname col
              from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
             where c.contype = 'f' and c.confrelid = 'public.sections'::regclass and c.conrelid <> 'public.student_enrollments'::regclass and c.conrelid <> 'public.teacher_assignments'::regclass loop
    execute format('select count(*) from %s where %I = any($1)', fk.tbl, fk.col) into n using sec_ids;
    if n > 0 then out := out || jsonb_build_object('key', 'section_used', 'text', 'The new sections are already used in ' || replace(replace(fk.tbl, 'public.', ''), '_', ' ') || ' (' || n || ')', 'count', n); end if;
  end loop;
  return out;
end $$;

create or replace function public.rollover_undo(p_run uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  run public.rollover_runs;
  b jsonb;
  sec_ids uuid[];
  enr_ids uuid[];
  plan_ids uuid[];
  stu_ids uuid[];
  x jsonb;
  n_students int;
begin
  perform app.require_admin_only();
  perform pg_advisory_xact_lock(hashtext('kchs-rollover'));
  b := app.rollover_blockers(p_run);
  if jsonb_array_length(b) > 0 then
    raise exception 'Cannot undo: %', (select string_agg(e ->> 'text', '; ') from jsonb_array_elements(b) e) using errcode = '23514';
  end if;
  select * into run from public.rollover_runs where id = p_run for update;
  sec_ids  := coalesce(array(select (v #>> '{}')::uuid from jsonb_array_elements(run.snapshot -> 'sections') v), '{}');
  enr_ids  := coalesce(array(select (v ->> 'id')::uuid from jsonb_array_elements(run.snapshot -> 'enrollments') v), '{}');
  stu_ids  := coalesce(array(select (v ->> 'student_id')::uuid from jsonb_array_elements(run.snapshot -> 'enrollments') v), '{}');
  plan_ids := coalesce(array(select (v #>> '{}')::uuid from jsonb_array_elements(run.snapshot -> 'fee_plans') v), '{}');

  delete from public.teacher_assignments where id in (select (v #>> '{}')::uuid from jsonb_array_elements(coalesce(run.snapshot -> 'assignments', '[]'::jsonb)) v);
  delete from public.student_fee_plans where id = any (plan_ids);
  delete from public.student_enrollments where id = any (enr_ids);
  delete from public.student_fee_dues where academic_year_id = run.to_year_id and student_id = any (stu_ids);   -- made by the rollover; nothing is paid on them (checked above)
  -- new admissions that were moved: back to where they were
  update public.student_enrollments set roll_no = null where id in (select (v ->> 'enrollment_id')::uuid from jsonb_array_elements(run.snapshot -> 'adopted') v);
  for x in select v from jsonb_array_elements(run.snapshot -> 'adopted') v loop
    update public.student_enrollments set section_id = (x ->> 'section_id')::uuid, roll_no = nullif(x ->> 'roll_no', '')::int where id = (x ->> 'enrollment_id')::uuid;
  end loop;
  -- leavers: back to active (their earlier status, date and reason). The fee tidy-up that normally follows a status change is switched off for this step: old-year dues must not be recalculated.
  perform set_config('app.rollover_restoring', '1', true);
  for x in select v from jsonb_array_elements(run.snapshot -> 'students') v loop
    update public.students set status = x ->> 'status', status_date = nullif(x ->> 'status_date', '')::date, status_reason = nullif(x ->> 'status_reason', '')
     where id = (x ->> 'id')::uuid;
  end loop;
  delete from public.sections where id = any (sec_ids);
  -- the two years as they were
  for x in select v from jsonb_array_elements(run.snapshot -> 'years') v loop
    update public.academic_years set is_current = false where id = (x ->> 'id')::uuid and (x ->> 'id')::uuid = run.to_year_id;
  end loop;
  for x in select v from jsonb_array_elements(run.snapshot -> 'years') v loop
    update public.academic_years set status = x ->> 'status', is_current = (x ->> 'is_current')::boolean where id = (x ->> 'id')::uuid;
  end loop;
  update public.rollover_runs set status = 'undone', undone_by = auth.uid(), undone_at = now() where id = p_run;
  n_students := coalesce((run.summary ->> 'students_affected')::int, 0);
  perform public.log_event('rollover.undo', 'rollover_runs', p_run::text,
    jsonb_build_object('summary', 'Year rollover undone', 'students_affected', n_students, 'sections_removed', cardinality(sec_ids), 'enrollments_removed', cardinality(enr_ids)));
  return jsonb_build_object('run_id', p_run, 'students_affected', n_students, 'sections_removed', cardinality(sec_ids), 'enrollments_removed', cardinality(enr_ids));
end $$;

