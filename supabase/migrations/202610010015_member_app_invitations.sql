-- GymGrid Phase 6: securely invite and link a member's Auth account.

alter table public.organization_invitations
  add column member_id uuid;

alter table public.organization_invitations
  add constraint organization_invitations_member_fk
  foreign key (member_id, organization_id)
  references public.members (id, organization_id) on delete cascade;

create index organization_invitations_member_idx
  on public.organization_invitations (organization_id, member_id, status)
  where member_id is not null;

create or replace function public.create_member_invitation(
  p_organization_id uuid,
  p_member_id uuid,
  p_email text
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
  v_member public.members%rowtype;
  v_invitation_id uuid;
begin
  if v_actor_id is null then
    raise exception 'authentication is required' using errcode = '42501';
  end if;

  if v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invitation email is invalid' using errcode = '22023';
  end if;

  select m.* into v_member
  from public.members m
  where m.id = p_member_id
    and m.organization_id = p_organization_id
  for update;

  if not found or v_member.status <> 'active' then
    raise exception 'member is unavailable' using errcode = '22023';
  end if;

  if not public.has_branch_role(
    p_organization_id,
    v_member.home_branch_id,
    array['gym_owner', 'gym_manager', 'receptionist']::public.tenant_role[]
  ) then
    raise exception 'member invitation is not permitted' using errcode = '42501';
  end if;

  if v_member.auth_user_id is not null then
    raise exception 'member already has an app account' using errcode = '23505';
  end if;

  if exists (
    select 1
    from auth.users u
    join public.members linked_member on linked_member.auth_user_id = u.id
    where lower(u.email) = v_email
      and linked_member.organization_id = p_organization_id
      and linked_member.id <> p_member_id
  ) then
    raise exception 'email is already linked to another member' using errcode = '23505';
  end if;

  update public.organization_invitations
  set status = 'expired'
  where organization_id = p_organization_id
    and lower(email) = v_email
    and role = 'member'
    and status = 'pending'
    and expires_at <= now();

  update public.organization_invitations
  set status = 'revoked'
  where organization_id = p_organization_id
    and member_id = p_member_id
    and role = 'member'
    and status = 'pending';

  update public.members
  set email = v_email, updated_by = v_actor_id
  where id = p_member_id
    and organization_id = p_organization_id;

  insert into public.organization_invitations (
    organization_id,
    email,
    role,
    branch_id,
    member_id,
    status,
    invited_by
  ) values (
    p_organization_id,
    v_email,
    'member',
    v_member.home_branch_id,
    p_member_id,
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
  v_linked_count integer;
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

    if v_invitation.role = 'member' then
      if v_invitation.member_id is null then
        raise exception 'member invitation is missing its member link'
          using errcode = '22023';
      end if;

      if exists (
        select 1
        from public.members existing_member
        where existing_member.organization_id = v_invitation.organization_id
          and existing_member.auth_user_id = v_actor_id
          and existing_member.id <> v_invitation.member_id
      ) then
        raise exception 'account is already linked to another member'
          using errcode = '23505';
      end if;

      update public.members
      set
        auth_user_id = v_actor_id,
        email = v_email,
        updated_by = v_actor_id
      where id = v_invitation.member_id
        and organization_id = v_invitation.organization_id
        and status = 'active'
        and (auth_user_id is null or auth_user_id = v_actor_id);

      get diagnostics v_linked_count = row_count;
      if v_linked_count <> 1 then
        raise exception 'member app account could not be linked'
          using errcode = '23505';
      end if;
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

revoke all on function public.create_member_invitation(uuid, uuid, text)
  from public, anon;
grant execute on function public.create_member_invitation(uuid, uuid, text)
  to authenticated;
