create or replace function public.can_view_organization_profile(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_users mine
    join public.organization_user_roles mine_role
      on mine_role.organization_user_id = mine.id
    join public.organization_users theirs
      on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid()
      and mine.status = 'active'
      and mine_role.role in ('gym_owner', 'gym_manager')
      and mine_role.branch_id is null
      and theirs.user_id = p_user_id
  );
$$;

create or replace function public.create_staff_invitation(
  p_organization_id uuid,
  p_email text,
  p_role public.tenant_role,
  p_branch_id uuid default null
)
returns table (
  invitation_id uuid,
  invitation_email text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_email text := lower(trim(p_email));
  v_is_owner boolean;
  v_is_manager boolean;
  v_invitation_id uuid;
  v_staff_limit bigint;
  v_staff_count bigint;
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
      and o.status in ('trial', 'active')
  ) then
    raise exception 'organization is unavailable' using errcode = '22023';
  end if;

  v_is_owner := public.has_organization_role(
    p_organization_id,
    array['gym_owner']::public.tenant_role[]
  );
  v_is_manager := public.has_organization_role(
    p_organization_id,
    array['gym_manager']::public.tenant_role[]
  );

  if not (v_is_owner or v_is_manager) then
    raise exception 'staff invitation is not permitted' using errcode = '42501';
  end if;

  if p_role is null
    or not p_role = any (
      array['gym_manager', 'receptionist', 'trainer', 'accountant']::public.tenant_role[]
    ) then
    raise exception 'staff role is invalid' using errcode = '22023';
  end if;

  if p_role = 'gym_manager' and not v_is_owner then
    raise exception 'only an owner can invite a manager' using errcode = '42501';
  end if;

  if v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invitation email is invalid' using errcode = '22023';
  end if;

  if p_branch_id is not null and not exists (
    select 1
    from public.branches b
    where b.id = p_branch_id
      and b.organization_id = p_organization_id
      and b.status = 'active'
  ) then
    raise exception 'branch is unavailable' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.organization_users ou
    join auth.users u on u.id = ou.user_id
    where ou.organization_id = p_organization_id
      and lower(u.email) = v_email
  ) then
    raise exception 'this email already belongs to the organization' using errcode = '23505';
  end if;

  select se.limit_value into v_staff_limit
  from public.subscriptions s
  join public.subscription_entitlements se
    on se.subscription_id = s.id
    and se.organization_id = s.organization_id
  where s.organization_id = p_organization_id
    and s.status in ('trialing', 'active', 'past_due')
    and se.code = 'staff_users'
    and se.enabled
  order by s.created_at desc
  limit 1;

  if v_staff_limit is not null then
    select
      (
        select count(*)
        from public.organization_users ou
        where ou.organization_id = p_organization_id
          and ou.status in ('active', 'invited')
          and exists (
            select 1
            from public.organization_user_roles our
            where our.organization_user_id = ou.id
              and our.role <> 'member'
          )
      ) + (
        select count(*)
        from public.organization_invitations oi
        where oi.organization_id = p_organization_id
          and oi.status = 'pending'
          and oi.expires_at > now()
          and oi.role <> 'member'
      ) into v_staff_count;

    if v_staff_count >= v_staff_limit then
      raise exception 'staff user allowance has been reached' using errcode = 'P0003';
    end if;
  end if;

  insert into public.organization_invitations (
    organization_id,
    email,
    role,
    branch_id,
    status,
    invited_by
  ) values (
    p_organization_id,
    v_email,
    p_role,
    p_branch_id,
    'pending',
    v_actor_id
  )
  returning id into v_invitation_id;

  return query select v_invitation_id, v_email;
end;
$$;

create or replace function public.accept_my_organization_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_email text;
  v_membership_id uuid;
  v_accepted_count integer := 0;
  v_invitation record;
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = v_actor_id;

  if v_email is null then
    return 0;
  end if;

  update public.organization_invitations
  set status = 'expired'
  where lower(email) = v_email
    and status = 'pending'
    and expires_at <= now();

  for v_invitation in
    select oi.*
    from public.organization_invitations oi
    join public.organizations o on o.id = oi.organization_id
    where lower(oi.email) = v_email
      and oi.status = 'pending'
      and oi.expires_at > now()
      and o.status in ('trial', 'active')
    order by oi.created_at
    for update of oi
  loop
    insert into public.organization_users (
      organization_id,
      user_id,
      status,
      joined_at
    ) values (
      v_invitation.organization_id,
      v_actor_id,
      'active',
      now()
    )
    on conflict (organization_id, user_id) do nothing;

    select ou.id into v_membership_id
    from public.organization_users ou
    where ou.organization_id = v_invitation.organization_id
      and ou.user_id = v_actor_id
      and ou.status <> 'suspended';

    if v_membership_id is null then
      continue;
    end if;

    if not exists (
      select 1
      from public.organization_user_roles our
      where our.organization_user_id = v_membership_id
        and our.role = v_invitation.role
        and our.branch_id is not distinct from v_invitation.branch_id
    ) then
      insert into public.organization_user_roles (
        organization_id,
        organization_user_id,
        role,
        branch_id,
        granted_by
      ) values (
        v_invitation.organization_id,
        v_membership_id,
        v_invitation.role,
        v_invitation.branch_id,
        v_invitation.invited_by
      );
    end if;

    update public.organization_invitations
    set
      status = 'accepted',
      accepted_by = v_actor_id
    where id = v_invitation.id;

    v_accepted_count := v_accepted_count + 1;
  end loop;

  return v_accepted_count;
