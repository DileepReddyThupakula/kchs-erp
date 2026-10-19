-- Module 9: the kind of an entry is stored once (generated column) so the "kind" filter is an index lookup, not a calculation on every row.
-- (Filtering 50,000 demo entries by kind took 3-4 seconds; now it is an index scan.) Entries are not changed: the value is derived from action + table.
alter table public.audit_logs add column if not exists kind text generated always as (app.audit_group(action, table_name)) stored;
create index if not exists audit_logs_kind_time_idx on public.audit_logs (kind, occurred_at desc);

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
    'action', a.action, 'kind', a.kind, 'table', a.table_name, 'table_label', tl,
    'record_id', a.record_id, 'record_label', lbl, 'summary', summ,
    'changes', case when p_with_changes and a.action in ('insert', 'update', 'delete') then app.audit_changes(a.old_data, a.new_data) else '[]'::jsonb end,
    'details', app.audit_clean(a.details, false));
end $$;

create or replace function app.audit_filtered(p_from timestamptz, p_to timestamptz, p_actor uuid, p_group text, p_table text, p_record text, p_search text)
returns setof public.audit_logs
language sql stable security definer set search_path = '' as $$
  select a.* from public.audit_logs a
   where a.occurred_at >= coalesce(p_from, now() - interval '7 days') and a.occurred_at < coalesce(p_to, now() + interval '1 minute')
     and (p_actor is null or a.actor_user_id = p_actor)
     and (p_group is null or p_group = '' or p_group = 'all' or a.kind = p_group)
     and (p_table is null or a.table_name = p_table)
     and (p_record is null or a.record_id = p_record)
     and (p_search is null or p_search = '' or a.action ilike '%' || p_search || '%' or a.table_name ilike '%' || p_search || '%'
          or app.audit_clean(coalesce(a.new_data, a.old_data, '{}'::jsonb))::text ilike '%' || p_search || '%'
          or coalesce(a.details::text, '') ilike '%' || p_search || '%')
$$;

revoke execute on function app.audit_filtered(timestamptz, timestamptz, uuid, text, text, text, text) from public, anon, authenticated;

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
    from (select * from app.audit_filtered(p_from, p_to, p_actor, p_group, p_table, p_record, p_search) f order by f.occurred_at desc, f.id desc limit 10000) x;
  perform public.log_report('audit-log', p_format,
    jsonb_build_object('from', p_from, 'to', p_to, 'person', p_actor, 'kind', p_group, 'table', p_table, 'record', p_record, 'search', left(p_search, 60)), n);
  return r;
end $$;

