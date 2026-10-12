-- =====================================================================
-- Students Part 2: atomic save + bulk ID export (Admin)
-- =====================================================================

-- Save a student in ONE transaction: core record, this year's enrolment,
-- guardians (or the sibling's guardians), government fields, encrypted IDs.
-- SECURITY INVOKER: every statement runs under the caller's RLS, so only
-- Admin / student_records can use it. Status is never changed here.
--
-- p = {
--   id?:                 uuid (omit to create)
--   student:             { admission_no?, full_name, gender, date_of_birth, admission_date?,
--                          address?, village_town?, district?, pincode? }
--   enrollment?:         { academic_year_id, section_id, roll_no? }
--   guardians?:          [ { guardian_id?, relation, full_name, phone?, alt_phone?, email?,
--                            occupation?, education?, address?, pincode?, is_primary? } ]
--   sibling_admission_no?: text   (share that student's guardians)
--   details?:            { <field_key>: value }   (replaces the whole profile)
--   secure?:             { <sensitive field_key>: text }   ("" clears; omitted = unchanged)
-- }
create function public.save_student(p jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  sid  uuid := app.uuid_or_null(p ->> 'id');
  s    jsonb := coalesce(p -> 'student', '{}');
  e    jsonb := p -> 'enrollment';
  g    jsonb;
  gid  uuid;
  sib  uuid;
  k    text;
  v    text;
begin
  if not app.can_manage_students() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if sid is null then
    insert into public.students (admission_no, full_name, gender, date_of_birth, admission_date, address, village_town, district, pincode)
    values (nullif(trim(s ->> 'admission_no'), ''), trim(s ->> 'full_name'), s ->> 'gender', (s ->> 'date_of_birth')::date,
            coalesce(nullif(s ->> 'admission_date', '')::date, current_date),
            nullif(trim(s ->> 'address'), ''), nullif(trim(s ->> 'village_town'), ''), nullif(trim(s ->> 'district'), ''), nullif(trim(s ->> 'pincode'), ''))
    returning id into sid;
  else
    update public.students set
      admission_no   = coalesce(upper(nullif(trim(s ->> 'admission_no'), '')), admission_no),
      full_name      = trim(s ->> 'full_name'),
      gender         = s ->> 'gender',
      date_of_birth  = (s ->> 'date_of_birth')::date,
      admission_date = coalesce(nullif(s ->> 'admission_date', '')::date, admission_date),
      address        = nullif(trim(s ->> 'address'), ''),
      village_town   = nullif(trim(s ->> 'village_town'), ''),
      district       = nullif(trim(s ->> 'district'), ''),
      pincode        = nullif(trim(s ->> 'pincode'), '')
    where id = sid;
    if not found then
      raise exception 'Student not found' using errcode = 'P0002';
    end if;
  end if;

  -- enrolment for the given year (one per year; section change keeps history per year)
  if e is not null and app.uuid_or_null(e ->> 'section_id') is not null then
    insert into public.student_enrollments (student_id, academic_year_id, section_id, roll_no)
    values (sid, (e ->> 'academic_year_id')::uuid, (e ->> 'section_id')::uuid, nullif(e ->> 'roll_no', '')::int)
    on conflict (student_id, academic_year_id)
      do update set section_id = excluded.section_id, roll_no = excluded.roll_no;
  end if;

  -- share a sibling's guardians
  if nullif(trim(p ->> 'sibling_admission_no'), '') is not null then
    select id into sib from public.students where admission_no = upper(trim(p ->> 'sibling_admission_no')) and id <> sid;
    if sib is null then
      raise exception 'Sibling with admission number % not found', p ->> 'sibling_admission_no' using errcode = '23503';
    end if;
    insert into public.student_guardians (student_id, guardian_id, relation, is_primary)
    select sid, sg.guardian_id, sg.relation,
           sg.is_primary and not exists (select 1 from public.student_guardians x where x.student_id = sid and x.is_primary)
    from public.student_guardians sg where sg.student_id = sib
    on conflict (student_id, guardian_id) do nothing;
  end if;

  -- guardians: update existing, add new
  for g in select * from jsonb_array_elements(coalesce(p -> 'guardians', '[]')) loop
    continue when nullif(trim(g ->> 'full_name'), '') is null;
    gid := app.uuid_or_null(g ->> 'guardian_id');
    if gid is not null then
      update public.guardians set
        full_name = trim(g ->> 'full_name'), phone = nullif(trim(g ->> 'phone'), ''), alt_phone = nullif(trim(g ->> 'alt_phone'), ''),
        email = nullif(trim(g ->> 'email'), ''), occupation = nullif(trim(g ->> 'occupation'), ''),
        education = nullif(trim(g ->> 'education'), ''), address = nullif(trim(g ->> 'address'), ''), pincode = nullif(trim(g ->> 'pincode'), '')
      where id = gid;
    else
      insert into public.guardians (full_name, phone, alt_phone, email, occupation, education, address, pincode)
      values (trim(g ->> 'full_name'), nullif(trim(g ->> 'phone'), ''), nullif(trim(g ->> 'alt_phone'), ''), nullif(trim(g ->> 'email'), ''),
              nullif(trim(g ->> 'occupation'), ''), nullif(trim(g ->> 'education'), ''), nullif(trim(g ->> 'address'), ''), nullif(trim(g ->> 'pincode'), ''))
      returning id into gid;
    end if;
    if coalesce((g ->> 'is_primary')::boolean, false) then
      update public.student_guardians set is_primary = false where student_id = sid and guardian_id <> gid and is_primary;
    end if;
    insert into public.student_guardians (student_id, guardian_id, relation, is_primary)
    values (sid, gid, coalesce(g ->> 'relation', 'guardian'), coalesce((g ->> 'is_primary')::boolean, false))
    on conflict (student_id, guardian_id) do update set relation = excluded.relation, is_primary = excluded.is_primary;
  end loop;

  -- government fields (validated by trigger)
  if p ? 'details' then
    insert into public.student_profiles (student_id, details) values (sid, jsonb_strip_nulls(coalesce(p -> 'details', '{}')))
    on conflict (student_id) do update set details = excluded.details;
  end if;

  -- encrypted IDs
  for k, v in select * from jsonb_each_text(coalesce(p -> 'secure', '{}')) loop
    perform public.set_student_secure_value(sid, k, v);
  end loop;

  return sid;
end $$;
revoke execute on function public.save_student(jsonb) from public, anon;
grant execute on function public.save_student(jsonb) to authenticated;

-- Admin-only bulk reveal for the government-format export (one audit entry).
create function public.export_student_ids(p_ids uuid[]) returns table (student_id uuid, field_key text, value text)
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.audit_logs (actor_user_id, actor_role, action, table_name, details)
  values (auth.uid(), 'admin', 'student.ids_exported', 'students',
          jsonb_build_object('students', coalesce(array_length(p_ids, 1), 0)));
  return query
    select v.student_id, v.field_key, extensions.pgp_sym_decrypt(v.value_enc, app.pii_key())
    from public.student_secure_values v
    where v.student_id = any (p_ids);
end $$;
revoke execute on function public.export_student_ids(uuid[]) from public, anon;
grant execute on function public.export_student_ids(uuid[]) to authenticated;