end;
$$;

create or replace function public.revoke_staff_invitation(
  p_organization_id uuid,
  p_invitation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_owner boolean;
  v_is_manager boolean;
  v_role public.tenant_role;
begin
  v_is_owner := public.has_organization_role(
    p_organization_id,
    array['gym_owner']::public.tenant_role[]
  );
  v_is_manager := public.has_organization_role(
    p_organization_id,
    array['gym_manager']::public.tenant_role[]
  );

  if not (v_is_owner or v_is_manager) then
    raise exception 'invitation revocation is not permitted' using errcode = '42501';
  end if;

  select oi.role into v_role
  from public.organization_invitations oi
  where oi.id = p_invitation_id
    and oi.organization_id = p_organization_id
    and oi.status = 'pending';

  if not found then
    raise exception 'pending invitation was not found' using errcode = '22023';
  end if;

  if v_role = 'gym_manager' and not v_is_owner then
    raise exception 'only an owner can revoke a manager invitation' using errcode = '42501';
  end if;

  update public.organization_invitations
  set status = 'revoked'
  where id = p_invitation_id
    and organization_id = p_organization_id;

  return true;
end;
$$;

create or replace function public.set_staff_membership_status(
  p_organization_id uuid,
  p_organization_user_id uuid,
  p_status public.organization_user_status
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_owner boolean;
  v_is_manager boolean;
  v_target_user_id uuid;
  v_target_has_owner boolean;
  v_target_has_manager boolean;
begin
  if p_status not in ('active', 'suspended') then
    raise exception 'staff status is invalid' using errcode = '22023';
  end if;

  v_is_owner := public.has_organization_role(
    p_organization_id,
    array['gym_owner']::public.tenant_role[]
  );
  v_is_manager := public.has_organization_role(
    p_organization_id,
    array['gym_manager']::public.tenant_role[]
  );

  if not (v_is_owner or v_is_manager) then
    raise exception 'staff status management is not permitted' using errcode = '42501';
  end if;

  select ou.user_id into v_target_user_id
  from public.organization_users ou
  where ou.id = p_organization_user_id
    and ou.organization_id = p_organization_id;

  if not found then
    raise exception 'staff membership was not found' using errcode = '22023';
  end if;

  if v_target_user_id = v_actor_id then
    raise exception 'you cannot change your own staff status' using errcode = '42501';
  end if;

  select
    coalesce(bool_or(our.role = 'gym_owner'), false),
    coalesce(bool_or(our.role = 'gym_manager'), false)
    into v_target_has_owner, v_target_has_manager
  from public.organization_user_roles our
  where our.organization_user_id = p_organization_user_id;

  if v_target_has_owner then
    raise exception 'owner status cannot be changed here' using errcode = '42501';
  end if;

  if v_target_has_manager and not v_is_owner then
    raise exception 'only an owner can change a manager status' using errcode = '42501';
  end if;

  update public.organization_users
  set
    status = p_status,
    joined_at = case
      when p_status = 'active' then coalesce(joined_at, now())
      else joined_at
    end
  where id = p_organization_user_id
    and organization_id = p_organization_id;

  return true;
end;
$$;

create trigger organization_invitations_audit
  after insert or update or delete on public.organization_invitations
  for each row execute function public.capture_audit_change();

revoke all on function public.create_staff_invitation(
  uuid,
  text,
  public.tenant_role,
  uuid
) from public, anon;
revoke all on function public.accept_my_organization_invitations() from public, anon;
revoke all on function public.revoke_staff_invitation(uuid, uuid) from public, anon;
revoke all on function public.set_staff_membership_status(
  uuid,
  uuid,
  public.organization_user_status
) from public, anon;

grant execute on function public.create_staff_invitation(
  uuid,
  text,
  public.tenant_role,
  uuid
) to authenticated;
grant execute on function public.accept_my_organization_invitations() to authenticated;
grant execute on function public.revoke_staff_invitation(uuid, uuid) to authenticated;
grant execute on function public.set_staff_membership_status(
  uuid,
  uuid,
  public.organization_user_status
) to authenticated;
