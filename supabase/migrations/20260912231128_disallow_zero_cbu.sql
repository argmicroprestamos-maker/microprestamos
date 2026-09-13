create or replace function private.is_valid_cbu(p_cbu text)
returns boolean
language plpgsql
immutable
set search_path = private, pg_temp
as $$
declare
  first_weights integer[] := array[7, 1, 3, 9, 7, 1, 3];
  second_weights integer[] := array[3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3];
  total integer := 0;
  i integer;
begin
  if p_cbu !~ '^[0-9]{22}$' or p_cbu = '0000000000000000000000' then return false; end if;
  for i in 1..7 loop total := total + substring(p_cbu, i, 1)::integer * first_weights[i]; end loop;
  if ((10 - total % 10) % 10) <> substring(p_cbu, 8, 1)::integer then return false; end if;
  total := 0;
  for i in 1..13 loop total := total + substring(p_cbu, i + 8, 1)::integer * second_weights[i]; end loop;
  return ((10 - total % 10) % 10) = substring(p_cbu, 22, 1)::integer;
end;
$$;
