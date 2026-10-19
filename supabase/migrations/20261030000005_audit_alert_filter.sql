-- Module 9: a dashboard card opens ONLY the entries that triggered it (p_alert). The alert window is now whole India days, so the card count and the page agree.
drop function if exists public.audit_entries(timestamptz, timestamptz, uuid, text, text, text, text, integer, integer);
drop function if exists public.audit_export(text, timestamptz, timestamptz, uuid, text, text, text, text);
drop function if exists app.audit_filtered(timestamptz, timestamptz, uuid, text, text, text, text);

-- Does this entry trigger the alert? (the same rules as app.audit_alerts, so a dashboard card and the page it opens always agree)
create or replace function app.audit_alert_match(a public.audit_logs, p_key text) returns boolean
language sql stable set search_path = '' as $$
  select case p_key
    when 'ids_revealed' then a.action = 'student.ids_revealed'
       or (a.action = 'report.export' and a.details ->> 'report' = 'government-export' and coalesce((a.details #>> '{filters,full_ids}')::boolean, false))
    when 'receipts_cancelled' then a.table_name = 'fee_receipts' and a.action = 'update' and a.old_data ->> 'status' = 'valid' and a.new_data ->> 'status' = 'cancelled'
    when 'exams_unlocked' then a.table_name in ('exam_components', 'result_groups') and a.action = 'update' and a.old_data ->> 'locked_at' is not null and a.new_data ->> 'locked_at' is null
    when 'marks_after_unlock' then a.table_name = 'marks' and exists (
         select 1 from public.audit_logs u
          where u.table_name = 'exam_components' and u.action = 'update' and u.id < a.id
            and u.record_id = coalesce(a.new_data, a.old_data) ->> 'component_id'
            and u.old_data ->> 'locked_at' is not null and u.new_data ->> 'locked_at' is null)
    when 'failed_logins' then a.action = 'auth.login_failed' and (
         select count(*) from public.audit_logs b
          where b.action = 'auth.login_failed' and b.details ->> 'email' = a.details ->> 'email'
            and b.occurred_at <= a.occurred_at and b.occurred_at >= a.occurred_at - interval '15 minutes') >= 5
    when 'duties_changed' then a.table_name = 'staff_permissions' and a.action in ('insert', 'delete')
    when 'roles_changed' then a.table_name = 'staff' and a.action = 'update' and (a.old_data ->> 'app_role') is distinct from (a.new_data ->> 'app_role')
    when 'staff_deactivated' then a.table_name = 'staff' and a.action = 'update' and a.old_data ->> 'status' = 'active' and a.new_data ->> 'status' <> 'active'
    else false end
$$;
revoke execute on function app.audit_alert_match(public.audit_logs, text) from public, anon, authenticated;

create or replace function app.audit_alerts(p_days integer) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  d int := least(greatest(coalesce(p_days, 7), 1), 90);
  since timestamptz := (date_trunc('day', now() at time zone 'Asia/Kolkata') - make_interval(days => d - 1)) at time zone 'Asia/Kolkata';  -- start of the day, d-1 days ago (India)
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

create or replace function app.audit_filtered(p_from timestamptz, p_to timestamptz, p_actor uuid, p_group text, p_table text, p_record text, p_search text, p_alert text default null)
returns setof public.audit_logs
language sql stable security definer set search_path = '' as $$
  select a.* from public.audit_logs a
   where a.occurred_at >= coalesce(p_from, now() - interval '7 days') and a.occurred_at < coalesce(p_to, now() + interval '1 minute')
     and (p_actor is null or a.actor_user_id = p_actor)
     and (p_group is null or p_group = '' or p_group = 'all' or a.kind = p_group)
     and (p_table is null or a.table_name = p_table)
     and (p_record is null or a.record_id = p_record)
     and (p_alert is null or p_alert = '' or app.audit_alert_match(a, p_alert))
     and (p_search is null or p_search = '' or a.action ilike '%' || p_search || '%' or a.table_name ilike '%' || p_search || '%'
          or coalesce(a.new_data ->> 'full_name', a.old_data ->> 'full_name', '') ilike '%' || p_search || '%'
          or coalesce(a.new_data ->> 'name', a.old_data ->> 'name', '') ilike '%' || p_search || '%'
          or coalesce(a.new_data ->> 'title', a.old_data ->> 'title', '') ilike '%' || p_search || '%'
          or coalesce(a.new_data ->> 'receipt_no', a.old_data ->> 'receipt_no', '') ilike '%' || p_search || '%'
          or coalesce(a.new_data ->> 'admission_no', a.old_data ->> 'admission_no', '') ilike '%' || p_search || '%'
          or coalesce(a.new_data ->> 'employee_code', a.old_data ->> 'employee_code', '') ilike '%' || p_search || '%'
          or coalesce(a.details ->> 'email', a.details ->> 'report', '') ilike '%' || p_search || '%')
$$;

revoke execute on function app.audit_filtered(timestamptz, timestamptz, uuid, text, text, text, text, text) from public, anon, authenticated;

create or replace function public.audit_entries(
  p_from timestamptz default null, p_to timestamptz default null, p_actor uuid default null, p_group text default null,
  p_table text default null, p_record text default null, p_search text default null, p_limit integer default 100, p_offset integer default 0, p_alert text default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb; total bigint; lim int := least(greatest(coalesce(p_limit, 100), 1), 500);
begin
  perform app.require_audit_admin();
  select count(*) into total from app.audit_filtered(p_from, p_to, p_actor, p_group, p_table, p_record, p_search, p_alert);
  select coalesce(jsonb_agg(app.audit_shape(x, case when x.actor_user_id is null then 'Not signed in' else coalesce(s.full_name, 'Former staff member') end) order by x.occurred_at desc, x.id desc), '[]'::jsonb) into r
    from (select * from app.audit_filtered(p_from, p_to, p_actor, p_group, p_table, p_record, p_search, p_alert) f
           order by f.occurred_at desc, f.id desc limit lim offset greatest(coalesce(p_offset, 0), 0)) x
    left join public.staff s on s.user_id = x.actor_user_id;
  return jsonb_build_object('total', total, 'limit', lim, 'offset', greatest(coalesce(p_offset, 0), 0), 'rows', r);
end $$;

create or replace function public.audit_export(
  p_format text, p_from timestamptz default null, p_to timestamptz default null, p_actor uuid default null, p_group text default null,
  p_table text default null, p_record text default null, p_search text default null, p_alert text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; n int;
begin
  perform app.require_audit_admin();
  if p_format not in ('csv', 'xlsx', 'print', 'pdf') then raise exception 'unknown format' using errcode = '23514'; end if;
  select coalesce(jsonb_agg(app.audit_shape(x, case when x.actor_user_id is null then 'Not signed in' else coalesce(s.full_name, 'Former staff member') end) order by x.occurred_at desc, x.id desc), '[]'::jsonb), count(*)
    into r, n
    from (select * from app.audit_filtered(p_from, p_to, p_actor, p_group, p_table, p_record, p_search, p_alert) f order by f.occurred_at desc, f.id desc limit 4000) x
    left join public.staff s on s.user_id = x.actor_user_id;
  perform public.log_report('audit-log', p_format,
    jsonb_build_object('from', p_from, 'to', p_to, 'person', p_actor, 'kind', p_group, 'table', p_table, 'record', p_record, 'search', left(p_search, 60), 'alert', p_alert), n);
  return r;
end $$;


revoke execute on function public.audit_entries(timestamptz, timestamptz, uuid, text, text, text, text, integer, integer, text) from public, anon;
grant execute on function public.audit_entries(timestamptz, timestamptz, uuid, text, text, text, text, integer, integer, text) to authenticated;
revoke execute on function public.audit_export(text, timestamptz, timestamptz, uuid, text, text, text, text, text) from public, anon;
grant execute on function public.audit_export(text, timestamptz, timestamptz, uuid, text, text, text, text, text) to authenticated;
