-- Module 9 (database part): the audit log, readable by the Admin only, and impossible to edit or delete.
-- Rules AU1-AU5 in DECISIONS.md. Nothing here is callable by teachers, office staff or deactivated staff.

-- ------------------------------------------------------------------ 1. entries can never change
-- Nobody writes to the table directly any more: rows arrive only through the audit triggers and
-- public.log_event / log_report / log_failed_login (all SECURITY DEFINER). Even the Admin can only read.
revoke insert, update, delete, truncate, references, trigger on public.audit_logs from public, anon, authenticated, service_role;
grant select on public.audit_logs to authenticated;

-- TRUNCATE skips row triggers, so it gets its own guard (row-level update/delete are already blocked by audit_logs_immutable)
create or replace function app.block_audit_truncate() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end $$;
drop trigger if exists audit_logs_no_truncate on public.audit_logs;
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function app.block_audit_truncate();

-- ------------------------------------------------------------------ 2. indexes for the filters
create index if not exists audit_logs_action_time_idx on public.audit_logs (action, occurred_at desc);
create index if not exists audit_logs_actor_time_idx  on public.audit_logs (actor_user_id, occurred_at desc);
create index if not exists audit_logs_table_time_idx  on public.audit_logs (table_name, occurred_at desc);
create index if not exists audit_logs_failed_idx      on public.audit_logs ((details ->> 'email'), occurred_at desc) where action = 'auth.login_failed';

