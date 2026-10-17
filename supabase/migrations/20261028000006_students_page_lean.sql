-- students_page: (0) the list carries only the counts of missing documents / government fields; the names come with p_full. (1) the list no longer sends every government field of every student (the heavy part of the page);
-- those, with the masked IDs, are returned only when asked for (p_full) - used by Export. (2) p_ids: the page for chosen students.
drop function if exists public.students_page(uuid, text, uuid, uuid, text, text, text, text, boolean, text, text, integer, integer);
drop function if exists public.students_page(uuid, text, uuid, uuid, text, text, text, text, boolean, text, text, integer, integer, uuid[], boolean);
-- (Students list, one page at a time: search, filters, sorting and paging happen in the database.
-- SECURITY INVOKER: row-level security applies exactly as for a direct read, so a teacher gets only their own sections' students
-- (scope rule R18) and only Admin / student_records ever get the government fields, masked IDs and document gaps.
create or replace function public.students_page(
  p_year uuid, p_q text default null, p_class uuid default null, p_section uuid default null, p_status text default null,
  p_docs text default null, p_gov text default null, p_enrol text default null, p_mine boolean default false,
  p_sort text default 'name', p_dir text default 'asc', p_offset integer default 0, p_limit integer default 50,
  p_ids uuid[] default null, p_full boolean default false
) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_manage boolean := not coalesce(p_mine, false) and (app.is_admin() or public.has_duty('student_records'));
  v_q text := nullif(btrim(coalesce(p_q, '')), '');
  v_pat text;
  v_asc boolean := lower(coalesce(p_dir, 'asc')) <> 'desc';
  v_lim integer := least(greatest(coalesce(p_limit, 50), 1), 1000);
  v_off integer := greatest(coalesce(p_offset, 0), 0);
  v_mine uuid[] := case when coalesce(p_mine, false) then app.my_section_ids() else null end;
  r jsonb;
begin
  if v_q is not null then
    v_pat := '%' || replace(replace(replace(lower(v_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  with filtered as (
    select s.id, s.full_name, s.admission_no, s.date_of_birth, s.status, e.section_id, e.roll_no, sec.name as sec_name, c.sort_order as class_order
      from public.students s
      left join public.student_enrollments e on e.student_id = s.id and e.academic_year_id = p_year
      left join public.sections sec on sec.id = e.section_id
      left join public.classes c on c.id = sec.class_id
      left join public.student_profiles pr on pr.student_id = s.id and v_manage
     where (p_ids is null or s.id = any (p_ids))
       and (v_mine is null or e.section_id = any (v_mine))
       and (p_class is null or c.id = p_class)
       and (p_section is null or e.section_id = p_section)
       and (nullif(p_status, '') is null or s.status = p_status)
       and (nullif(p_enrol, '') is null or (p_enrol = 'none' and e.section_id is null))
       and (v_pat is null
            or lower(s.full_name) like v_pat escape '\'
            or lower(s.admission_no) like v_pat escape '\'
            or exists (select 1 from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
                        where sg.student_id = s.id and (lower(g.full_name) like v_pat escape '\' or lower(coalesce(g.phone, '')) like v_pat escape '\')))
       and (not v_manage or nullif(p_docs, '') is null
            or (p_docs = 'missing') = exists (select 1 from public.student_document_types t
                                               where t.required and t.is_active
                                                 and not exists (select 1 from public.student_documents d where d.student_id = s.id and d.doc_type = t.code)))
       and (not v_manage or nullif(p_gov, '') is null
            or (p_gov = 'missing') = exists (select 1 from public.student_field_definitions f
                                              where f.is_active and f.required_for_gov
                                                and ((f.sensitive and not exists (select 1 from public.student_secure_values v where v.student_id = s.id and v.field_key = f.key))
                                                  or (not f.sensitive and coalesce(pr.details ->> f.key, '') = ''))))
  ), page as (
    select f.id, row_number() over (
             order by
               case when p_sort = 'name'   and v_asc     then f.full_name end asc,
               case when p_sort = 'name'   and not v_asc then f.full_name end desc,
               case when p_sort = 'adm'    and v_asc     then f.admission_no end asc,
               case when p_sort = 'adm'    and not v_asc then f.admission_no end desc,
               case when p_sort = 'dob'    and v_asc     then f.date_of_birth end asc,
               case when p_sort = 'dob'    and not v_asc then f.date_of_birth end desc,
               case when p_sort = 'status' and v_asc     then f.status end asc,
               case when p_sort = 'status' and not v_asc then f.status end desc,
               case when p_sort = 'class'  and v_asc     then coalesce(f.class_order, 999) end asc,
               case when p_sort = 'class'  and not v_asc then coalesce(f.class_order, 999) end desc,
               case when p_sort = 'class'  and v_asc     then f.sec_name end asc,
               case when p_sort = 'class'  and not v_asc then f.sec_name end desc,
               case when p_sort = 'class'  and v_asc     then coalesce(f.roll_no, 9999) end asc,
               case when p_sort = 'class'  and not v_asc then coalesce(f.roll_no, 9999) end desc,
               f.full_name, f.id) as ord
      from filtered f
     order by ord
     offset v_off limit v_lim
  )
  select jsonb_build_object(
           'total', (select count(*) from filtered),
           'rows', coalesce(jsonb_agg(
             jsonb_build_object(
               'id', s.id, 'admission_no', s.admission_no, 'full_name', s.full_name, 'gender', s.gender, 'date_of_birth', s.date_of_birth,
               'admission_date', s.admission_date, 'status', s.status, 'address', s.address, 'village_town', s.village_town, 'district', s.district, 'pincode', s.pincode,
               'sectionId', e.section_id, 'classId', c.id, 'className', c.name, 'classOrder', coalesce(c.sort_order, 999), 'section', sec.name, 'rollNo', e.roll_no,
               'guardians', coalesce((select jsonb_agg(jsonb_build_object('relation', sg.relation, 'name', g.full_name, 'phone', g.phone, 'occupation', g.occupation, 'isPrimary', sg.is_primary)
                                             order by sg.is_primary desc, sg.relation)
                                        from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id where sg.student_id = s.id), '[]'::jsonb))
             || case when v_manage and coalesce(p_full, false) then jsonb_build_object(
                  'details', coalesce(pr.details, '{}'::jsonb),
                  'masked', coalesce((select jsonb_object_agg(v.field_key, v.value_last4) from public.student_secure_values v where v.student_id = s.id), '{}'::jsonb))
                else '{}'::jsonb end
             || case when v_manage then jsonb_build_object(
                  'missingDocsCount', (select count(*) from public.student_document_types t
                                        where t.required and t.is_active and not exists (select 1 from public.student_documents d where d.student_id = s.id and d.doc_type = t.code)),
                  'missingGovCount', (select count(*) from public.student_field_definitions f
                                       where f.is_active and f.required_for_gov
                                         and ((f.sensitive and not exists (select 1 from public.student_secure_values v where v.student_id = s.id and v.field_key = f.key))
                                           or (not f.sensitive and coalesce(pr.details ->> f.key, '') = ''))))
                else '{}'::jsonb end
             || case when v_manage and coalesce(p_full, false) then jsonb_build_object(
                  'missingDocs', coalesce((select jsonb_agg(t.label order by t.sort_order) from public.student_document_types t
                                            where t.required and t.is_active and not exists (select 1 from public.student_documents d where d.student_id = s.id and d.doc_type = t.code)), '[]'::jsonb),
                  'missingGov', coalesce((select jsonb_agg(f.label order by f.sort_order) from public.student_field_definitions f
                                           where f.is_active and f.required_for_gov
                                             and ((f.sensitive and not exists (select 1 from public.student_secure_values v where v.student_id = s.id and v.field_key = f.key))
                                               or (not f.sensitive and coalesce(pr.details ->> f.key, '') = ''))), '[]'::jsonb))
                else '{}'::jsonb end
             order by p.ord), '[]'::jsonb))
    into r
    from page p
    join public.students s on s.id = p.id
    left join public.student_enrollments e on e.student_id = s.id and e.academic_year_id = p_year
    left join public.sections sec on sec.id = e.section_id
    left join public.classes c on c.id = sec.class_id
    left join public.student_profiles pr on pr.student_id = s.id and v_manage;

  -- no page rows (e.g. past the end): still report the total
  if r is null then
    r := jsonb_build_object('total', 0, 'rows', '[]'::jsonb);
  end if;
  return r;
end $$;
revoke execute on function public.students_page(uuid, text, uuid, uuid, text, text, text, text, boolean, text, text, integer, integer, uuid[], boolean) from public, anon;
grant execute on function public.students_page(uuid, text, uuid, uuid, text, text, text, text, boolean, text, text, integer, integer, uuid[], boolean) to authenticated;
