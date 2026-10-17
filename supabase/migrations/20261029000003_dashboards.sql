-- Admin dashboard: now with today's attendance, unlocked results and the fee numbers (fee numbers only with fee access).
-- Plus staff_dashboard(): ONE call for a teacher's or an office person's dashboard, scoped to what that person may see.
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

create or replace function public.staff_dashboard(p_year uuid, p_today date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := app.current_staff_id();
  role_ public.app_role := app.current_app_role();
  r jsonb;
begin
  if me is null or role_ = 'admin' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'counts', jsonb_build_object(
      'sections', (select count(*) from public.sections s where s.academic_year_id = p_year and (s.id = any (app.my_section_ids()))),
      'subjects', (select count(distinct a.subject_id) from public.teacher_assignments a join public.sections s on s.id = a.section_id where a.staff_id = me and s.academic_year_id = p_year),
      'students', (select count(*) from public.student_enrollments e join public.students st on st.id = e.student_id and st.status = 'active'
                    where e.academic_year_id = p_year and e.section_id = any (app.my_section_ids()))),
    'next_holiday', (select jsonb_build_object('date', h.date, 'name', h.name) from public.holidays h where h.academic_year_id = p_year and h.date >= p_today order by h.date limit 1),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('section_id', m.section_id, 'section_label', m.section_label, 'session', m.session, 'marked', m.marked)) from public.my_attendance_sessions(p_today) m), '[]'::jsonb),
    'unmarked', case when public.has_duty('all_class_attendance') then coalesce((select jsonb_agg(jsonb_build_object('section_id', u.section_id, 'section_label', u.section_label, 'session', u.session, 'staff_name', u.staff_name)) from public.unmarked_sessions(p_today) u), '[]'::jsonb) else null end,
    'notices', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'circular_no', n.circular_no, 'important', n.important, 'publish_date', n.publish_date,
               'read', exists (select 1 from public.notice_reads nr where nr.notice_id = n.id and nr.staff_id = me)) order by n.publish_date desc, n.created_at desc)
        from (select * from public.notices where status = 'published' and archived_at is null and publish_date <= p_today and (expires_on is null or expires_on >= p_today)
               order by publish_date desc, created_at desc limit 60) n), '[]'::jsonb),
    -- marks still to enter, for the teacher's own (section, subject) pairs and unlocked exams
    'marks_to_enter', coalesce((
      select jsonb_agg(jsonb_build_object('section_label', x.label, 'subject', x.subject, 'exam', x.exam, 'missing', x.missing) order by x.missing desc)
        from (
          select cl.name || ' – ' || sec.name as label, sub.name as subject, ec.name as exam,
                 (select count(*) from public.student_enrollments e join public.students st on st.id = e.student_id and st.status = 'active' where e.section_id = sec.id and e.academic_year_id = p_year)
                 - (select count(*) from public.marks mk where mk.component_id = ec.id and mk.section_id = sec.id and mk.subject_id = sub.id) as missing
            from public.teacher_assignments ta
            join public.sections sec on sec.id = ta.section_id and sec.academic_year_id = p_year
            join public.classes cl on cl.id = sec.class_id
            join public.subjects sub on sub.id = ta.subject_id and sub.type = 'scholastic'
            join public.exam_components ec on ec.class_id = sec.class_id and ec.academic_year_id = p_year and ec.locked_at is null
           where ta.staff_id = me and app.class_mode(p_year, sec.class_id) = 'marks'
        ) x where x.missing > 0), '[]'::jsonb),
    -- money numbers only with fee access (office staff the Admin picked; never a teacher)
    'fees', case when app.has_fee_access() then jsonb_build_object(
      'collected_today_paise', (select coalesce(sum(total_paise), 0) from public.fee_receipts where receipt_date = p_today and status = 'valid'),
      'receipts_today', (select count(*) from public.fee_receipts where receipt_date = p_today and status = 'valid'),
      'overdue_paise', (select coalesce(sum(greatest(amount_paise - concession_paise - paid_paise, 0)), 0) from public.student_fee_dues where academic_year_id = p_year and voided_at is null and due_date <= p_today))
      else null end
  ) into r;
  return r;
end $$;
revoke execute on function public.staff_dashboard(uuid, date) from public, anon;
grant execute on function public.staff_dashboard(uuid, date) to authenticated;
