create table public.member_import_batches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  branch_id uuid not null,
  source_file_name text not null check (char_length(trim(source_file_name)) between 1 and 180),
  imported_count integer not null check (imported_count between 1 and 500),
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint member_import_batches_branch_fk
    foreign key (branch_id, organization_id)
    references public.branches (id, organization_id) on delete restrict,
  constraint member_import_batches_id_organization_unique unique (id, organization_id)
);

alter table public.members
  add column source_import_batch_id uuid,
  add constraint members_source_import_batch_fk
    foreign key (source_import_batch_id, organization_id)
    references public.member_import_batches (id, organization_id) on delete restrict;

create index member_import_batches_organization_created_idx
  on public.member_import_batches (organization_id, created_at desc);
create index members_source_import_batch_idx
  on public.members (organization_id, source_import_batch_id)
  where source_import_batch_id is not null;

create trigger member_import_batches_audit
  after insert or update or delete on public.member_import_batches
  for each row execute function public.capture_audit_change();

alter table public.member_import_batches enable row level security;

create policy member_import_batches_select on public.member_import_batches
  for select to authenticated
  using (
    public.is_platform_administrator()
    or public.has_branch_role(
      organization_id,
      branch_id,
      array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
    )
  );

create or replace function public.import_members(
  p_organization_id uuid,
  p_branch_id uuid,
  p_source_file_name text,
  p_rows jsonb
)
returns table (import_batch_id uuid, imported_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_row jsonb;
  v_row_number integer := 0;
  v_row_count integer;
  v_batch_id uuid;
  v_member_id uuid;
  v_phone_digits text;
  v_phone text;
  v_email text;
  v_gender public.member_gender;
  v_date_of_birth date;
  v_seen_phones text[] := array[]::text[];
  v_seen_emails text[] := array[]::text[];
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    p_branch_id,
    array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
  ) then
    raise exception 'member import is not permitted' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.branches b
    join public.organizations o on o.id = b.organization_id
    where b.id = p_branch_id
      and b.organization_id = p_organization_id
      and b.status = 'active'
      and o.status in ('trial', 'active')
  ) then
    raise exception 'organization or branch is unavailable' using errcode = '22023';
  end if;

  if char_length(trim(coalesce(p_source_file_name, ''))) not between 1 and 180 then
    raise exception 'source file name is invalid' using errcode = '22023';
  end if;

  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'import rows must be an array' using errcode = '22023';
  end if;

  v_row_count := jsonb_array_length(p_rows);
  if v_row_count not between 1 and 500 then
    raise exception 'member import must contain 1 to 500 rows' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('member-import:' || p_organization_id::text, 0));

  insert into public.member_import_batches (
    organization_id, branch_id, source_file_name, imported_count, created_by
  ) values (
    p_organization_id, p_branch_id, trim(p_source_file_name), v_row_count, v_actor_id
  ) returning id into v_batch_id;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_row_number := v_row_number + 1;

    if jsonb_typeof(v_row) <> 'object'
      or char_length(trim(coalesce(v_row ->> 'full_name', ''))) not between 2 and 120
      or char_length(coalesce(v_row ->> 'notes', '')) > 2000
      or (
        nullif(trim(coalesce(v_row ->> 'preferred_name', '')), '') is not null
        and char_length(trim(v_row ->> 'preferred_name')) not between 1 and 80
      ) then
      raise exception 'member import row % contains invalid text values', v_row_number using errcode = '22023';
    end if;

    v_phone_digits := regexp_replace(coalesce(v_row ->> 'phone', ''), '[^0-9]', '', 'g');
    if char_length(v_phone_digits) = 10 then
      v_phone := '+91' || v_phone_digits;
    elsif char_length(v_phone_digits) = 11 and left(v_phone_digits, 1) = '0' then
      v_phone := '+91' || right(v_phone_digits, 10);
    elsif char_length(v_phone_digits) = 12 and left(v_phone_digits, 2) = '91' then
      v_phone := '+' || v_phone_digits;
    elsif trim(coalesce(v_row ->> 'phone', '')) like '+%'
      and char_length(v_phone_digits) between 8 and 15 then
      v_phone := '+' || v_phone_digits;
    else
      raise exception 'member import row % contains an invalid phone', v_row_number using errcode = '22023';
    end if;

    v_email := lower(nullif(trim(coalesce(v_row ->> 'email', '')), ''));
    if v_email is not null and v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
      raise exception 'member import row % contains an invalid email', v_row_number using errcode = '22023';
    end if;

    begin
      v_date_of_birth := nullif(trim(coalesce(v_row ->> 'date_of_birth', '')), '')::date;
    exception when others then
      raise exception 'member import row % contains an invalid date of birth', v_row_number using errcode = '22023';
    end;
    if v_date_of_birth is not null
      and (v_date_of_birth < date '1900-01-01' or v_date_of_birth > current_date) then
      raise exception 'member import row % contains an invalid date of birth', v_row_number using errcode = '22023';
    end if;

    begin
      v_gender := nullif(trim(coalesce(v_row ->> 'gender', '')), '')::public.member_gender;
    exception when others then
      raise exception 'member import row % contains an invalid gender', v_row_number using errcode = '22023';
    end;

    if v_phone = any(v_seen_phones)
      or exists (
        select 1 from public.members m
        where m.organization_id = p_organization_id and m.phone = v_phone
      ) then
      raise exception 'member import row % duplicates an existing phone', v_row_number using errcode = '23505';
    end if;

    if v_email is not null and (
      v_email = any(v_seen_emails)
      or exists (
        select 1 from public.members m
        where m.organization_id = p_organization_id and lower(m.email) = v_email
      )
    ) then
      raise exception 'member import row % duplicates an existing email', v_row_number using errcode = '23505';
    end if;

    select result.member_id into v_member_id
    from public.create_member(
      p_organization_id,
      p_branch_id,
      v_row ->> 'full_name',
      v_phone,
      v_email,
      nullif(trim(coalesce(v_row ->> 'preferred_name', '')), ''),
      v_date_of_birth,
      v_gender,
      nullif(v_row ->> 'notes', '')
    ) result;

    update public.members
    set source_import_batch_id = v_batch_id
    where id = v_member_id and organization_id = p_organization_id;

    v_seen_phones := array_append(v_seen_phones, v_phone);
    if v_email is not null then v_seen_emails := array_append(v_seen_emails, v_email); end if;
  end loop;

  return query select v_batch_id, v_row_count;
end;
$$;

revoke all on table public.member_import_batches from anon, authenticated;
grant select on table public.member_import_batches to authenticated;
revoke all on function public.import_members(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.import_members(uuid, uuid, text, jsonb) to authenticated;
