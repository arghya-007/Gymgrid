-- GymGrid Phase 5: allow a linked member to read only their own
-- membership history and manual payment receipts in the mobile app.

create policy member_memberships_select_self
  on public.member_memberships
  for select to authenticated
  using (
    public.has_branch_role(
      organization_id,
      branch_id,
      array['member']::public.tenant_role[]
    )
    and exists (
      select 1
      from public.members m
      where m.id = member_memberships.member_id
        and m.organization_id = member_memberships.organization_id
        and m.auth_user_id = auth.uid()
    )
  );

create policy manual_payments_select_self
  on public.manual_payments
  for select to authenticated
  using (
    public.has_branch_role(
      organization_id,
      branch_id,
      array['member']::public.tenant_role[]
    )
    and exists (
      select 1
      from public.members m
      where m.id = manual_payments.member_id
        and m.organization_id = manual_payments.organization_id
        and m.auth_user_id = auth.uid()
    )
  );
