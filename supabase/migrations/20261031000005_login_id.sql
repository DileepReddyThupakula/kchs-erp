-- Login IDs: staff may sign in with a mobile number or a username as well as an email (the Admin creates every login and sets every
-- password; no email, no SMS). The login ID lives in its own table so that only the Admin (and the person themself) can read it:
-- the staff table itself is readable by all office staff, and a mobile number must not be.
-- Also: the failed sign-in log keeps a keyed hash per login ID (made by the server), a per-login-ID lock (10 failures in 15 minutes),
-- and masked login IDs in the audit log.

-- ---------------------------------------------------------------- 1. staff_logins
create table public.staff_logins (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null unique references public.staff (id) on delete cascade,
  login_id   text not null,
  kind       text not null check (kind in ('email', 'mobile', 'username')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  check (login_id = lower(login_id) and login_id !~ '\s' and length(login_id) between 3 and 120),
  check ((kind = 'mobile') = (login_id ~ '^[6-9][0-9]{9}$')),
  check ((kind = 'email') = (position('@' in login_id) > 0))
);
create unique index staff_logins_login_id_key on public.staff_logins (login_id);
alter table public.staff_logins enable row level security;
create policy staff_logins_select on public.staff_logins for select to authenticated
  using ((select app.is_admin()) or staff_id = (select app.current_staff_id()));
create policy staff_logins_insert on public.staff_logins for insert to authenticated with check ((select app.is_admin()));
create policy staff_logins_update on public.staff_logins for update to authenticated using ((select app.is_admin())) with check ((select app.is_admin()));
create policy staff_logins_delete on public.staff_logins for delete to authenticated using ((select app.is_admin()));
revoke all on public.staff_logins from public, anon;
grant select, insert, update, delete on public.staff_logins to authenticated;
select app.attach_std_triggers('public.staff_logins');
comment on table public.staff_logins is 'The login ID of each staff login (email, 10-digit mobile number, or username). Readable only by the Admin and by the person themself: office staff can read the staff table but NOT this one.';

-- everyone who already has a login keeps their email as the login ID
insert into public.staff_logins (staff_id, login_id, kind)
select s.id, lower(u.email), 'email' from public.staff s join auth.users u on u.id = s.user_id
 where u.email is not null and position('@' in u.email) > 0 and u.email not like '%@login.kchs.invalid';

-- ---------------------------------------------------------------- 2. failed sign-ins: keyed hash, label, per-login-ID lock
drop function if exists public.log_failed_login(text, text, text);
create or replace function public.log_failed_login(p_key text, p_label text, p_known boolean, p_ip text default null, p_user_agent text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  k   text := lower(trim(coalesce(p_key, '')));
  lbl text := left(regexp_replace(trim(coalesce(p_label, '')), '[[:cntrl:]]', '', 'g'), 120);
  ip  text := nullif(left(trim(coalesce(p_ip, '')), 45), '');
  ua  text := nullif(left(regexp_replace(coalesce(p_user_agent, ''), '[[:cntrl:]]', '', 'g'), 200), '');
begin
  if k !~ '^[0-9a-f]{32}$' or lbl = '' then return; end if;
  -- throttle so the log cannot be flooded: per IP (10 a minute, 60 an hour), per login ID (20 an hour), and a high overall ceiling
  if ip is not null then
    if (select count(*) from public.audit_logs where action = 'auth.login_failed' and details ->> 'ip' = ip and occurred_at > now() - interval '1 minute') >= 10 then return; end if;
    if (select count(*) from public.audit_logs where action = 'auth.login_failed' and details ->> 'ip' = ip and occurred_at > now() - interval '1 hour') >= 60 then return; end if;
  end if;
  if (select count(*) from public.audit_logs where action = 'auth.login_failed' and details ->> 'key' = k and occurred_at > now() - interval '1 hour') >= 20 then return; end if;
  if (select count(*) from public.audit_logs where action = 'auth.login_failed' and occurred_at > now() - interval '1 minute') >= 300 then return; end if;
  insert into public.audit_logs (actor_user_id, actor_role, action, table_name, record_id, details)
  values (null, null, 'auth.login_failed', 'auth', null,
          jsonb_strip_nulls(jsonb_build_object('email', lbl, 'key', k, 'known_account', coalesce(p_known, false), 'ip', ip, 'user_agent', ua)));
  -- the tenth failure in 15 minutes locks this login ID for the rest of that window; the lock is written once, so the alerts can show it
  if (select count(*) from public.audit_logs where action = 'auth.login_failed' and details ->> 'key' = k and occurred_at > now() - interval '15 minutes') >= 10
     and not exists (select 1 from public.audit_logs where action = 'auth.login_locked' and details ->> 'key' = k and occurred_at > now() - interval '15 minutes') then
    insert into public.audit_logs (actor_user_id, actor_role, action, table_name, record_id, details)
    values (null, null, 'auth.login_locked', 'auth', null, jsonb_strip_nulls(jsonb_build_object('email', lbl, 'key', k, 'known_account', coalesce(p_known, false), 'ip', ip)));
  end if;
end $$;
revoke execute on function public.log_failed_login(text, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.log_failed_login(text, text, boolean, text, text) to service_role;

-- is this login ID locked right now? (10 failures in the last 15 minutes). Asked by the sign-in screen's server before it tries the password.
create or replace function public.login_is_locked(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select count(*) >= 10 from public.audit_logs
   where action = 'auth.login_failed' and details ->> 'key' = lower(coalesce(p_key, '')) and occurred_at > now() - interval '15 minutes'
$$;
revoke execute on function public.login_is_locked(text) from public, anon, authenticated;
grant execute on function public.login_is_locked(text) to service_role;
create index if not exists audit_logs_failed_key_idx on public.audit_logs ((details ->> 'key'), occurred_at desc) where action in ('auth.login_failed', 'auth.login_locked');

-- an entry in the audit log for something done from the owner's computer (the emergency Admin password reset script)
create or replace function public.log_script_event(p_action text, p_details jsonb default '{}'::jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_action not in ('staff.password_reset_script') then raise exception 'unknown script event' using errcode = '22023'; end if;
  insert into public.audit_logs (actor_user_id, actor_role, action, table_name, record_id, details)
  values (null, null, p_action, 'staff', null, coalesce(p_details, '{}'::jsonb) - 'password');
end $$;
revoke execute on function public.log_script_event(text, jsonb) from public, anon, authenticated;
grant execute on function public.log_script_event(text, jsonb) to service_role;

-- ---------------------------------------------------------------- 3. audit log: masked mobile login IDs, lock entries in the alerts
CREATE OR REPLACE FUNCTION app.audit_clean(j jsonb, p_noise boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  k text; v jsonb; out jsonb := '{}'::jsonb; arr jsonb := '[]'::jsonb;
begin
  if j is null then return null; end if;
  case jsonb_typeof(j)
    when 'object' then
      for k, v in select * from jsonb_each(j) loop
        if p_noise and k in ('created_at', 'updated_at', 'created_by', 'updated_by', 'is_demo') then continue; end if;
        if k = 'login_id' and jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^[0-9]{10}$' then
          out := out || jsonb_build_object(k, '******' || right(v #>> '{}', 4));
        elsif k ~* '(password|passwd|secret|token|api_?key|value_enc|_enc$)' then
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
end $function$;

CREATE OR REPLACE FUNCTION app.audit_alert_match(a audit_logs, p_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
    when 'failed_logins' then a.action in ('auth.login_failed', 'auth.login_locked') and (
         select count(*) from public.audit_logs b
          where b.action = 'auth.login_failed' and coalesce(b.details ->> 'key', b.details ->> 'email') = coalesce(a.details ->> 'key', a.details ->> 'email')
            and b.occurred_at <= a.occurred_at and b.occurred_at >= a.occurred_at - interval '15 minutes') >= 5
    when 'duties_changed' then a.table_name = 'staff_permissions' and a.action in ('insert', 'delete')
    when 'roles_changed' then a.table_name = 'staff' and a.action = 'update' and (a.old_data ->> 'app_role') is distinct from (a.new_data ->> 'app_role')
    when 'staff_deactivated' then a.table_name = 'staff' and a.action = 'update' and a.old_data ->> 'status' = 'active' and a.new_data ->> 'status' <> 'active'
    when 'certificates_look' then a.action = 'certificate.cancel' or (a.action = 'certificate.print' and coalesce((a.details ->> 'duplicate')::boolean, false)) or (a.action = 'certificate.issue' and coalesce((a.details ->> 'override')::boolean, false))
    when 'idcards_look' then a.action = 'idcard.replace' or (a.action = 'idcard.issue' and coalesce((a.details ->> 'photo_pending')::int, 0) > 0)
    else false end
$function$;

CREATE OR REPLACE FUNCTION app.audit_alerts(p_days integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    select 'failed_logins', f.id, f.occurred_at, null, case when f.action = 'auth.login_locked' then 'Sign-in locked for 15 minutes: ' else 'Failed sign-in for ' end || coalesce(f.details ->> 'email', '?')
      from (select a.id, a.occurred_at, a.action, a.details,
                   count(*) over (partition by coalesce(a.details ->> 'key', a.details ->> 'email') order by a.occurred_at range between interval '15 minutes' preceding and current row) c
              from public.audit_logs a where a.action in ('auth.login_failed', 'auth.login_locked') and a.occurred_at >= since) f
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
    select 'certificates_look', a.id, a.occurred_at, a.actor_user_id, coalesce(a.details ->> 'summary', 'Certificate entry')
      from public.audit_logs a
     where a.occurred_at >= since
       and (a.action = 'certificate.cancel' or (a.action = 'certificate.print' and coalesce((a.details ->> 'duplicate')::boolean, false)) or (a.action = 'certificate.issue' and coalesce((a.details ->> 'override')::boolean, false)))
    union all
    select 'idcards_look', a.id, a.occurred_at, a.actor_user_id, coalesce(a.details ->> 'summary', 'ID card entry')
      from public.audit_logs a
     where a.occurred_at >= since and (a.action = 'idcard.replace' or (a.action = 'idcard.issue' and coalesce((a.details ->> 'photo_pending')::int, 0) > 0))
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
        (8, 'staff_deactivated',  'Staff deactivated',                                                      'medium'),
        (9, 'certificates_look',  'Certificates worth a look: duplicates, TC overrides, cancellations',      'medium'),
        (10, 'idcards_look',      'ID cards worth a look: replaced cards and photo-pending overrides',     'medium')) def(ord, key, label, severity))
  ) into r;
  return r;
end $function$;

CREATE OR REPLACE FUNCTION app.audit_shape(a audit_logs, p_actor_name text, p_with_changes boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
  elsif a.action = 'auth.login_locked' then summ := 'Sign-in locked for 15 minutes: ' || coalesce(a.details ->> 'email', 'unknown address');
  elsif a.action = 'auth.password_changed' then summ := 'Chose their own password';
  elsif a.action = 'staff.login_id_changed' then summ := 'Login ID changed: ' || coalesce(a.details ->> 'from', '?') || ' → ' || coalesce(a.details ->> 'to', '?');
  elsif a.action = 'staff.password_reset_script' then summ := 'Admin password reset from the owner''s computer';
  elsif a.action = 'student.ids_revealed' then summ := 'Full ID numbers viewed for a student';
  elsif a.action like 'report.%' then
    summ := case a.action when 'report.export' then 'Exported ' when 'report.print' then 'Printed ' else 'Viewed ' end
            || 'report ' || coalesce(a.details ->> 'report', '') || coalesce(' (' || (a.details ->> 'rows') || ' rows)', '');
  elsif a.action like 'rollover.%' or a.action like 'certificate.%' or a.action like 'idcard.%' or a.action like 'student.photo%' then summ := coalesce(a.details ->> 'summary', 'Year rollover or certificate') || coalesce(' (' || (a.details ->> 'students_affected') || ' students)', '');
  elsif a.action = 'fee.receipt_reprinted' then summ := 'Receipt reprinted';
  else summ := replace(replace(a.action, '.', ' '), '_', ' ');
  end if;
  return jsonb_build_object(
    'id', a.id, 'at', a.occurred_at, 'actor_id', a.actor_user_id, 'actor_name', p_actor_name, 'actor_role', a.actor_role,
    'action', a.action, 'kind', a.kind, 'table', a.table_name, 'table_label', tl,
    'record_id', a.record_id, 'record_label', lbl, 'summary', summ,
    'changes', case when p_with_changes and a.action in ('insert', 'update', 'delete') then app.audit_changes(a.old_data, a.new_data) else '[]'::jsonb end,
    'details', app.audit_clean(a.details, false));
end $function$;
