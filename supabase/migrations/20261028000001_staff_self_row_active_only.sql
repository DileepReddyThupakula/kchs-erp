-- A person may read their OWN staff row only while they are active and have a role.
-- Before: user_id = auth.uid() alone, so a deactivated / left / role-revoked person with a
-- still-valid sign-in token could still read their own staff record. Now they get nothing.
drop policy staff_select on public.staff;
create policy staff_select on public.staff for select to authenticated
  using (
    (select app.is_office())
    or (user_id = (select auth.uid()) and status = 'active' and app_role is not null)
  );
