-- Certificates (TC, bonafide, study): database part. Rules CE1-CE11 in DECISIONS.md.
--   * The TC is Admin only. Bonafide / study: the Admin and an OFFICE person holding the "Certificates & ID cards" duty. A teacher never, even with the duty.
--   * Gap-free numbers per type and per academic year, given only at the moment of issue.
--   * The TC layout is a DRAFT until the Admin switches the draft flag off: while it is on, a real TC cannot be issued (a preview is allowed).
--   * Issuing a TC sets the student to "tc_issued"; cancelling restores the previous status. Dues are never touched.
--   * Nothing fee-, marks- or ID-related is ever written to the log entries.

-- ------------------------------------------------------------------ who may do what
create or replace function app.cert_is_office_with_duty() returns boolean
language sql stable security definer set search_path = '' as $$
  select app.current_app_role() = 'computer_staff'
     and exists (select 1 from public.staff_permissions p where p.staff_id = app.current_staff_id() and p.duty = 'certificates_idcards')
$$;
revoke execute on function app.cert_is_office_with_duty() from public, anon;

-- the TC: Admin only. Bonafide and study: Admin, or office staff with the duty. Teachers: never.
create or replace function app.cert_can(p_kind text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when app.is_admin() then true
              when p_kind in ('bonafide', 'study') then app.cert_is_office_with_duty()
              else false end
$$;
revoke execute on function app.cert_can(text) from public, anon;

create or replace function app.require_cert(p_kind text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_kind not in ('tc', 'bonafide', 'study') then raise exception 'Unknown certificate type' using errcode = '23514'; end if;
  if not app.cert_can(p_kind) then raise exception 'not allowed' using errcode = '42501'; end if;
end $$;
revoke execute on function app.require_cert(text) from public, anon, authenticated;

grant execute on function app.cert_is_office_with_duty(), app.cert_can(text) to authenticated;   -- the read policies below call them

-- ------------------------------------------------------------------ tables
create table public.certificate_settings (
  id                    smallint primary key default 1 check (id = 1),
  prefix_tc             text not null default 'TC'  check (prefix_tc ~ '^[A-Za-z0-9_-]{1,12}$'),
  prefix_bonafide       text not null default 'BON' check (prefix_bonafide ~ '^[A-Za-z0-9_-]{1,12}$'),
  prefix_study          text not null default 'STU' check (prefix_study ~ '^[A-Za-z0-9_-]{1,12}$'),
  show_signature_image  boolean not null default false,   -- off; switching it on is logged
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid, updated_by uuid
);
insert into public.certificate_settings (id) values (1);

create table public.certificate_templates (
  kind            text primary key check (kind in ('tc', 'bonafide', 'study')),
  title_en        text not null,
  title_te        text not null,
  texts           jsonb not null check (jsonb_typeof(texts) = 'object'),   -- { key: { en, te, te_checked } }
  layout_draft    boolean not null default true,    -- TC: while true a real TC cannot be issued
  wording_confirmed boolean not null default false, -- "draft wording, to be confirmed by the school"
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid, updated_by uuid
);

-- one row per type and year: the prefix at the time, where numbering starts, and the next number to give
create table public.certificate_series (
  kind             text not null check (kind in ('tc', 'bonafide', 'study')),
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  start_no         integer not null default 1 check (start_no >= 1),
  next_no          integer not null default 1 check (next_no >= 1),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid, updated_by uuid,
  primary key (kind, academic_year_id)
);

create table public.certificates (
  id               uuid primary key default gen_random_uuid(),
  kind             text not null check (kind in ('tc', 'bonafide', 'study')),
  academic_year_id uuid not null references public.academic_years (id) on delete restrict,
  seq              integer not null,
  number           text not null unique,
  student_id       uuid not null references public.students (id) on delete restrict,
  status           text not null default 'issued' check (status in ('issued', 'cancelled')),
  language         text not null check (language in ('en', 'te', 'both')),
  issue_date       date not null,
  place            text,
  purpose          text,                    -- bonafide
  leaving_date     date,                    -- TC
  leaving_reason   text,
  leaving_note     text,
  override_reason  text,                    -- TC "issue anyway": the reason (no amounts are stored)
  payload          jsonb not null,          -- what was printed, frozen at issue (so a duplicate shows the same words)
  prev_status      text,                    -- TC: the student's status before, to restore on cancel
  prev_status_date date,
  prev_status_reason text,
  issued_by        uuid references public.staff (id) on delete set null,
  cancelled_by     uuid references public.staff (id) on delete set null,
  cancelled_at     timestamptz,
  cancel_reason    text,
  is_demo          boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid, updated_by uuid,
  unique (kind, academic_year_id, seq),
  check (status = 'issued' or (cancelled_at is not null and length(btrim(coalesce(cancel_reason, ''))) >= 3)),
  check (kind <> 'tc' or (leaving_date is not null and leaving_reason is not null)),
  check (override_reason is null or length(btrim(override_reason)) >= 3)
);
create index certificates_student_idx on public.certificates (student_id);
create index certificates_year_kind_idx on public.certificates (academic_year_id, kind, seq);
create index certificates_issued_by_idx on public.certificates (issued_by);

create table public.certificate_prints (
  id             uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references public.certificates (id) on delete cascade,
  copy_no        integer not null check (copy_no >= 1),    -- 1 = the original
  is_duplicate   boolean not null default false,
  reason         text check (reason is null or reason in ('lost', 'damaged', 'parent_request', 'office_copy', 'other')),
  reason_note    text,
  language       text not null check (language in ('en', 'te', 'both')),
  printed_by     uuid references public.staff (id) on delete set null,
  printed_at     timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid, updated_by uuid,
  unique (certificate_id, copy_no),
  check (not is_duplicate or reason is not null)
);
create index certificate_prints_by_idx on public.certificate_prints (printed_by);

select app.attach_std_triggers('public.certificate_settings');
select app.attach_std_triggers('public.certificate_templates');
select app.attach_std_triggers('public.certificate_series');
select app.attach_std_triggers('public.certificates', '{payload}');   -- the printed words are not copied into the log
select app.attach_std_triggers('public.certificate_prints');

-- nobody writes these tables directly: only the functions below
alter table public.certificate_settings enable row level security;
alter table public.certificate_templates enable row level security;
alter table public.certificate_series enable row level security;
alter table public.certificates enable row level security;
alter table public.certificate_prints enable row level security;
revoke all on public.certificate_settings, public.certificate_templates, public.certificate_series, public.certificates, public.certificate_prints from public, anon, authenticated, service_role;
grant select on public.certificate_settings, public.certificate_templates, public.certificate_series, public.certificates, public.certificate_prints to authenticated;
create policy cert_settings_read on public.certificate_settings for select to authenticated using ((select app.is_admin() or app.cert_is_office_with_duty()));
create policy cert_templates_read on public.certificate_templates for select to authenticated using ((select app.cert_can(kind)));
create policy cert_series_read on public.certificate_series for select to authenticated using ((select app.cert_can(kind)));
create policy certs_read on public.certificates for select to authenticated using ((select app.cert_can(kind)));
create policy cert_prints_read on public.certificate_prints for select to authenticated
  using (exists (select 1 from public.certificates c where c.id = certificate_id and (select app.cert_can(c.kind))));

-- ------------------------------------------------------------------ Telugu name fields on the student record (optional; needed only for Telugu prints)
insert into public.student_field_definitions (key, label, field_group, field_type, options, pattern, help, required_for_gov, sensitive, reveal_with_duty, sort_order) values
  ('name_te', 'Student name in Telugu', 'identity', 'text', null, null, 'Used on Telugu certificates. Type it exactly as it should be printed.', false, false, false, 21),
  ('father_name_te', 'Father''s name in Telugu', 'identity', 'text', null, null, 'Used on Telugu certificates.', false, false, false, 22),
  ('mother_name_te', 'Mother''s name in Telugu', 'identity', 'text', null, null, 'Used on Telugu certificates.', false, false, false, 23)
on conflict (key) do nothing;

-- ------------------------------------------------------------------ the wording (draft, English and Telugu; every Telugu text starts as "needs checking")
insert into public.certificate_templates (kind, title_en, title_te, texts, layout_draft, wording_confirmed) values
('tc', 'TRANSFER CERTIFICATE', 'బదిలీ ధృవీకరణ పత్రం', jsonb_build_object(
  'admission_no',  jsonb_build_object('en', 'Admission number', 'te', 'ప్రవేశ సంఖ్య', 'te_checked', false),
  'name',          jsonb_build_object('en', 'Name of the student', 'te', 'విద్యార్థి పేరు', 'te_checked', false),
  'father',        jsonb_build_object('en', 'Father''s name', 'te', 'తండ్రి పేరు', 'te_checked', false),
  'mother',        jsonb_build_object('en', 'Mother''s name', 'te', 'తల్లి పేరు', 'te_checked', false),
  'nationality',   jsonb_build_object('en', 'Nationality', 'te', 'జాతీయత', 'te_checked', false),
  'religion',      jsonb_build_object('en', 'Religion', 'te', 'మతం', 'te_checked', false),
  'caste',         jsonb_build_object('en', 'Caste', 'te', 'కులం', 'te_checked', false),
  'dob',           jsonb_build_object('en', 'Date of birth (in figures)', 'te', 'పుట్టిన తేదీ (అంకెలలో)', 'te_checked', false),
  'dob_words',     jsonb_build_object('en', 'Date of birth (in words)', 'te', 'పుట్టిన తేదీ (అక్షరాలలో)', 'te_checked', false),
  'class_studied', jsonb_build_object('en', 'Class last studied', 'te', 'చివరిగా చదివిన తరగతి', 'te_checked', false),
  'last_exam',     jsonb_build_object('en', 'Result of the last examination', 'te', 'చివరి పరీక్ష ఫలితం', 'te_checked', false),
  'conduct',       jsonb_build_object('en', 'Conduct', 'te', 'ప్రవర్తన', 'te_checked', false),
  'fees_paid',     jsonb_build_object('en', 'Fees paid', 'te', 'ఫీజు చెల్లింపు', 'te_checked', false),
  'reason',        jsonb_build_object('en', 'Reason for leaving', 'te', 'పాఠశాల విడిచిన కారణం', 'te_checked', false),
  'leaving_date',  jsonb_build_object('en', 'Date of leaving', 'te', 'పాఠశాల విడిచిన తేదీ', 'te_checked', false),
  'remarks',       jsonb_build_object('en', 'Remarks', 'te', 'వ్యాఖ్యలు', 'te_checked', false),
  'declaration',   jsonb_build_object('en', 'Certified that the above particulars are correct as per the school records.', 'te', 'పై వివరాలు పాఠశాల రికార్డుల ప్రకారం సరైనవని ధృవీకరించడమైనది.', 'te_checked', false),
  'place',         jsonb_build_object('en', 'Place', 'te', 'ప్రదేశం', 'te_checked', false),
  'date_of_issue', jsonb_build_object('en', 'Date of issue', 'te', 'జారీ చేసిన తేదీ', 'te_checked', false),
  'sig_principal', jsonb_build_object('en', 'Signature of the Principal', 'te', 'ప్రధానోపాధ్యాయుల సంతకం', 'te_checked', false),
  'seal',          jsonb_build_object('en', 'Seal of the school', 'te', 'పాఠశాల ముద్ర', 'te_checked', false),
  'sig_class_teacher', jsonb_build_object('en', 'Class teacher', 'te', 'తరగతి ఉపాధ్యాయుడు', 'te_checked', false),
  'sig_clerk',     jsonb_build_object('en', 'Clerk', 'te', 'గుమాస్తా', 'te_checked', false),
  'duplicate',     jsonb_build_object('en', 'DUPLICATE', 'te', 'నకలు', 'te_checked', false)), true, false),
('bonafide', 'BONAFIDE CERTIFICATE', 'బోనఫైడ్ సర్టిఫికేట్', jsonb_build_object(
  'body',          jsonb_build_object('en', 'This is to certify that {name}, {child} of {father}, is a bonafide student of this school, studying {class} in the academic year {year}. Date of birth: {dob}. This certificate is issued for {purpose}.',
                                      'te', '{name}, {father} యొక్క {child}, ఈ పాఠశాలలో {year} విద్యా సంవత్సరంలో {class} చదువుతున్న నిజమైన విద్యార్థి అని ధృవీకరించడమైనది. పుట్టిన తేదీ: {dob}. ఈ ధృవీకరణ పత్రం {purpose} కొరకు జారీ చేయబడింది.', 'te_checked', false),
  'place',         jsonb_build_object('en', 'Place', 'te', 'ప్రదేశం', 'te_checked', false),
  'date_of_issue', jsonb_build_object('en', 'Date of issue', 'te', 'జారీ చేసిన తేదీ', 'te_checked', false),
  'sig_principal', jsonb_build_object('en', 'Signature of the Principal', 'te', 'ప్రధానోపాధ్యాయుల సంతకం', 'te_checked', false),
  'seal',          jsonb_build_object('en', 'Seal of the school', 'te', 'పాఠశాల ముద్ర', 'te_checked', false),
  'duplicate',     jsonb_build_object('en', 'DUPLICATE', 'te', 'నకలు', 'te_checked', false)), true, false),
('study', 'STUDY CERTIFICATE', 'స్టడీ సర్టిఫికేట్', jsonb_build_object(
  'body',          jsonb_build_object('en', 'This is to certify that {name}, {child} of {father}, studied in this school in the classes shown below. Date of birth: {dob}.',
                                      'te', '{name}, {father} యొక్క {child}, ఈ పాఠశాలలో క్రింద చూపిన తరగతులలో చదివినట్లు ధృవీకరించడమైనది. పుట్టిన తేదీ: {dob}.', 'te_checked', false),
  'col_year',      jsonb_build_object('en', 'Academic year', 'te', 'విద్యా సంవత్సరం', 'te_checked', false),
  'col_class',     jsonb_build_object('en', 'Class', 'te', 'తరగతి', 'te_checked', false),
  'col_medium',    jsonb_build_object('en', 'Medium', 'te', 'మాధ్యమం', 'te_checked', false),
  'place',         jsonb_build_object('en', 'Place', 'te', 'ప్రదేశం', 'te_checked', false),
  'date_of_issue', jsonb_build_object('en', 'Date of issue', 'te', 'జారీ చేసిన తేదీ', 'te_checked', false),
  'sig_principal', jsonb_build_object('en', 'Signature of the Principal', 'te', 'ప్రధానోపాధ్యాయుల సంతకం', 'te_checked', false),
  'seal',          jsonb_build_object('en', 'Seal of the school', 'te', 'పాఠశాల ముద్ర', 'te_checked', false),
  'duplicate',     jsonb_build_object('en', 'DUPLICATE', 'te', 'నకలు', 'te_checked', false)), true, false);

-- ------------------------------------------------------------------ words for dates ("Fifteenth January Two Thousand Fifteen")
create or replace function app.num_words(n integer) returns text
language plpgsql immutable set search_path = '' as $$
declare
  ones text[] := array['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  tens text[] := array['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  r text := '';
  x integer := n;
begin
  if n = 0 then return 'Zero'; end if;
  if x >= 1000 then r := r || ones[x / 1000 + 1] || ' Thousand '; x := x % 1000; end if;
  if x >= 100 then r := r || ones[x / 100 + 1] || ' Hundred '; x := x % 100; end if;
  if x >= 20 then r := r || tens[x / 10 + 1] || ' '; x := x % 10; end if;
  if x > 0 then r := r || ones[x + 1] || ' '; end if;
  return btrim(r);
end $$;

create or replace function app.date_words(d date) returns text
language sql immutable set search_path = '' as $$
  select (array['First','Second','Third','Fourth','Fifth','Sixth','Seventh','Eighth','Ninth','Tenth','Eleventh','Twelfth','Thirteenth','Fourteenth','Fifteenth','Sixteenth','Seventeenth','Eighteenth','Nineteenth','Twentieth',
                'Twenty First','Twenty Second','Twenty Third','Twenty Fourth','Twenty Fifth','Twenty Sixth','Twenty Seventh','Twenty Eighth','Twenty Ninth','Thirtieth','Thirty First'])[extract(day from d)::int]
         || ' ' || (array['January','February','March','April','May','June','July','August','September','October','November','December'])[extract(month from d)::int]
         || ' ' || app.num_words(extract(year from d)::int)
$$;

-- ------------------------------------------------------------------ the TC checklist (Admin only: it shows dues)
create or replace function app.cert_checklist(p_student uuid, p_leaving date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  st public.students;
  dues bigint;
  later int;
  has_class boolean;
  results boolean;
  missing text[] := '{}';
  items jsonb := '[]'::jsonb;
  yr uuid;
begin
  select * into st from public.students where id = p_student;
  select coalesce(sum(greatest(amount_paise - concession_paise - paid_paise, 0)), 0) into dues from public.student_fee_dues where student_id = p_student and voided_at is null;
  select count(*) into later from public.student_fee_dues where student_id = p_student and voided_at is null and p_leaving is not null and due_date > p_leaving and amount_paise - concession_paise - paid_paise > 0;
  select e.academic_year_id into yr from public.student_enrollments e join public.academic_years y on y.id = e.academic_year_id where e.student_id = p_student order by y.start_date desc limit 1;
  has_class := yr is not null;
  results := yr is not null and exists (select 1 from public.student_results r where r.student_id = p_student and r.academic_year_id = yr and r.locked);
  if btrim(coalesce(st.full_name, '')) = '' then missing := missing || 'name'::text; end if;
  if btrim(coalesce(st.admission_no, '')) = '' then missing := missing || 'admission number'::text; end if;
  if st.date_of_birth is null then missing := missing || 'date of birth'::text; end if;
  if not has_class then missing := missing || 'class'::text; end if;
  if not exists (select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id where sg.student_id = p_student and btrim(g.full_name) <> '') then missing := missing || 'parent or guardian'::text; end if;
  items := jsonb_build_array(
    jsonb_build_object('key', 'dues', 'label', 'Fee dues are cleared', 'status', case when dues = 0 then 'ok' else 'fail' end,
      'amount_paise', dues, 'detail', case when dues = 0 then 'Nothing is due' else 'Fees are still due' end, 'href', '/fees/collect?student=' || p_student),
    jsonb_build_object('key', 'class_results', 'label', 'In a class, with the year''s results recorded', 'status', case when not has_class then 'fail' when results then 'ok' else 'warn' end,
      'detail', case when not has_class then 'The student is not in any class' when results then 'Results are recorded' else 'The year''s results are not recorded yet (a warning, not a block)' end, 'href', '/students/' || p_student),
    jsonb_build_object('key', 'details', 'label', 'Required details are complete', 'status', case when cardinality(missing) = 0 then 'ok' else 'fail' end,
      'detail', case when cardinality(missing) = 0 then 'Name, parents, date of birth, admission number and class are filled' else 'Missing: ' || array_to_string(missing, ', ') end, 'href', '/students/' || p_student || '/edit'),
    jsonb_build_object('key', 'later_fees', 'label', 'Fees falling after the leaving date', 'status', case when later = 0 then 'ok' else 'warn' end,
      'count', later, 'detail', case when later = 0 then 'None' else later || ' instalment(s) are due after the leaving date. They are not changed: cancel, waive or keep them yourself' end, 'href', '/fees/dues?student=' || p_student));
  return items;
end $$;
revoke execute on function app.cert_checklist(uuid, date) from public, anon, authenticated;

create or replace function public.certificate_checklist(p_student uuid, p_leaving date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;   -- it shows dues: the TC is Admin only
  return app.cert_checklist(p_student, p_leaving);
end $$;

-- ------------------------------------------------------------------ what a certificate says (frozen at issue)
create or replace function app.cert_payload(p_kind text, p_student uuid, p_data jsonb, p_language text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  st public.students;
  det jsonb;
  father text; mother text; father_te text; mother_te text;
  e_year text; e_class text; e_section text; e_medium text;
  hist jsonb;
  gaps text[];
  need_te text[] := '{}';
  p jsonb;
  reasons jsonb := jsonb_build_object('transfer', 'Transfer to another school', 'moved', 'Family moved', 'completed_10', 'Completed Class 10', 'other', 'Other');
  rkey text;
  result_word text;
  unpaid bigint;
  child_en text; child_te text;
begin
  select * into st from public.students where id = p_student;
  if st.id is null then raise exception 'Unknown student' using errcode = '23514'; end if;
  select coalesce(details, '{}'::jsonb) into det from public.student_profiles where student_id = p_student;
  det := coalesce(det, '{}'::jsonb);
  select g.full_name into father from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id where sg.student_id = p_student and sg.relation = 'father' order by sg.is_primary desc limit 1;
  select g.full_name into mother from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id where sg.student_id = p_student and sg.relation = 'mother' order by sg.is_primary desc limit 1;
  if father is null and mother is null then
    select g.full_name into father from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id where sg.student_id = p_student order by sg.is_primary desc limit 1;
  end if;
  father_te := nullif(btrim(det ->> 'father_name_te'), '');
  mother_te := nullif(btrim(det ->> 'mother_name_te'), '');

  -- Telugu or bilingual prints need the Telugu names; never a blank or a guess
  if p_language in ('te', 'both') then
    if nullif(btrim(det ->> 'name_te'), '') is null then need_te := need_te || 'student name'::text; end if;
    if father is not null and father_te is null then need_te := need_te || 'father''s name'::text; end if;
    if mother is not null and mother_te is null then need_te := need_te || 'mother''s name'::text; end if;
    if cardinality(need_te) > 0 then
      raise exception 'Telugu name not entered: %. Enter it on the student record, or choose English.', array_to_string(need_te, ', ') using errcode = '23514';
    end if;
  end if;

  select y.name, c.name, s.name, s.medium into e_year, e_class, e_section, e_medium
    from public.student_enrollments e join public.academic_years y on y.id = e.academic_year_id join public.sections s on s.id = e.section_id join public.classes c on c.id = s.class_id
   where e.student_id = p_student order by y.start_date desc limit 1;
  child_en := case st.gender when 'female' then 'daughter' when 'male' then 'son' else 'child' end;
  child_te := case st.gender when 'female' then 'కుమార్తె' when 'male' then 'కుమారుడు' else 'సంతానం' end;

  p := jsonb_build_object(
    'student', jsonb_build_object('name', st.full_name, 'name_te', nullif(btrim(det ->> 'name_te'), ''), 'admission_no', st.admission_no, 'gender', st.gender,
        'dob', st.date_of_birth, 'dob_words', app.date_words(st.date_of_birth), 'father', father, 'father_te', father_te, 'mother', mother, 'mother_te', mother_te,
        'nationality', nullif(det ->> 'nationality', ''), 'religion', nullif(det ->> 'religion', ''), 'caste', nullif(det ->> 'caste', ''),
        'child_en', child_en, 'child_te', child_te, 'admission_date', st.admission_date),
    'class', jsonb_build_object('year', e_year, 'class', e_class, 'section', e_section, 'medium', e_medium));

  if p_kind = 'bonafide' then
    if st.status <> 'active' then
      raise exception 'A bonafide certificate is only for a student who is still at the school. Use the study certificate, or a duplicate of the TC.' using errcode = '23514';
    end if;
    if e_year is null then raise exception 'The student is not in any class' using errcode = '23514'; end if;
    if length(btrim(coalesce(p_data ->> 'purpose', ''))) < 2 then raise exception 'Give the purpose of the certificate' using errcode = '23514'; end if;
    p := p || jsonb_build_object('purpose', left(btrim(p_data ->> 'purpose'), 120));

  elsif p_kind = 'study' then
    select coalesce(jsonb_agg(jsonb_build_object('year', y.name, 'class', c.name, 'section', s.name, 'medium', s.medium) order by y.start_date), '[]'::jsonb) into hist
      from public.student_enrollments e join public.academic_years y on y.id = e.academic_year_id join public.sections s on s.id = e.section_id join public.classes c on c.id = s.class_id
     where e.student_id = p_student;
    if jsonb_array_length(hist) = 0 then raise exception 'The student has no class history to certify' using errcode = '23514'; end if;
    select array_agg(y.name order by y.start_date) into gaps from public.academic_years y
     where y.start_date > (select min(y2.start_date) from public.student_enrollments e2 join public.academic_years y2 on y2.id = e2.academic_year_id where e2.student_id = p_student)
       and y.start_date < (select max(y2.start_date) from public.student_enrollments e2 join public.academic_years y2 on y2.id = e2.academic_year_id where e2.student_id = p_student)
       and not exists (select 1 from public.student_enrollments e where e.student_id = p_student and e.academic_year_id = y.id);
    if gaps is not null and not coalesce((p_data ->> 'accept_gaps')::boolean, false) then
      raise exception 'The class history has gaps (%). Fix the history, or confirm that the certificate may list only the years on record.', array_to_string(gaps, ', ') using errcode = '23514';
    end if;
    p := p || jsonb_build_object('history', hist, 'history_gaps', coalesce(to_jsonb(gaps), '[]'::jsonb));

  elsif p_kind = 'tc' then
    rkey := p_data ->> 'leaving_reason';
    if rkey is null or not reasons ? rkey then raise exception 'Choose the reason for leaving' using errcode = '23514'; end if;
    if rkey = 'other' and length(btrim(coalesce(p_data ->> 'leaving_note', ''))) < 3 then raise exception 'Write the reason for leaving' using errcode = '23514'; end if;
    select case r.result when 'pass' then 'Passed' when 'fail' then 'Failed' else 'Not available' end into result_word
      from public.student_results r join public.result_groups g on g.id = r.group_id
     where r.student_id = p_student and r.locked and not exists (select 1 from public.result_group_members m where m.child_group_id = g.id)
     order by (select y.start_date from public.academic_years y where y.id = r.academic_year_id) desc, g.sort_order desc limit 1;
    select coalesce(sum(greatest(amount_paise - concession_paise - paid_paise, 0)), 0) into unpaid from public.student_fee_dues where student_id = p_student and voided_at is null;
    p := p || jsonb_build_object(
      'tc', jsonb_build_object(
        'leaving_date', (p_data ->> 'leaving_date')::date, 'reason_key', rkey, 'reason', reasons ->> rkey, 'reason_note', nullif(btrim(p_data ->> 'leaving_note'), ''),
        'conduct', coalesce(nullif(left(btrim(p_data ->> 'conduct'), 60), ''), 'Good'),
        'remarks', nullif(left(btrim(p_data ->> 'remarks'), 200), ''),
        'last_exam', coalesce(nullif(left(btrim(p_data ->> 'last_exam'), 60), ''), result_word, 'Not available'),
        'fees_paid', coalesce(nullif(left(btrim(p_data ->> 'fees_paid'), 80), ''), case when unpaid = 0 then 'All fees paid' else 'Fees pending (issued with the Admin''s approval)' end)));
  end if;
  return p;
end $$;
revoke execute on function app.cert_payload(text, uuid, jsonb, text) from public, anon, authenticated;

-- ------------------------------------------------------------------ the school's header (warns if something is blank)
create or replace function app.cert_school() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('name', s.name, 'address', concat_ws(', ', nullif(s.address_line1, ''), nullif(s.address_line2, ''), nullif(s.city, ''), nullif(s.district, ''), nullif(s.pincode, '')),
    'udise_code', s.udise_code, 'affiliation_no', s.affiliation_no, 'logo_path', s.logo_path, 'principal_name', s.principal_name, 'state', s.state, 'board', s.board,
    'missing', (select coalesce(jsonb_agg(m), '[]'::jsonb) from unnest(array[
        case when btrim(coalesce(s.name, '')) = '' then 'school name' end, case when btrim(coalesce(s.address_line1, '')) = '' then 'address' end,
        case when btrim(coalesce(s.udise_code, '')) = '' then 'UDISE code' end, case when btrim(coalesce(s.affiliation_no, '')) = '' then 'affiliation / recognition number' end,
        case when btrim(coalesce(s.logo_path, '')) = '' then 'logo' end, case when btrim(coalesce(s.principal_name, '')) = '' then 'principal''s name' end]) m where m is not null),
    'signature_path', case when (select show_signature_image from public.certificate_settings where id = 1) then s.principal_signature_path end)
  from public.school_settings s where s.id = 1
$$;
revoke execute on function app.cert_school() from public, anon, authenticated;

-- what the print page needs, for any certificate state
create or replace function app.cert_print_bundle(p_kind text, p_payload jsonb, p_language text, p_cert jsonb, p_duplicate jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare t public.certificate_templates;
begin
  select * into t from public.certificate_templates where kind = p_kind;
  return jsonb_build_object('kind', p_kind, 'language', p_language, 'certificate', p_cert, 'payload', p_payload, 'duplicate', p_duplicate,
    'title_en', t.title_en, 'title_te', t.title_te, 'texts', t.texts,
    'flags', jsonb_build_object('draft_layout', t.layout_draft, 'draft_wording', not t.wording_confirmed,
      'telugu_unchecked', p_language in ('te', 'both') and exists (select 1 from jsonb_each(t.texts) e where not coalesce((e.value ->> 'te_checked')::boolean, false))),
    'school', app.cert_school());
end $$;
revoke execute on function app.cert_print_bundle(text, jsonb, text, jsonb, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------------ preview (no number, no change; TC shows the DRAFT mark while the layout is a draft)
create or replace function public.certificate_preview(p_kind text, p_student uuid, p_language text, p_data jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  payload jsonb;
begin
  perform app.require_cert(p_kind);
  if p_language not in ('en', 'te', 'both') then raise exception 'Choose English, Telugu or both' using errcode = '23514'; end if;
  payload := app.cert_payload(p_kind, p_student, coalesce(p_data, '{}'::jsonb), p_language);
  perform public.log_event('certificate.preview', 'students', p_student::text, jsonb_build_object('summary', 'Preview of a ' || p_kind || ' certificate', 'kind', p_kind, 'language', p_language));
  return app.cert_print_bundle(p_kind, payload, p_language, null, null)
      || jsonb_build_object('checklist', case when p_kind = 'tc' then app.cert_checklist(p_student, nullif(p_data ->> 'leaving_date', '')::date) end);
end $$;

-- ------------------------------------------------------------------ issue
create or replace function public.certificate_issue(p_kind text, p_student uuid, p_language text, p_data jsonb, p_override boolean default false, p_override_reason text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := app.current_staff_id();
  d jsonb := coalesce(p_data, '{}'::jsonb);
  tmpl public.certificate_templates;
  st public.students;
  yr public.academic_years;
  ser public.certificate_series;
  prefix text;
  payload jsonb;
  checklist jsonb;
  red text;
  leaving date;
  today date := app.today_ist();
  cid uuid;
  n integer;
  num text;
  settings public.certificate_settings;
  override boolean := coalesce(p_override, false);
begin
  perform app.require_cert(p_kind);
  if p_language not in ('en', 'te', 'both') then raise exception 'Choose English, Telugu or both' using errcode = '23514'; end if;
  select * into tmpl from public.certificate_templates where kind = p_kind;
  if p_kind = 'tc' and tmpl.layout_draft then
    raise exception 'The TC layout is still a draft, so a real TC cannot be issued yet. A preview is allowed. The Admin switches the draft off once the layout matches the real TC.' using errcode = '23514';
  end if;
  select * into st from public.students where id = p_student for update;
  if st.id is null then raise exception 'Unknown student' using errcode = '23514'; end if;
  if p_kind = 'tc' then
    if st.status <> 'active' then raise exception 'A TC can only be issued to a student who is still active (status now: %)', st.status using errcode = '23514'; end if;
    leaving := nullif(d ->> 'leaving_date', '')::date;
    if leaving is null then raise exception 'Enter the date of leaving' using errcode = '23514'; end if;
    if leaving > today then raise exception 'The date of leaving cannot be in the future' using errcode = '23514'; end if;
    if leaving < st.admission_date then raise exception 'The date of leaving is before the admission date' using errcode = '23514'; end if;
    -- the checks run here, at the moment of issue, so they cannot be skipped
    checklist := app.cert_checklist(p_student, leaving);
    select string_agg(c ->> 'label', '; ') into red from jsonb_array_elements(checklist) c where c ->> 'status' = 'fail';
    if red is not null then
      if not override then raise exception 'Cannot issue the TC yet: % . The Admin can use "Issue anyway" with a written reason.', red using errcode = '23514'; end if;
      if length(btrim(coalesce(p_override_reason, ''))) < 3 then raise exception 'Write the reason for issuing anyway' using errcode = '23514'; end if;
      if exists (select 1 from jsonb_array_elements(checklist) c where c ->> 'key' = 'details' and c ->> 'status' = 'fail') or exists (select 1 from jsonb_array_elements(checklist) c where c ->> 'key' = 'class_results' and c ->> 'status' = 'fail') then
        raise exception 'Missing student details or class cannot be overridden: fix them first' using errcode = '23514';
      end if;
    elsif override then
      override := false;       -- nothing to override: do not record a reason that was not needed
    end if;
  end if;
  payload := app.cert_payload(p_kind, p_student, d, p_language);

  -- the year the certificate belongs to: the current academic year
  select * into yr from public.academic_years where is_current limit 1;
  if yr.id is null then raise exception 'There is no current academic year' using errcode = '23514'; end if;
  -- the number: taken now, inside this transaction, under a lock on the series (so it is never skipped, reused or doubled)
  insert into public.certificate_series (kind, academic_year_id) values (p_kind, yr.id) on conflict do nothing;
  select * into ser from public.certificate_series where kind = p_kind and academic_year_id = yr.id for update;
  n := ser.next_no;
  update public.certificate_series set next_no = n + 1 where kind = p_kind and academic_year_id = yr.id;
  select * into settings from public.certificate_settings where id = 1;
  prefix := case p_kind when 'tc' then settings.prefix_tc when 'bonafide' then settings.prefix_bonafide else settings.prefix_study end;
  num := prefix || '/' || yr.name || '/' || lpad(n::text, 3, '0');

  insert into public.certificates (kind, academic_year_id, seq, number, student_id, language, issue_date, place, purpose, leaving_date, leaving_reason, leaving_note, override_reason,
                                   payload, prev_status, prev_status_date, prev_status_reason, issued_by, is_demo)
  values (p_kind, yr.id, n, num, p_student, p_language, today, nullif(left(btrim(d ->> 'place'), 60), ''), payload ->> 'purpose', leaving,
          payload #>> '{tc,reason_key}', payload #>> '{tc,reason_note}', case when override then btrim(p_override_reason) end, payload,
          case when p_kind = 'tc' then st.status end, case when p_kind = 'tc' then st.status_date end, case when p_kind = 'tc' then st.status_reason end, me, st.is_demo)
  returning id into cid;
  insert into public.certificate_prints (certificate_id, copy_no, is_duplicate, language, printed_by) values (cid, 1, false, p_language, me);

  if p_kind = 'tc' then
    -- the student leaves: status "TC issued" with the date and the reason. Dues, marks, attendance and old years are not touched.
    update public.students set status = 'tc_issued', status_date = leaving,
           status_reason = (payload #>> '{tc,reason}') || coalesce(': ' || (payload #>> '{tc,reason_note}'), '') where id = p_student;
  end if;
  perform public.log_event('certificate.issue', 'students', p_student::text, jsonb_build_object(
    'summary', case p_kind when 'tc' then 'TC' when 'bonafide' then 'Bonafide certificate' else 'Study certificate' end || ' ' || num || ' issued for ' || st.full_name,
    'certificate_id', cid, 'number', num, 'kind', p_kind, 'language', p_language, 'override', override,
    'override_reason', case when override then btrim(p_override_reason) end));
  return jsonb_build_object('id', cid, 'number', num) || jsonb_build_object('print', public.certificate_print_data(cid));
end $$;

-- ------------------------------------------------------------------ print / reprint
create or replace function public.certificate_print(p_certificate uuid, p_language text default null, p_reason text default null, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.certificates;
  me uuid := app.current_staff_id();
  first_print public.certificate_prints;
  lastp public.certificate_prints;
  lang text;
  n integer;
  dup boolean;
  why text;
  payload jsonb;
begin
  select * into c from public.certificates where id = p_certificate for update;
  if c.id is null then raise exception 'Certificate not found' using errcode = 'P0002'; end if;
  perform app.require_cert(c.kind);
  if c.status <> 'issued' then raise exception 'Certificate % is cancelled and cannot be printed', c.number using errcode = '23514'; end if;
  select * into first_print from public.certificate_prints where certificate_id = c.id and copy_no = 1;
  select * into lastp from public.certificate_prints where certificate_id = c.id order by copy_no desc limit 1;
  lang := coalesce(p_language, lastp.language, c.language);
  if lang not in ('en', 'te', 'both') then raise exception 'Choose English, Telugu or both' using errcode = '23514'; end if;
  payload := c.payload;
  if lang in ('te', 'both') and (nullif(payload #>> '{student,name_te}', '') is null) then
    raise exception 'Telugu name not entered: this certificate was issued without it. Choose English.' using errcode = '23514';
  end if;
  -- printer jam: the same person, the same day, within 10 minutes of the original print -> not a duplicate (still logged)
  dup := not (first_print.printed_by is not distinct from me and first_print.printed_at > now() - interval '10 minutes'
              and (first_print.printed_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date);
  if dup then
    why := p_reason;
    if why is null or why not in ('lost', 'damaged', 'parent_request', 'office_copy', 'other') then
      raise exception 'Choose the reason for the duplicate (lost, damaged, parent request, office copy, other)' using errcode = '23514';
    end if;
    if why = 'other' and length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Write the reason for the duplicate' using errcode = '23514'; end if;
  end if;
  select coalesce(max(copy_no), 0) + 1 into n from public.certificate_prints where certificate_id = c.id;
  insert into public.certificate_prints (certificate_id, copy_no, is_duplicate, reason, reason_note, language, printed_by)
  values (c.id, n, dup, case when dup then why end, case when dup then nullif(btrim(p_note), '') end, lang, me);
  perform public.log_event('certificate.print', 'students', c.student_id::text, jsonb_build_object(
    'summary', case when dup then 'Duplicate ' else 'Reprint of the original ' end || case c.kind when 'tc' then 'TC' when 'bonafide' then 'bonafide certificate' else 'study certificate' end
               || ' ' || c.number || ' printed' || case when dup then ', reason: ' || replace(why, '_', ' ') else ' (same person, within 10 minutes)' end,
    'certificate_id', c.id, 'number', c.number, 'kind', c.kind, 'copy_no', n, 'duplicate', dup, 'reason', why, 'language', lang));
  return public.certificate_print_data(c.id, n, lang);
end $$;

-- the data a print page shows (Admin / duty holder of that kind); no log entry here, the print itself is logged above
create or replace function public.certificate_print_data(p_certificate uuid, p_copy integer default null, p_language text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.certificates;
  pr public.certificate_prints;
begin
  select * into c from public.certificates where id = p_certificate;
  if c.id is null then raise exception 'Certificate not found' using errcode = 'P0002'; end if;
  perform app.require_cert(c.kind);
  select * into pr from public.certificate_prints where certificate_id = c.id and copy_no = coalesce(p_copy, (select max(copy_no) from public.certificate_prints where certificate_id = c.id));
  return app.cert_print_bundle(c.kind, c.payload, coalesce(p_language, pr.language, c.language),
    jsonb_build_object('id', c.id, 'number', c.number, 'status', c.status, 'issue_date', c.issue_date, 'place', c.place, 'student_id', c.student_id, 'cancel_reason', c.cancel_reason),
    jsonb_build_object('is_duplicate', pr.is_duplicate, 'copy_no', pr.copy_no, 'printed_at', pr.printed_at, 'reason', pr.reason, 'reason_note', pr.reason_note));
end $$;

-- ------------------------------------------------------------------ cancel (Admin only) and its check
create or replace function public.certificate_cancel_check(p_certificate uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.certificates;
  st public.students;
  cur public.academic_years;
  has_enr boolean;
begin
  if not app.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into c from public.certificates where id = p_certificate;
  if c.id is null then raise exception 'Certificate not found' using errcode = 'P0002'; end if;
  select * into st from public.students where id = c.student_id;
  select * into cur from public.academic_years where is_current limit 1;
  select exists (select 1 from public.student_enrollments e where e.student_id = c.student_id and e.academic_year_id = cur.id) into has_enr;
  return jsonb_build_object('is_tc', c.kind = 'tc', 'already_cancelled', c.status = 'cancelled',
    'status_changed_since', c.kind = 'tc' and st.status <> 'tc_issued',
    'restores_to', c.prev_status,
    'needs_section', c.kind = 'tc' and c.status = 'issued' and coalesce(c.prev_status, 'active') = 'active' and not has_enr,
    'warning', case when c.kind = 'tc' and coalesce(c.prev_status, 'active') = 'active' and not has_enr
                    then 'The student has no class in ' || cur.name || ' (a new year has started since the TC). Choose the class and section to return to.' end);
end $$;

create or replace function public.certificate_cancel(p_certificate uuid, p_reason text, p_section uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.certificates;
  st public.students;
  cur public.academic_years;
  chk jsonb;
  roll integer;
begin
  if not app.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Give a reason for cancelling' using errcode = '23514'; end if;
  select * into c from public.certificates where id = p_certificate for update;
  if c.id is null then raise exception 'Certificate not found' using errcode = 'P0002'; end if;
  if c.status = 'cancelled' then raise exception 'Certificate % is already cancelled', c.number using errcode = '23514'; end if;
  if c.kind = 'tc' then
    select * into st from public.students where id = c.student_id for update;
    if st.status <> 'tc_issued' then
      raise exception 'The student''s status was changed after the TC (now: %). Correct the student by hand; the TC cannot restore it.', st.status using errcode = '23514';
    end if;
    chk := public.certificate_cancel_check(p_certificate);
    if (chk ->> 'needs_section')::boolean then
      select * into cur from public.academic_years where is_current limit 1;
      if p_section is null or not exists (select 1 from public.sections s where s.id = p_section and s.academic_year_id = cur.id) then
        raise exception '%', chk ->> 'warning' using errcode = '23514';
      end if;
      select coalesce(max(roll_no), 0) + 1 into roll from public.student_enrollments where section_id = p_section;
      insert into public.student_enrollments (student_id, academic_year_id, section_id, roll_no, status) values (c.student_id, cur.id, p_section, roll, 'active');
    end if;
    update public.students set status = coalesce(c.prev_status, 'active'), status_date = c.prev_status_date, status_reason = c.prev_status_reason where id = c.student_id;
  end if;
  update public.certificates set status = 'cancelled', cancelled_by = app.current_staff_id(), cancelled_at = now(), cancel_reason = btrim(p_reason) where id = c.id;
  perform public.log_event('certificate.cancel', 'students', c.student_id::text, jsonb_build_object(
    'summary', case c.kind when 'tc' then 'TC' when 'bonafide' then 'Bonafide certificate' else 'Study certificate' end || ' ' || c.number || ' cancelled, reason: ' || btrim(p_reason),
    'certificate_id', c.id, 'number', c.number, 'kind', c.kind, 'reason', btrim(p_reason), 'student_restored', c.kind = 'tc'));
  return jsonb_build_object('id', c.id, 'number', c.number, 'status', 'cancelled');
end $$;

-- ------------------------------------------------------------------ the register (per type and year) and one student's certificates
create or replace function public.certificate_register(p_kind text, p_year uuid, p_limit integer default 500, p_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare r jsonb; total bigint;
begin
  perform app.require_cert(p_kind);
  select count(*) into total from public.certificates where kind = p_kind and academic_year_id = p_year;
  select coalesce(jsonb_agg(rw order by (rw ->> 'seq')::int), '[]'::jsonb) into r from (
    select jsonb_build_object('id', c.id, 'seq', c.seq, 'number', c.number, 'student_id', c.student_id, 'student', st.full_name, 'admission_no', st.admission_no, 'issue_date', c.issue_date,
             'issued_by', iss.full_name, 'status', c.status, 'language', c.language, 'purpose', c.purpose, 'leaving_date', c.leaving_date, 'leaving_reason', c.leaving_reason,
             'cancel_reason', c.cancel_reason, 'copies', (select count(*) from public.certificate_prints p where p.certificate_id = c.id),
             'prints', (select coalesce(jsonb_agg(jsonb_build_object('copy_no', p.copy_no, 'at', p.printed_at, 'duplicate', p.is_duplicate, 'reason', p.reason, 'note', p.reason_note,
                                  'by', (select s2.full_name from public.staff s2 where s2.id = p.printed_by), 'language', p.language) order by p.copy_no), '[]'::jsonb) from public.certificate_prints p where p.certificate_id = c.id)) rw
      from public.certificates c join public.students st on st.id = c.student_id left join public.staff iss on iss.id = c.issued_by
     where c.kind = p_kind and c.academic_year_id = p_year order by c.seq limit least(greatest(coalesce(p_limit, 500), 1), 2000) offset greatest(coalesce(p_offset, 0), 0)) q;
  return jsonb_build_object('total', total, 'rows', r,
    'series', (select jsonb_build_object('start_no', s.start_no, 'next_no', s.next_no) from public.certificate_series s where s.kind = p_kind and s.academic_year_id = p_year));
end $$;

-- the register as a file: the export is written to the log in the same call
create or replace function public.certificate_register_export(p_kind text, p_year uuid, p_format text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  perform app.require_cert(p_kind);
  if p_format not in ('csv', 'xlsx', 'print', 'pdf') then raise exception 'unknown format' using errcode = '23514'; end if;
  r := public.certificate_register(p_kind, p_year, 2000, 0);
  perform public.log_report('certificate-register-' || p_kind, p_format, jsonb_build_object('year', (select name from public.academic_years where id = p_year)), jsonb_array_length(r -> 'rows'));
  return r;
end $$;

create or replace function public.certificates_for_student(p_student uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (app.is_admin() or app.cert_is_office_with_duty()) then raise exception 'not allowed' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'kind', c.kind, 'number', c.number, 'status', c.status, 'issue_date', c.issue_date,
            'copies', (select count(*) from public.certificate_prints p where p.certificate_id = c.id)) order by c.created_at desc)
     from public.certificates c where c.student_id = p_student and app.cert_can(c.kind)), '[]'::jsonb);
end $$;

-- ------------------------------------------------------------------ Admin settings: numbering, wording, draft switch, signature image
create or replace function public.certificate_set_start(p_kind text, p_year uuid, p_start integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  if p_kind not in ('tc', 'bonafide', 'study') then raise exception 'Unknown certificate type' using errcode = '23514'; end if;
  if p_start is null or p_start < 1 or p_start > 999999 then raise exception 'The starting number must be between 1 and 999999' using errcode = '23514'; end if;
  perform pg_advisory_xact_lock(hashtext('cert:' || p_kind || ':' || p_year::text));
  if exists (select 1 from public.certificates where kind = p_kind and academic_year_id = p_year) then
    raise exception 'A % certificate already exists for this year: the starting number can no longer be changed', p_kind using errcode = '23514';
  end if;
  insert into public.certificate_series (kind, academic_year_id, start_no, next_no) values (p_kind, p_year, p_start, p_start)
  on conflict (kind, academic_year_id) do update set start_no = excluded.start_no, next_no = excluded.next_no;
  perform public.log_event('certificate.start_number', 'certificate_series', p_kind, jsonb_build_object(
    'summary', 'Starting number of the ' || p_kind || ' series for ' || (select name from public.academic_years where id = p_year) || ' set to ' || p_start, 'kind', p_kind, 'start', p_start));
end $$;

create or replace function public.certificate_settings_save(p_prefix_tc text, p_prefix_bonafide text, p_prefix_study text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.certificate_settings set prefix_tc = btrim(p_prefix_tc), prefix_bonafide = btrim(p_prefix_bonafide), prefix_study = btrim(p_prefix_study) where id = 1;
  perform public.log_event('certificate.prefix', 'certificate_settings', '1', jsonb_build_object('summary', 'Certificate number prefixes changed', 'tc', btrim(p_prefix_tc), 'bonafide', btrim(p_prefix_bonafide), 'study', btrim(p_prefix_study)));
end $$;

create or replace function public.certificate_signature_image(p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.certificate_settings set show_signature_image = coalesce(p_on, false) where id = 1;
  perform public.log_event('certificate.signature_image', 'certificate_settings', '1', jsonb_build_object('summary', 'Printing the principal''s signature image on certificates switched ' || case when p_on then 'ON' else 'off' end, 'on', coalesce(p_on, false)));
end $$;

-- the wording: one text at a time. Changing the Telugu of a text marks it "needs checking" again.
create or replace function public.certificate_template_save(p_kind text, p_key text, p_en text, p_te text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.certificate_templates; old jsonb;
begin
  if not app.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  select * into t from public.certificate_templates where kind = p_kind for update;
  if t.kind is null then raise exception 'Unknown certificate type' using errcode = '23514'; end if;
  if not t.texts ? p_key then raise exception 'Unknown text "%"', p_key using errcode = '23514'; end if;
  if length(btrim(coalesce(p_en, ''))) < 1 or length(p_en) > 600 or length(btrim(coalesce(p_te, ''))) < 1 or length(p_te) > 900 then raise exception 'The text must not be empty' using errcode = '23514'; end if;
  old := t.texts -> p_key;
  update public.certificate_templates set texts = jsonb_set(texts, array[p_key], jsonb_build_object('en', btrim(p_en), 'te', btrim(p_te),
           'te_checked', coalesce((old ->> 'te_checked')::boolean, false) and (old ->> 'te') = btrim(p_te)))
   where kind = p_kind;
  perform public.log_event('certificate.template', 'certificate_templates', p_kind, jsonb_build_object('summary', 'Wording of the ' || p_kind || ' certificate changed (' || p_key || ')', 'kind', p_kind, 'key', p_key));
end $$;

create or replace function public.certificate_template_confirm_telugu(p_kind text, p_key text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.certificate_templates t set texts = (
      select jsonb_object_agg(e.key, case when p_key is null or e.key = p_key then jsonb_set(e.value, '{te_checked}', 'true') else e.value end) from jsonb_each(t.texts) e)
   where kind = p_kind;
  if not found then raise exception 'Unknown certificate type' using errcode = '23514'; end if;
  perform public.log_event('certificate.template', 'certificate_templates', p_kind, jsonb_build_object('summary', 'Telugu wording of the ' || p_kind || ' certificate marked as checked' || coalesce(' (' || p_key || ')', ''), 'kind', p_kind));
end $$;

create or replace function public.certificate_template_set_draft(p_kind text, p_layout_draft boolean, p_wording_confirmed boolean default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_admin() then raise exception 'not allowed' using errcode = '42501'; end if;
  update public.certificate_templates set layout_draft = coalesce(p_layout_draft, layout_draft), wording_confirmed = coalesce(p_wording_confirmed, wording_confirmed) where kind = p_kind;
  if not found then raise exception 'Unknown certificate type' using errcode = '23514'; end if;
  perform public.log_event('certificate.template', 'certificate_templates', p_kind, jsonb_build_object(
    'summary', 'The ' || p_kind || ' certificate layout is now ' || case when p_layout_draft then 'a DRAFT' else 'confirmed (real certificates can be issued)' end, 'kind', p_kind, 'layout_draft', p_layout_draft));
end $$;

create or replace function public.certificate_school_check() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (app.is_admin() or app.cert_is_office_with_duty()) then raise exception 'not allowed' using errcode = '42501'; end if;
  return app.cert_school() -> 'missing';
end $$;

-- ------------------------------------------------------------------ the audit log understands certificates
create or replace function app.audit_group(p_action text, p_table text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p_action like 'auth.%' or p_action = 'student.ids_revealed' then 'access'
    when p_action like 'report.%' then 'exports'
    when p_action like 'rollover.%' then 'students'
    when p_action like 'certificate.%' then 'certificates'
    when p_action like 'fee.%' or p_action like 'fee_settings.%' then 'fees'
    when p_table in ('certificates', 'certificate_prints', 'certificate_templates', 'certificate_series', 'certificate_settings') then 'certificates'
    when p_table in ('students', 'student_profiles', 'student_secure_values', 'guardians', 'student_guardians', 'student_enrollments', 'student_documents') then 'students'
    when p_table like 'fee\_%' or p_table like 'student\_fee\_%' or p_table like 'student_fee_plans' then 'fees'
    when p_table in ('exam_components', 'result_groups', 'result_group_members', 'marks', 'grade_bands', 'grade_entries', 'subject_pass_marks', 'report_remarks',
                     'report_card_prints', 'subject_results', 'student_results', 'exam_class_modes', 'exam_subject_max', 'descriptive_grades', 'remark_bank') then 'marks'
    when p_table in ('attendance_sessions', 'student_attendance', 'staff_attendance', 'leave_requests', 'leave_balances', 'leave_types') then 'attendance'
    when p_table in ('staff', 'staff_permissions', 'teacher_assignments', 'timetable_entries', 'timetable_substitutions', 'bell_schedules', 'bell_periods', 'class_bell_schedules') then 'staff'
    else 'other'
  end
$$;
-- rows already in the log keep the kind they were stored with; certificate entries are new, so they get the new kind

do $$
declare f text;
begin
  foreach f in array array[
    'public.certificate_checklist(uuid, date)', 'public.certificate_preview(text, uuid, text, jsonb)', 'public.certificate_issue(text, uuid, text, jsonb, boolean, text)',
    'public.certificate_print(uuid, text, text, text)', 'public.certificate_print_data(uuid, integer, text)', 'public.certificate_cancel_check(uuid)', 'public.certificate_cancel(uuid, text, uuid)',
    'public.certificate_register(text, uuid, integer, integer)', 'public.certificate_register_export(text, uuid, text)', 'public.certificates_for_student(uuid)',
    'public.certificate_set_start(text, uuid, integer)', 'public.certificate_settings_save(text, text, text)', 'public.certificate_signature_image(boolean)',
    'public.certificate_template_save(text, text, text, text)', 'public.certificate_template_confirm_telugu(text, text)', 'public.certificate_template_set_draft(text, boolean, boolean)',
    'public.certificate_school_check()'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ------------------------------------------------------------------ certificate entries read as plain sentences; the 9th alert
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
  elsif a.action like 'rollover.%' or a.action like 'certificate.%' then summ := coalesce(a.details ->> 'summary', 'Year rollover or certificate') || coalesce(' (' || (a.details ->> 'students_affected') || ' students)', '');
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
    when 'certificates_look' then a.action = 'certificate.cancel' or (a.action = 'certificate.print' and coalesce((a.details ->> 'duplicate')::boolean, false)) or (a.action = 'certificate.issue' and coalesce((a.details ->> 'override')::boolean, false))
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
    select 'certificates_look', a.id, a.occurred_at, a.actor_user_id, coalesce(a.details ->> 'summary', 'Certificate entry')
      from public.audit_logs a
     where a.occurred_at >= since
       and (a.action = 'certificate.cancel' or (a.action = 'certificate.print' and coalesce((a.details ->> 'duplicate')::boolean, false)) or (a.action = 'certificate.issue' and coalesce((a.details ->> 'override')::boolean, false)))
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
        (9, 'certificates_look',  'Certificates worth a look: duplicates, TC overrides, cancellations',      'medium')) def(ord, key, label, severity))
  ) into r;
  return r;
end $$;
revoke execute on function app.audit_alerts(integer) from public, anon, authenticated;
