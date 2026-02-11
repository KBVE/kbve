create or replace function gen_ulid()
returns text
language plpgsql
as $$
declare
  time_part text := to_hex((extract(epoch from clock_timestamp()) * 1000)::bigint);
  rand_part text := encode(extensions.gen_random_bytes(10), 'hex');
begin
  return lpad(time_part, 12, '0') || rand_part;
end;
$$;