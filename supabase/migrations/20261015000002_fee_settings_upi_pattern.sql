-- Fix: Postgres regex repetition limit is 255 (the first pattern used 256).
alter table public.fee_settings drop constraint if exists fee_settings_upi_id_check;
alter table public.fee_settings add constraint fee_settings_upi_id_check
  check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z0-9.-]{2,64}$');
