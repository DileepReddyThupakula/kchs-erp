-- Module 9: one export holds at most 4,000 entries (larger ones would run past the database time limit); the screen tells the Admin to narrow the date range.
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
    from (select * from app.audit_filtered(p_from, p_to, p_actor, p_group, p_table, p_record, p_search) f order by f.occurred_at desc, f.id desc limit 4000) x
    left join public.staff s on s.user_id = x.actor_user_id;
  perform public.log_report('audit-log', p_format,
    jsonb_build_object('from', p_from, 'to', p_to, 'person', p_actor, 'kind', p_group, 'table', p_table, 'record', p_record, 'search', left(p_search, 60)), n);
  return r;
end $$;

