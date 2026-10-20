-- Speed pass 2, fees pages: ONE database call per page instead of 11-20.
-- All three run as the signed-in person (SECURITY INVOKER), so the row-level rules are exactly the ones the separate queries used:
-- fee tables answer only to the Admin and to office staff who were given fee access; nobody else gets a single row.

-- Fees > Dues: the students who still owe, with their unpaid lines (balance = amount - concession - paid, in paise)
create or replace function public.fees_dues_page(p_year uuid, p_today date) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with spec as (select distinct fee_head_id from public.fee_campaigns),
  secs as (select s.id, s.name, s.class_id, c.name cname, c.sort_order corder from public.sections s join public.classes c on c.id = s.class_id where s.academic_year_id = p_year),
  d as (select x.*, (x.amount_paise - x.concession_paise - x.paid_paise) bal from public.student_fee_dues x where x.academic_year_id = p_year and x.voided_at is null),
  live as (select d.*, h.name hname, exists (select 1 from spec where spec.fee_head_id = d.fee_head_id) is_special from d join public.fee_heads h on h.id = d.fee_head_id where d.bal > 0),
  ph as (select distinct on (sg.student_id) sg.student_id, g.phone from public.student_guardians sg join public.guardians g on g.id = sg.guardian_id
          where g.phone is not null order by sg.student_id, sg.is_primary desc, sg.created_at),
  per as (select l.student_id, sum(l.bal) outstanding, coalesce(sum(l.bal) filter (where l.due_date < p_today), 0) overdue, min(l.due_date) next_due,
                 jsonb_agg(jsonb_build_object('id', l.id, 'headId', l.fee_head_id, 'headName', l.hname, 'isSpecial', l.is_special, 'label', l.label, 'dueDate', l.due_date, 'balance', l.bal) order by l.due_date, l.installment_seq) dues
            from live l group by l.student_id)
  select jsonb_build_object(
    'students', coalesce((select jsonb_agg(jsonb_build_object('studentId', st.id, 'name', st.full_name, 'adm', st.admission_no, 'classId', sc.class_id, 'sectionId', sc.id,
              'classLabel', coalesce(sc.cname || ' – ' || sc.name, 'Not enrolled'), 'classOrder', coalesce(sc.corder, 999), 'phone', ph.phone,
              'outstanding', per.outstanding, 'overdue', per.overdue, 'nextDue', per.next_due, 'dues', per.dues) order by per.next_due, st.full_name)
        from per join public.students st on st.id = per.student_id
        left join public.student_enrollments e on e.student_id = st.id and e.academic_year_id = p_year
        left join secs sc on sc.id = e.section_id left join ph on ph.student_id = st.id), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', t.class_id, 'name', t.cname) order by t.corder) from (select distinct class_id, cname, corder from secs) t), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'label', cname || ' – ' || name) order by corder, name) from secs), '[]'::jsonb),
    'heads', coalesce((select jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name, 'special', exists (select 1 from spec where spec.fee_head_id = h.id)) order by h.sort_order, h.name)
        from public.fee_heads h where exists (select 1 from d where d.fee_head_id = h.id)), '[]'::jsonb))
$$;

-- Fees > Receipts and Fee reports: the receipts of a date range (cancelled ones included, their numbers stay), newest first
create or replace function public.fees_receipts_page(p_year uuid, p_from date, p_to date) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with spec as (select distinct fee_head_id from public.fee_campaigns),
  dir as (select id, full_name from public.staff_directory()),
  rc as (select r.* from public.fee_receipts r where r.receipt_date >= p_from and r.receipt_date <= p_to),
  items as (select i.receipt_id, i.fee_head_id, sum(i.amount_paise) amt from public.fee_receipt_items i where i.receipt_id in (select id from rc) group by i.receipt_id, i.fee_head_id),
  heads as (select it.receipt_id, jsonb_agg(jsonb_build_object('headId', it.fee_head_id, 'headName', coalesce(h.name, '—'), 'amount', it.amt,
                   'isSpecial', exists (select 1 from spec where spec.fee_head_id = it.fee_head_id)) order by h.sort_order, h.name) js
              from items it left join public.fee_heads h on h.id = it.fee_head_id group by it.receipt_id)
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
          'id', r.id, 'receiptNo', r.receipt_no, 'date', r.receipt_date, 'studentId', r.student_id, 'studentName', coalesce(st.full_name, r.payer_name, '—'),
          'admissionNo', st.admission_no, 'classId', sc.class_id, 'className', c.name, 'total', r.total_paise, 'mode', r.payment_mode, 'reference', r.reference_no,
          'collectedBy', coalesce(dir.full_name, '—'), 'collectedById', r.collected_by, 'status', r.status, 'kind', r.kind, 'cancelReason', r.cancel_reason, 'notes', r.notes,
          'heads', coalesce(hd.js, '[]'::jsonb), 'createdAt', r.created_at) order by r.receipt_date desc, r.seq desc)
        from rc r left join public.students st on st.id = r.student_id
        left join public.student_enrollments e on e.student_id = r.student_id and e.academic_year_id = p_year
        left join public.sections sc on sc.id = e.section_id left join public.classes c on c.id = sc.class_id
        left join dir on dir.id = r.collected_by left join heads hd on hd.receipt_id = r.id), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by sort_order) from public.classes), '[]'::jsonb))
$$;

-- Fees > Fee setup: everything the five tabs need (raw rows, as the separate queries returned them)
create or replace function public.fees_setup_page(p_year uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'heads', coalesce((select jsonb_agg(to_jsonb(h) order by h.sort_order, h.name) from public.fee_heads h), '[]'::jsonb),
    'special', coalesce((select jsonb_agg(distinct fee_head_id) from public.fee_campaigns), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'sort_order', c.sort_order, 'is_active', c.is_active) order by c.sort_order) from public.classes c), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(to_jsonb(p) order by p.name) from public.fee_plans p where p.academic_year_id = p_year), '[]'::jsonb),
    'structure', coalesce((select jsonb_agg(to_jsonb(s)) from public.fee_structure s where s.academic_year_id = p_year), '[]'::jsonb),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(k) order by k.created_at desc) from public.fee_campaigns k where k.academic_year_id = p_year), '[]'::jsonb),
    'installments', coalesce((select jsonb_agg(to_jsonb(i) order by i.seq) from public.fee_plan_installments i where i.plan_id in (select id from public.fee_plans where academic_year_id = p_year)), '[]'::jsonb))
$$;

revoke execute on function public.fees_dues_page(uuid, date), public.fees_receipts_page(uuid, date, date), public.fees_setup_page(uuid) from public, anon;
grant execute on function public.fees_dues_page(uuid, date), public.fees_receipts_page(uuid, date, date), public.fees_setup_page(uuid) to authenticated;
