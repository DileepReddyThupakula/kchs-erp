-- Certificates screens: two small read functions the screens need.
--   certificate_print_state : will the next print be a duplicate (and so need a reason)? Same rule as certificate_print.
--   certificate_student_search : find a student to issue a certificate for. Name, admission no and class only (the office duty
--                                has no other right to read student records).

create or replace function public.certificate_print_state(p_certificate uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.certificates;
  first_print public.certificate_prints;
  lastp public.certificate_prints;
  dup boolean;
begin
  select * into c from public.certificates where id = p_certificate;
  if c.id is null then raise exception 'Certificate not found' using errcode = 'P0002'; end if;
  perform app.require_cert(c.kind);
  select * into first_print from public.certificate_prints where certificate_id = c.id and copy_no = 1;
  select * into lastp from public.certificate_prints where certificate_id = c.id order by copy_no desc limit 1;
  dup := not (first_print.printed_by is not distinct from app.current_staff_id() and first_print.printed_at > now() - interval '10 minutes'
              and (first_print.printed_at at time zone 'Asia/Kolkata')::date = (now() at time zone 'Asia/Kolkata')::date);
  return jsonb_build_object('kind', c.kind, 'number', c.number, 'status', c.status, 'copies', (select count(*) from public.certificate_prints where certificate_id = c.id),
    'needs_reason', dup, 'last_language', coalesce(lastp.language, c.language), 'issued_language', c.language,
    'has_telugu_name', nullif(c.payload #>> '{student,name_te}', '') is not null);
end $$;

create or replace function public.certificate_student_search(p_q text, p_kind text default 'bonafide') returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare q text := btrim(coalesce(p_q, ''));
begin
  perform app.require_cert(p_kind);
  if length(q) < 2 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x order by x ->> 'name') from (
    select jsonb_build_object('id', s.id, 'name', s.full_name, 'admission_no', s.admission_no, 'status', s.status,
             'class', (select c.name || ' ' || sec.name from public.student_enrollments e join public.sections sec on sec.id = e.section_id join public.classes c on c.id = sec.class_id
                        join public.academic_years y on y.id = e.academic_year_id where e.student_id = s.id order by y.start_date desc limit 1)) x
      from public.students s
     where s.full_name ilike '%' || q || '%' or s.admission_no ilike q || '%'
     order by s.full_name limit 20) t), '[]'::jsonb);
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.certificate_print_state(uuid)', 'public.certificate_student_search(text, text)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