-- ------------------------------------------------------------------ 3. failed sign-ins (nobody is signed in yet, so anon may call it; it is throttled)
create or replace function public.log_failed_login(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
begin
  if e = '' or length(e) > 200 or e !~ '^[^@\s]+@[^@\s]+$' then return; end if;
  -- throttle so the log cannot be flooded: at most 20 per address per hour and 60 per minute overall
  if (select count(*) from public.audit_logs where action = 'auth.login_failed' and details ->> 'email' = e and occurred_at > now() - interval '1 hour') >= 20 then return; end if;
  if (select count(*) from public.audit_logs where action = 'auth.login_failed' and occurred_at > now() - interval '1 minute') >= 60 then return; end if;
  insert into public.audit_logs (actor_user_id, actor_role, action, table_name, record_id, details)
  values (null, null, 'auth.login_failed', 'auth', null,
          jsonb_build_object('email', e, 'known_account', exists (select 1 from public.staff s where lower(s.email) = e)));
end $$;
revoke execute on function public.log_failed_login(text) from public;
grant execute on function public.log_failed_login(text) to anon, authenticated;

-- ------------------------------------------------------------------ 4. plain-English helpers
-- Which kind of action an entry is (the "kind" filter)
create or replace function app.audit_group(p_action text, p_table text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_action like 'auth.%' or p_action = 'student.ids_revealed' then 'access'
    when p_action like 'report.%' then 'exports'
    when p_action like 'fee.%' or p_action like 'fee_settings.%' then 'fees'
    when p_table in ('students', 'student_profiles', 'student_secure_values', 'guardians', 'student_guardians', 'student_enrollments', 'student_documents') then 'students'
    when p_table like 'fee\_%' or p_table like 'student\_fee\_%' or p_table like 'student_fee_plans' then 'fees'
    when p_table in ('exam_components', 'result_groups', 'result_group_members', 'marks', 'grade_bands', 'grade_entries', 'subject_pass_marks', 'report_remarks',
                     'report_card_prints', 'subject_results', 'student_results', 'exam_class_modes', 'exam_subject_max', 'descriptive_grades', 'remark_bank') then 'marks'
    when p_table in ('attendance_sessions', 'student_attendance', 'staff_attendance', 'leave_requests', 'leave_balances', 'leave_types') then 'attendance'
    when p_table in ('staff', 'staff_permissions', 'teacher_assignments', 'timetable_entries', 'timetable_substitutions', 'bell_schedules', 'bell_periods', 'class_bell_schedules') then 'staff'
    else 'other'
  end
$$;

create or replace function app.audit_table_label(p_table text) returns text
language sql immutable set search_path = '' as $$
  select coalesce((select v from (values
    ('students','student'),('student_profiles','student details'),('student_secure_values','student ID numbers'),('guardians','parent / guardian'),
    ('student_guardians','parent link'),('student_enrollments','class placement'),('student_documents','student document'),
    ('fee_receipts','fee receipt'),('fee_receipt_items','receipt line'),('student_fee_dues','fee due'),('fee_heads','fee head'),('fee_plans','fee plan'),
    ('fee_structure','fee amount'),('fee_concessions','concession'),('fee_campaigns','fee campaign'),('fee_settings','fee settings'),
    ('exam_components','exam'),('result_groups','result'),('result_group_members','result part'),('marks','mark'),('grade_bands','grade scale'),
    ('grade_entries','grade'),('subject_pass_marks','pass mark'),('report_remarks','report remark'),('report_card_prints','report card print'),
    ('attendance_sessions','attendance session'),('student_attendance','student attendance'),('staff_attendance','staff attendance'),
    ('leave_requests','leave request'),('leave_balances','leave balance'),('staff','staff member'),('staff_permissions','duty'),
    ('teacher_assignments','teaching assignment'),('timetable_entries','timetable period'),('timetable_substitutions','substitution'),
    ('notices','notice'),('diary_entries','diary entry'),('school_settings','school settings'),('academic_years','academic year'),
    ('classes','class'),('sections','section'),('subjects','subject'),('holidays','holiday'),('reports','report'),('auth','sign-in')
  ) t(k, v) where k = p_table), replace(coalesce(p_table, 'record'), '_', ' '))
$$;

-- Keys whose values are identity numbers or secrets: never shown, whoever asks.
create or replace function app.audit_clean(j jsonb, p_noise boolean default true) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  k text; v jsonb; out jsonb := '{}'::jsonb; arr jsonb := '[]'::jsonb;
begin
  if j is null then return null; end if;
  case jsonb_typeof(j)
    when 'object' then
      for k, v in select * from jsonb_each(j) loop
        if p_noise and k in ('created_at', 'updated_at', 'created_by', 'updated_by', 'is_demo') then continue; end if;
        if k ~* '(password|passwd|secret|token|api_?key|value_enc|_enc$)' then
          out := out || jsonb_build_object(k, '[hidden]');
        elsif k ~* '(aadhaar|aadhar|udid|ration|passport|voter|bank|account_no|ifsc|(^|_)pan(_|$)|govt|government_id)' and jsonb_typeof(v) = 'string' then
          out := out || jsonb_build_object(k, case when length(v #>> '{}') > 4 then 'XXXXXXXX' || right(v #>> '{}', 4) else '[hidden]' end);
        else
          out := out || jsonb_build_object(k, app.audit_clean(v, p_noise));
        end if;
      end loop;
      return out;
    when 'array' then
      for v in select * from jsonb_array_elements(j) loop arr := arr || jsonb_build_array(app.audit_clean(v, p_noise)); end loop;
      return arr;
    when 'string' then
      -- any 12-digit run looks like an Aadhaar-type number: show the last four only
      return to_jsonb(regexp_replace(j #>> '{}', '(^|[^0-9])[0-9]{8}([0-9]{4})([^0-9]|$)', '\1XXXXXXXX\2\3', 'g'));
    else return j;
  end case;
end $$;

-- Only the fields that really changed (insert: what was set; delete: what was there), already cleaned
create or replace function app.audit_changes(p_old jsonb, p_new jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  with o as (select app.audit_clean(p_old) j), n as (select app.audit_clean(p_new) j),
  keys as (select k from o, n, jsonb_object_keys(coalesce(o.j, '{}'::jsonb) || coalesce(n.j, '{}'::jsonb)) k)
  select coalesce(jsonb_agg(jsonb_build_object('field', replace(k, '_', ' '), 'before', o.j -> k, 'after', n.j -> k) order by k), '[]'::jsonb)
  from (select k from keys order by k limit 40) kk, o, n
  where (o.j -> kk.k) is distinct from (n.j -> kk.k)
    and not (p_old is null and (n.j -> kk.k) = 'null'::jsonb)
    and not (p_new is null and (o.j -> kk.k) = 'null'::jsonb)
    and kk.k <> 'id'
$$;

create or replace function app.audit_verb(p_action text) returns text
language sql immutable set search_path = '' as $$
  select case p_action when 'insert' then 'Added' when 'update' then 'Changed' when 'delete' then 'Removed' else p_action end
$$;

-- One entry as the Admin sees it (everything already cleaned and masked)
create or replace function app.audit_shape(a public.audit_logs, p_actor_name text, p_with_changes boolean default true) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  d jsonb := coalesce(a.new_data, a.old_data, '{}'::jsonb);
  lbl text := nullif(coalesce(d ->> 'full_name', d ->> 'name', d ->> 'receipt_no', d ->> 'title', d ->> 'admission_no', d ->> 'employee_code'), '');
  tl text := app.audit_table_label(a.table_name);
  summ text;
begin
  if a.action in ('insert', 'update', 'delete') then
    summ := app.audit_verb(a.action) || ' ' || tl || coalesce(' ' || lbl, '');
    if a.table_name = 'fee_receipts' and a.action = 'update' and a.old_data ->> 'status' = 'valid' and a.new_data ->> 'status' = 'cancelled' then
      summ := 'Cancelled receipt ' || coalesce(lbl, '') || ' — ' || coalesce(a.new_data ->> 'cancel_reason', 'no reason given');
    elsif a.table_name in ('exam_components', 'result_groups') and a.action = 'update' and a.old_data ->> 'locked_at' is not null and a.new_data ->> 'locked_at' is null then
      summ := 'Unlocked ' || tl || coalesce(' ' || lbl, '') || coalesce(' — ' || nullif(a.new_data ->> 'lock_note', ''), '');
    elsif a.table_name in ('exam_components', 'result_groups') and a.action = 'update' and a.old_data ->> 'locked_at' is null and a.new_data ->> 'locked_at' is not null then
      summ := 'Locked ' || tl || coalesce(' ' || lbl, '');
    end if;
  elsif a.action = 'auth.login' then summ := 'Signed in';
  elsif a.action = 'auth.login_failed' then summ := 'Failed sign-in for ' || coalesce(a.details ->> 'email', 'unknown address');
  elsif a.action = 'student.ids_revealed' then summ := 'Full ID numbers viewed for a student';
  elsif a.action like 'report.%' then
    summ := case a.action when 'report.export' then 'Exported ' when 'report.print' then 'Printed ' else 'Viewed ' end
            || 'report ' || coalesce(a.details ->> 'report', '') || coalesce(' (' || (a.details ->> 'rows') || ' rows)', '');
  elsif a.action = 'fee.receipt_reprinted' then summ := 'Receipt reprinted';
  else summ := replace(replace(a.action, '.', ' '), '_', ' ');
  end if;
  return jsonb_build_object(
    'id', a.id, 'at', a.occurred_at, 'actor_id', a.actor_user_id, 'actor_name', p_actor_name, 'actor_role', a.actor_role,
    'action', a.action, 'kind', app.audit_group(a.action, a.table_name), 'table', a.table_name, 'table_label', tl,
    'record_id', a.record_id, 'record_label', lbl, 'summary', summ,
    'changes', case when p_with_changes and a.action in ('insert', 'update', 'delete') then app.audit_changes(a.old_data, a.new_data) else '[]'::jsonb end,
    'details', app.audit_clean(a.details, false));
end $$;

create or replace function app.require_audit_admin() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not app.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
end $$;

-- who an entry's actor was (also people who have left, or whose login was removed)
create or replace function app.audit_actor_name(p_user uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when p_user is null then 'Not signed in'
              else coalesce((select s.full_name from public.staff s where s.user_id = p_user), 'Former staff member') end
$$;
revoke execute on function app.audit_actor_name(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------ 5. the list, with filters (Admin only)
create or replace function app.audit_filtered(p_from timestamptz, p_to timestamptz, p_actor uuid, p_group text, p_table text, p_record text, p_search text)
returns setof public.audit_logs
language sql stable security definer set search_path = '' as $$
  select a.* from public.audit_logs a
   where a.occurred_at >= coalesce(p_from, now() - interval '7 days') and a.occurred_at < coalesce(p_to, now() + interval '1 minute')
     and (p_actor is null or a.actor_user_id = p_actor)
     and (p_group is null or p_group = '' or p_group = 'all' or app.audit_group(a.action, a.table_name) = p_group)
     and (p_table is null or a.table_name = p_table)
     and (p_record is null or a.record_id = p_record)
     and (p_search is null or p_search = '' or a.action ilike '%' || p_search || '%' or a.table_name ilike '%' || p_search || '%'
          or app.audit_clean(coalesce(a.new_data, a.old_data, '{}'::jsonb))::text ilike '%' || p_search || '%'
          or coalesce(a.details::text, '') ilike '%' || p_search || '%')
$$;
revoke execute on function app.audit_filtered(timestamptz, timestamptz, uuid, text, text, text, text) from public, anon, authenticated;

create or replace function public.audit_entries(
  p_from timestamptz default null, p_to timestamptz default null, p_actor uuid default null, p_group text default null,
  p_table text default null, p_record text default null, p_search text default null, p_limit integer default 100, p_offset integer default 0)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb; total bigint; lim int := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  perform app.require_audit_admin();
  select count(*) into total from app.audit_filtered(p_from, p_to, p_actor, p_group, p_table, p_record, p_search);
  select coalesce(jsonb_agg(app.audit_shape(x, app.audit_actor_name(x.actor_user_id)) order by x.occurred_at desc, x.id desc), '[]'::jsonb) into r
    from (select * from app.audit_filtered(p_from, p_to, p_actor, p_group, p_table, p_record, p_search) f
           order by f.occurred_at desc, f.id desc limit lim offset greatest(coalesce(p_offset, 0), 0)) x;
  return jsonb_build_object('total', total, 'limit', lim, 'offset', greatest(coalesce(p_offset, 0), 0), 'rows', r);
end $$;

-- every change to one record (a student, a receipt, a staff member...), newest first
create or replace function public.audit_record_history(p_table text, p_record text, p_limit integer default 200) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform app.require_audit_admin();
  select coalesce(jsonb_agg(app.audit_shape(x, app.audit_actor_name(x.actor_user_id)) order by x.occurred_at desc, x.id desc), '[]'::jsonb) into r
    from (select * from public.audit_logs a where a.table_name = p_table and a.record_id = p_record order by a.occurred_at desc, a.id desc limit least(greatest(coalesce(p_limit, 200), 1), 500)) x;
  return r;
end $$;

-- the "person" filter: everyone who appears in the log, including people who have left
create or replace function public.audit_actors() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform app.require_audit_admin();
  select coalesce(jsonb_agg(jsonb_build_object('user_id', a.actor_user_id, 'name', app.audit_actor_name(a.actor_user_id), 'role', a.role, 'last_at', a.last_at,
                                               'status', coalesce(s.status::text, 'removed')) order by a.last_at desc), '[]'::jsonb) into r
    from (select actor_user_id, (array_agg(actor_role order by occurred_at desc))[1] role, max(occurred_at) last_at
            from public.audit_logs where actor_user_id is not null group by actor_user_id) a
    left join public.staff s on s.user_id = a.actor_user_id;
  return r;
end $$;

-- Export of the filtered entries. The export is written to the log in the same call, so it can never be skipped. IDs stay masked.
create or replace function public.audit_export(
  p_format text, p_from timestamptz default null, p_to timestamptz default null, p_actor uuid default null, p_group text default null,
  p_table text default null, p_record text default null, p_search text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; n int;
begin
  perform app.require_audit_admin();
  if p_format not in ('csv', 'xlsx', 'print', 'pdf') then raise exception 'unknown format' using errcode = '23514'; end if;
  select coalesce(jsonb_agg(app.audit_shape(x, app.audit_actor_name(x.actor_user_id)) order by x.occurred_at desc, x.id desc), '[]'::jsonb), count(*)
    into r, n
    from (select * from app.audit_filtered(p_from, p_to, p_actor, p_group, p_table, p_record, p_search) f order by f.occurred_at desc, f.id desc limit 20000) x;
  perform public.log_report('audit-log', p_format,
    jsonb_build_object('from', p_from, 'to', p_to, 'person', p_actor, 'kind', p_group, 'table', p_table, 'record', p_record, 'search', left(p_search, 60)), n);
  return r;
end $$;

-- ------------------------------------------------------------------ 6. alerts for the Admin dashboard
-- "marks changed after publish/unlock": a mark was added/changed/removed for an exam that had been locked (published) and then unlocked earlier.
-- "failed sign-ins": 5 or more failures for one address within 15 minutes.
create or replace function app.audit_alerts(p_days integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  d int := least(greatest(coalesce(p_days, 7), 1), 90);
  since timestamptz := now() - make_interval(days => d);
  r jsonb;
begin
  with hits as (
    select 'ids_revealed' k, a.id, a.occurred_at, a.actor_user_id,
           'Full ID numbers ' || case when a.action = 'student.ids_revealed' then 'viewed' else 'exported (government export)' end t
      from public.audit_logs a
     where a.occurred_at >= since
       and (a.action = 'student.ids_revealed'
            or (a.action = 'report.export' and a.details ->> 'report' = 'government-export' and coalesce((a.details #>> '{filters,full_ids}')::boolean, false)))
    union all
    select 'receipts_cancelled', a.id, a.occurred_at, a.actor_user_id,
           'Receipt ' || coalesce(a.new_data ->> 'receipt_no', '') || ' — ' || coalesce(a.new_data ->> 'cancel_reason', 'no reason given')
      from public.audit_logs a
     where a.occurred_at >= since and a.table_name = 'fee_receipts' and a.action = 'update' and a.old_data ->> 'status' = 'valid' and a.new_data ->> 'status' = 'cancelled'
    union all
    select 'exams_unlocked', a.id, a.occurred_at, a.actor_user_id,
           'Unlocked ' || coalesce(a.new_data ->> 'name', 'exam') || coalesce(' — ' || nullif(a.new_data ->> 'lock_note', ''), '')
      from public.audit_logs a
     where a.occurred_at >= since and a.table_name in ('exam_components', 'result_groups') and a.action = 'update'
       and a.old_data ->> 'locked_at' is not null and a.new_data ->> 'locked_at' is null
    union all
    select 'marks_after_unlock', a.id, a.occurred_at, a.actor_user_id,
           'Mark ' || case a.action when 'insert' then 'added' when 'delete' then 'removed' else 'changed' end || ' after unlock'
      from public.audit_logs a
     where a.occurred_at >= since and a.table_name = 'marks'
       and exists (select 1 from public.audit_logs u
                    where u.table_name = 'exam_components' and u.action = 'update' and u.id < a.id
                      and u.record_id = coalesce(a.new_data, a.old_data) ->> 'component_id'
                      and u.old_data ->> 'locked_at' is not null and u.new_data ->> 'locked_at' is null)
    union all
    select 'failed_logins', f.id, f.occurred_at, null, 'Failed sign-in for ' || coalesce(f.details ->> 'email', '?')
      from (select a.id, a.occurred_at, a.details,
                   count(*) over (partition by a.details ->> 'email' order by a.occurred_at range between interval '15 minutes' preceding and current row) c
              from public.audit_logs a where a.action = 'auth.login_failed' and a.occurred_at >= since) f
     where f.c >= 5
    union all
    select 'duties_changed', a.id, a.occurred_at, a.actor_user_id,
           case a.action when 'insert' then 'Duty given: ' else 'Duty removed: ' end || coalesce(coalesce(a.new_data, a.old_data) ->> 'duty', '')
      from public.audit_logs a
     where a.occurred_at >= since and a.table_name = 'staff_permissions' and a.action in ('insert', 'delete')
    union all
    select 'roles_changed', a.id, a.occurred_at, a.actor_user_id,
           coalesce(a.new_data ->> 'full_name', 'Staff member') || ': ' || coalesce(a.old_data ->> 'app_role', 'none') || ' → ' || coalesce(a.new_data ->> 'app_role', 'none')
      from public.audit_logs a
     where a.occurred_at >= since and a.table_name = 'staff' and a.action = 'update' and (a.old_data ->> 'app_role') is distinct from (a.new_data ->> 'app_role')
    union all
    select 'staff_deactivated', a.id, a.occurred_at, a.actor_user_id,
           coalesce(a.new_data ->> 'full_name', 'Staff member') || ' → ' || (a.new_data ->> 'status')
      from public.audit_logs a
     where a.occurred_at >= since and a.table_name = 'staff' and a.action = 'update' and a.old_data ->> 'status' = 'active' and a.new_data ->> 'status' <> 'active'
  ), ranked as (
    select h.*, count(*) over (partition by k) total, row_number() over (partition by k order by occurred_at desc, id desc) rn from hits h
  )
  select jsonb_build_object('days', d, 'items', (
    select jsonb_agg(jsonb_build_object(
             'key', def.key, 'label', def.label, 'severity', def.severity,
             'count', coalesce((select max(total) from ranked where k = def.key), 0),
             'latest_at', (select max(occurred_at) from ranked where k = def.key),
             'rows', coalesce((select jsonb_agg(jsonb_build_object('at', x.occurred_at, 'who', app.audit_actor_name(x.actor_user_id), 'text', x.t) order by x.occurred_at desc)
                                 from ranked x where x.k = def.key and x.rn <= 10), '[]'::jsonb)) order by def.ord)
      from (values
        (1, 'ids_revealed',       'Full ID numbers viewed or exported',                                     'high'),
        (2, 'receipts_cancelled', 'Fee receipts cancelled',                                                 'high'),
        (3, 'exams_unlocked',     'Exams or results unlocked',                                              'high'),
        (4, 'marks_after_unlock', 'Marks changed after a result was published or an exam unlocked',         'high'),
        (5, 'failed_logins',      'Repeated failed sign-ins on one account',                                'high'),
        (6, 'duties_changed',     'Duties or fee access changed',                                           'medium'),
        (7, 'roles_changed',      'Staff roles changed',                                                    'medium'),
        (8, 'staff_deactivated',  'Staff deactivated',                                                      'medium')) def(ord, key, label, severity))
  ) into r;
  return r;
end $$;
revoke execute on function app.audit_alerts(integer) from public, anon, authenticated;

-- Admin only, callable on its own and also inside admin_dashboard()
create or replace function public.audit_alerts(p_days integer default 7) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.require_audit_admin();
  return app.audit_alerts(p_days);
end $$;

-- ------------------------------------------------------------------ 7. who may call what
do $$
declare f text;
begin
  foreach f in array array[
    'public.audit_entries(timestamptz, timestamptz, uuid, text, text, text, text, integer, integer)',
    'public.audit_record_history(text, text, integer)', 'public.audit_actors()',
    'public.audit_export(text, timestamptz, timestamptz, uuid, text, text, text, text)', 'public.audit_alerts(integer)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ------------------------------------------------------------------ 8. Admin dashboard carries the alerts (same function, one extra key)
create or replace function public.admin_dashboard(p_year uuid, p_today date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_staff uuid := app.current_staff_id();
  r jsonb;
begin
  if not app.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'counts', jsonb_build_object(
      'classes',  (select count(*) from public.classes where is_active),
      'sections', (select count(*) from public.sections where academic_year_id = p_year),
      'subjects', (select count(*) from public.subjects where is_active),
      'active_staff', (select count(*) from public.staff where status = 'active')),
    'unmarked', coalesce((select jsonb_agg(jsonb_build_object('section_id', u.section_id, 'section_label', u.section_label, 'session', u.session, 'staff_name', u.staff_name)) from public.unmarked_sessions(p_today) u), '[]'::jsonb),
    'pending_leave', (select count(*) from public.leave_requests where status = 'pending'),
    'notices', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', n.id, 'title', n.title, 'circular_no', n.circular_no, 'important', n.important, 'publish_date', n.publish_date,
               'read', exists (select 1 from public.notice_reads nr where nr.notice_id = n.id and nr.staff_id = v_staff),
               'read_count', c.read_count, 'total', c.total) order by n.publish_date desc, n.created_at desc)
        from (select * from public.notices
               where status = 'published' and archived_at is null and publish_date <= p_today and (expires_on is null or expires_on >= p_today)
               order by publish_date desc, created_at desc limit 60) n
        left join public.notice_read_counts() c on c.notice_id = n.id), '[]'::jsonb),
    'translation', (select jsonb_build_object('used', t.used, 'cap', t.cap) from public.translation_status() t limit 1),
    'exam', jsonb_build_object(
      'groups',   (select count(*) from public.result_groups where academic_year_id = p_year),
      'unlocked', (select count(*) from public.result_groups where academic_year_id = p_year and locked_at is null),
      'holidays', (select count(*) from public.holidays where academic_year_id = p_year and kind = 'declared')),
    'attendance_today', jsonb_build_object(
      'students_marked', (select count(*) from public.student_attendance where att_date = p_today),
      'students_present', (select count(*) from public.student_attendance where att_date = p_today and status in ('present', 'late'))),
    -- money numbers: only for someone with fee access (the Admin always; office staff when granted; never a teacher)
    'fees', case when app.has_fee_access() then jsonb_build_object(
      'collected_today_paise', (select coalesce(sum(total_paise), 0) from public.fee_receipts where receipt_date = p_today and status = 'valid'),
      'receipts_today', (select count(*) from public.fee_receipts where receipt_date = p_today and status = 'valid'),
      'overdue_paise', (select coalesce(sum(greatest(amount_paise - concession_paise - paid_paise, 0)), 0) from public.student_fee_dues where academic_year_id = p_year and voided_at is null and due_date <= p_today),
      'defaulters', (select count(distinct student_id) from public.student_fee_dues where academic_year_id = p_year and voided_at is null and due_date <= p_today and amount_paise - concession_paise - paid_paise > 0))
      else null end,
    -- Module 9: things the Admin should look at (last 7 days). Admin only: this whole function is Admin only.
    'alerts', app.audit_alerts(7),
    'diary', coalesce((
      select jsonb_agg(jsonb_build_object('section_id', s.id, 'label', c.name || ' – ' || s.name, 'class_order', c.sort_order,
               'expected', coalesce(b.expected, 0), 'submitted', coalesce(b.submitted, 0), 'published', coalesce(b.published, 0), 'pending', coalesce(b.pending, 0), 'skipped', coalesce(b.skipped, 0))
               order by c.sort_order, s.name)
        from public.sections s join public.classes c on c.id = s.class_id
        left join public.diary_board(p_today) b on b.section_id = s.id
       where s.academic_year_id = p_year), '[]'::jsonb)
  ) into r;
  return r;
end $$;
revoke execute on function public.admin_dashboard(uuid, date) from public, anon;
grant execute on function public.admin_dashboard(uuid, date) to authenticated;
