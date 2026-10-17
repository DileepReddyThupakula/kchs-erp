-- Admin dashboard in ONE database call (it used to need about 15 separate calls, each ~60-200 ms).
-- Admin only. It composes the existing functions, so every number is exactly what the page showed before.
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
      'holidays', (select count(*) from public.holidays where academic_year_id = p_year and kind = 'declared')),
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
