-- Module 1 fix: section medium check compared text to text[] (type error).
create or replace function app.check_section_medium() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  allowed text[];
begin
  if new.medium is null then
    return new;
  end if;
  select mediums into allowed from public.school_settings where id = 1;
  if not (new.medium = any (coalesce(allowed, '{}'))) then
    raise exception 'Medium "%" is not configured in school settings', new.medium using errcode = '23514';
  end if;
  return new;
end $$;
