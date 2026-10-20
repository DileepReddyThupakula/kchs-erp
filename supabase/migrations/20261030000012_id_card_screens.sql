-- ID card screens: (1) each issued card is also on the student's own History, (2) a preview of what the cards will look like before they are issued.
create or replace function public.id_card_issue(p_students uuid[], p_overrides jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.current_staff_id();
  y public.academic_years;
  r record;
  num jsonb;
  cid uuid;
  bid uuid := gen_random_uuid();
  issued jsonb := '[]'::jsonb;
  skipped jsonb := '[]'::jsonb;
  first_no text; last_no text; n_issued int := 0; n_pending int := 0;
  reason text; lbl text; why text;
  ovr jsonb := coalesce(p_overrides, '{}'::jsonb);
begin
  perform app.require_idcard();
  if p_students is null or cardinality(p_students) = 0 then raise exception 'Choose the students' using errcode = '23514'; end if;
  if cardinality(p_students) > 500 then raise exception 'Issue at most 500 cards at a time' using errcode = '23514'; end if;
  if ovr <> '{}'::jsonb and not app.is_admin() then raise exception 'Only the Admin can issue a card without a photo' using errcode = '42501'; end if;
  select * into y from public.academic_years where is_current limit 1;
  if y.id is null then raise exception 'There is no current academic year' using errcode = '23514'; end if;
  perform pg_advisory_xact_lock(hashtext('idcard:' || y.id::text));
  insert into public.id_card_batches (id, academic_year_id, label, issued_count, skipped_count, issued_by) values (bid, y.id, 'batch', 0, 0, me);
  for r in
    select st.id, st.full_name, st.status, st.photo_path, st.is_demo, e.id enr, c.name cname, s.name sname
      from unnest(p_students) as u(id)
      join public.students st on st.id = u.id
      left join public.student_enrollments e on e.student_id = st.id and e.academic_year_id = y.id
      left join public.sections s on s.id = e.section_id left join public.classes c on c.id = s.class_id
     order by c.sort_order nulls last, s.name, e.roll_no nulls last, st.full_name
  loop
    why := case when r.status <> 'active' then 'Student has left'
                when r.enr is null then 'Not in a class this year'
                when exists (select 1 from public.id_cards k where k.student_id = r.id and k.academic_year_id = y.id and k.status = 'issued') then 'Already has a card'
                when r.photo_path is null and length(btrim(coalesce(ovr ->> r.id::text, ''))) < 3 then 'No photo' end;
    if why is not null then
      skipped := skipped || jsonb_build_object('student_id', r.id, 'name', r.full_name, 'reason', why);
      continue;
    end if;
    reason := case when r.photo_path is null then btrim(ovr ->> r.id::text) end;
    num := app.idcard_next_number(y.id);
    insert into public.id_cards (academic_year_id, seq, number, student_id, batch_id, payload, photo_pending, pending_reason, issued_by, is_demo)
    values (y.id, (num ->> 'seq')::int, num ->> 'number', r.id, bid, app.idcard_payload(r.id, y.id), reason is not null, reason, me, r.is_demo) returning id into cid;
    insert into public.id_card_prints (card_id, copy_no, printed_by) values (cid, 1, me);
    -- one entry on the student's own History (the batch has its own summary entry)
    perform public.log_event('idcard.card_issued', 'students', r.id::text, jsonb_build_object('summary', 'ID card ' || (num ->> 'number') || ' issued', 'number', num ->> 'number'));
    first_no := coalesce(first_no, num ->> 'number'); last_no := num ->> 'number'; n_issued := n_issued + 1; if reason is not null then n_pending := n_pending + 1; end if;
    issued := issued || jsonb_build_object('card_id', cid, 'student_id', r.id, 'name', r.full_name, 'number', num ->> 'number', 'class', r.cname, 'section', r.sname);
    lbl := coalesce(lbl, r.cname || ' ' || r.sname);
  end loop;
  lbl := coalesce(lbl, 'no cards');
  update public.id_card_batches set label = lbl, issued_count = n_issued, skipped_count = jsonb_array_length(skipped), number_from = first_no, number_to = last_no, photo_pending_count = n_pending where id = bid;
  if n_issued = 0 then
    delete from public.id_card_batches where id = bid;
    return jsonb_build_object('batch_id', null, 'issued', issued, 'skipped', skipped);
  end if;
  perform public.log_event('idcard.issue', 'id_card_batches', bid::text, jsonb_build_object(
    'summary', 'ID cards issued: ' || n_issued || ' (' || first_no || case when first_no <> last_no then ' to ' || last_no else '' end || ')' || ', ' || lbl || case when n_pending > 0 then ', ' || n_pending || ' with the photo pending' else '' end,
    'count', n_issued, 'skipped', jsonb_array_length(skipped), 'from', first_no, 'to', last_no, 'photo_pending', n_pending,
    'pending_reasons', (select coalesce(jsonb_agg(distinct pending_reason), '[]'::jsonb) from public.id_cards where batch_id = bid and photo_pending)));
  return jsonb_build_object('batch_id', bid, 'issued', issued, 'skipped', skipped);
end $$;


create or replace function public.id_card_preview(p_students uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare y public.academic_years; s public.id_card_settings;
begin
  perform app.require_idcard();
  if p_students is null or cardinality(p_students) = 0 or cardinality(p_students) > 500 then raise exception 'Choose 1 to 500 students' using errcode = '23514'; end if;
  select * into y from public.academic_years where is_current limit 1;
  select * into s from public.id_card_settings where id = 1;
  return jsonb_build_object('school', app.cert_school(), 'settings', jsonb_build_object('show_phone', s.show_phone, 'show_blood_group', s.show_blood_group),
    'cards', coalesce((select jsonb_agg(jsonb_build_object('card_id', null, 'number', null, 'qr', null, 'status', 'preview', 'year', pl ->> 'year',
        'name', pl ->> 'name', 'name_te', pl ->> 'name_te', 'class', pl ->> 'class', 'section', pl ->> 'section', 'admission_no', pl ->> 'admission_no',
        'phone', case when s.show_phone then pl ->> 'phone' end, 'blood_group', case when s.show_blood_group then pl ->> 'blood_group' end,
        'photo_path', st.photo_path, 'photo_pending', false) order by c.sort_order, sec.name, e.roll_no nulls last, st.full_name)
      from unnest(p_students) as u(id) join public.students st on st.id = u.id and st.status = 'active'
      join public.student_enrollments e on e.student_id = st.id and e.academic_year_id = y.id
      join public.sections sec on sec.id = e.section_id join public.classes c on c.id = sec.class_id
      cross join lateral (select app.idcard_payload(st.id, y.id) pl) q), '[]'::jsonb));
end $$;
revoke execute on function public.id_card_preview(uuid[]) from public, anon;
grant execute on function public.id_card_preview(uuid[]) to authenticated;
