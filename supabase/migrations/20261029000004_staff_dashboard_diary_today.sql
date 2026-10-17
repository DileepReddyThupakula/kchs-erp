-- staff_dashboard: also today's own periods and the diary still to submit, so a teacher's dashboard needs ONE call (the old diary card made five).
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
    -- today's own periods (for the "Today" strip)
    'today', coalesce((select jsonb_agg(jsonb_build_object('period_no', w.period_no, 'kind', w.kind, 'section_id', w.section_id, 'section_label', w.section_label,
                         'subject_name', w.subject_name, 'activity', w.activity, 'room', w.room, 'start_time', w.start_time, 'end_time', w.end_time, 'other_name', w.other_name)
                         order by w.period_no)
                       from public.my_week(date_trunc('week', p_today)::date) w where w.on_date = p_today), '[]'::jsonb),
    -- the diary still to submit today: the teacher's own (section, subject) pairs and the class remark of their own class
    'diary_sections', (select count(*) from public.sections s where s.academic_year_id = p_year and s.id = any (app.my_section_ids())),
    'diary_todo', coalesce((
      select jsonb_agg(jsonb_build_object('section_id', x.section_id, 'section_label', x.label, 'subject', x.subject, 'status', x.status, 'reminded', x.reminded) order by x.class_order, x.sec_name, x.subject nulls last)
        from (
          select p.section_id, cl.name || ' – ' || sec.name as label, cl.sort_order as class_order, sec.name as sec_name, sub.name as subject,
                 coalesce((select e.status from public.diary_entries e join public.diary_entry_sections es on es.entry_id = e.id
                            where es.section_id = p.section_id and e.entry_date = p_today and e.archived_at is null
                              and (e.author_id = me or e.status = 'published')
                              and (case when p.subject_id is null then e.kind = 'remark' else e.kind = 'subject' and e.subject_id = p.subject_id end)
                            order by (e.status = 'published') desc limit 1), 'new') as status,
                 exists (select 1 from public.my_diary_reminders() r where r.entry_date = p_today and r.section_id = p.section_id and r.subject_id is not distinct from p.subject_id) as reminded
            from (select ta.section_id, ta.subject_id from public.teacher_assignments ta where ta.staff_id = me
                  union
                  select s.id, null::uuid from public.sections s where s.class_teacher_id = me) p
            join public.sections sec on sec.id = p.section_id and sec.academic_year_id = p_year
            join public.classes cl on cl.id = sec.class_id
            left join public.subjects sub on sub.id = p.subject_id
        ) x where x.status in ('new', 'draft')), '[]'::jsonb),
    -- the class-diary board (pending / late classes) for the notices & diary duty
    'diary_board', case when public.has_duty('notices_diary') then coalesce((
      select jsonb_agg(jsonb_build_object('section_id', s.id, 'label', c.name || ' – ' || s.name, 'class_order', c.sort_order,
               'expected', coalesce(b.expected, 0), 'submitted', coalesce(b.submitted, 0), 'published', coalesce(b.published, 0), 'pending', coalesce(b.pending, 0), 'skipped', coalesce(b.skipped, 0))
               order by c.sort_order, s.name)
        from public.sections s join public.classes c on c.id = s.class_id
        left join public.diary_board(p_today) b on b.section_id = s.id
       where s.academic_year_id = p_year), '[]'::jsonb) else null end,
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
