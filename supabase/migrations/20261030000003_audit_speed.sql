-- Module 9: speed. Names are joined once instead of looked up per row; the search looks at the names / numbers shown, not at the whole record.
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
          or coalesce(a.new_data ->> 'full_name', a.old_data ->> 'full_name', '') ilike '%' || p_search || '%'
          or coalesce(a.new_data ->> 'name', a.old_data ->> 'name', '') ilike '%' || p_search || '%'
          or coalesce(a.new_data ->> 'title', a.old_data ->> 'title', '') ilike '%' || p_search || '%'
          or coalesce(a.new_data ->> 'receipt_no', a.old_data ->> 'receipt_no', '') ilike '%' || p_search || '%'
          or coalesce(a.new_data ->> 'admission_no', a.old_data ->> 'admission_no', '') ilike '%' || p_search || '%'
          or coalesce(a.new_data ->> 'employee_code', a.old_data ->> 'employee_code', '') ilike '%' || p_search || '%'
          or coalesce(a.details ->> 'email', a.details ->> 'report', '') ilike '%' || p_search || '%')
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
  select coalesce(jsonb_agg(app.audit_shape(x, case when x.actor_user_id is null then 'Not signed in' else coalesce(s.full_name, 'Former staff member') end) order by x.occurred_at desc, x.id desc), '[]'::jsonb) into r
    from (select * from app.audit_filtered(p_from, p_to, p_actor, p_group, p_table, p_record, p_search) f
           order by f.occurred_at desc, f.id desc limit lim offset greatest(coalesce(p_offset, 0), 0)) x
    left join public.staff s on s.user_id = x.actor_user_id;
  return jsonb_build_object('total', total, 'limit', lim, 'offset', greatest(coalesce(p_offset, 0), 0), 'rows', r);
end $$;

create or replace function public.audit_record_history(p_table text, p_record text, p_limit integer default 200) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb;
begin
  perform app.require_audit_admin();
  select coalesce(jsonb_agg(app.audit_shape(x, case when x.actor_user_id is null then 'Not signed in' else coalesce(s.full_name, 'Former staff member') end) order by x.occurred_at desc, x.id desc), '[]'::jsonb) into r
    from (select * from public.audit_logs a where a.table_name = p_table and a.record_id = p_record order by a.occurred_at desc, a.id desc limit least(greatest(coalesce(p_limit, 200), 1), 500)) x
    left join public.staff s on s.user_id = x.actor_user_id;
  return r;
end $$;

create or replace function public.audit_export(
  p_format text, p_from timestamptz default null, p_to timestamptz default null, p_actor uuid default null, p_group text default null,
  p_table text default null, p_record text default null, p_search text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb; n int;
begin
  perform app.require_audit_admin();
  if p_format not in ('csv', 'xlsx', 'print', 'pdf') then raise exception 'unknown format' using errcode = '23514'; end if;
  select coalesce(jsonb_agg(app.audit_shape(x, case when x.actor_user_id is null then 'Not signed in' else coalesce(s.full_name, 'Former staff member') end) order by x.occurred_at desc, x.id desc), '[]'::jsonb), count(*)
    into r, n
    from (select * from app.audit_filtered(p_from, p_to, p_actor, p_group, p_table, p_record, p_search) f order by f.occurred_at desc, f.id desc limit 10000) x
    left join public.staff s on s.user_id = x.actor_user_id;
  perform public.log_report('audit-log', p_format,
    jsonb_build_object('from', p_from, 'to', p_to, 'person', p_actor, 'kind', p_group, 'table', p_table, 'record', p_record, 'search', left(p_search, 60)), n);
  return r;
end $$;

