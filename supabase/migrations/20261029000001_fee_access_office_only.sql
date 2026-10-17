-- FEE ACCESS: only the Admin, and office staff the Admin has picked one by one. NEVER a teacher.
--   * "Office staff" (database role computer_staff) becomes assignable by Admin. It is NOT a super role any more:
--     it has no implicit duties and no implicit reading rights; it gets exactly the duties the Admin grants (like a teacher),
--     and ONLY an office person can be given the fee_collection duty.
--   * has_duty('fee_collection') is true for Admin, and for office staff with an explicit grant. For a teacher it is always false,
--     even if a stray grant row exists. Removing the grant (or the role, or deactivating) stops access at once: the check is live.
--   * every fee table, fee setting, fee function and the payment QR file already ask app.has_fee_access() = has_duty('fee_collection'),
--     so this single rule covers all of them.

-- 1. Office staff can be assigned (Admin only, as for every staff change)
drop trigger if exists staff_block_computer_staff on public.staff;
drop function if exists app.block_computer_staff_role();

-- 2. Admin: every duty. Teacher and office staff: only the duties granted to them, and fee_collection only for office staff.
create or replace function public.has_duty(p_duty public.staff_duty) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    app.current_app_role() = 'admin'
    or (app.current_app_role() in ('teacher', 'computer_staff')
        and (p_duty <> 'fee_collection' or app.current_app_role() = 'computer_staff')
        and exists (select 1 from public.staff_permissions p
                    where p.staff_id = app.current_staff_id() and p.duty = p_duty)),
    false)
$$;

-- 3. The office role no longer reads or manages everything by itself: that is the Admin's. Everything else comes from duties.
create or replace function app.is_office() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(app.current_app_role() = 'admin', false)
$$;

-- 4. The database refuses to give the fee duty to anyone but office staff, and takes it back if the role changes
create or replace function app.check_fee_duty_holder() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.duty = 'fee_collection'
     and not exists (select 1 from public.staff s where s.id = new.staff_id and s.app_role = 'computer_staff') then
    raise exception 'Fee access can only be given to office staff, never to a teacher or Admin' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger staff_permissions_fee_office_only before insert or update on public.staff_permissions
  for each row execute function app.check_fee_duty_holder();

create or replace function app.drop_fee_duty_on_role_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.app_role is distinct from 'computer_staff' then
    delete from public.staff_permissions where staff_id = new.id and duty = 'fee_collection';
  end if;
  return new;
end $$;
create trigger staff_drop_fee_duty after update of app_role on public.staff
  for each row execute function app.drop_fee_duty_on_role_change();

-- 5. Clean up: any teacher who holds the fee duty loses it (audited by the normal delete trigger)
delete from public.staff_permissions p
 using public.staff s
 where s.id = p.staff_id and p.duty = 'fee_collection' and s.app_role is distinct from 'computer_staff';
