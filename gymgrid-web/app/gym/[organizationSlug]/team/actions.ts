"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantMembership, type TenantRole } from "@/lib/tenant";

export interface InviteStaffState {
  status: "idle" | "error";
  message: string;
}

const invitationRoles: TenantRole[] = [
  "gym_manager",
  "receptionist",
  "trainer",
  "accountant",
];

function textField(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function inviteStaff(
  organizationSlug: string,
  _previousState: InviteStaffState,
  formData: FormData,
): Promise<InviteStaffState> {
  const email = textField(formData, "email").toLowerCase();
  const role = textField(formData, "role") as TenantRole;
  const branchId = textField(formData, "branchId") || null;

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !invitationRoles.includes(role)
  ) {
    return {
      status: "error",
      message: "Enter a valid email address and staff role.",
    };
  }

  const { membership, supabase } =
    await requireTenantMembership(organizationSlug);

  if (!membership.canManageTeam) {
    return {
      status: "error",
      message: "Your role does not permit staff invitations.",
    };
  }

  const isOwner = membership.roles.some(
    (assignment) =>
      assignment.role === "gym_owner" && assignment.branchId === null,
  );
  if (role === "gym_manager" && !isOwner) {
    return {
      status: "error",
      message: "Only a gym owner can invite another manager.",
    };
  }

  if (
    branchId &&
    !membership.branches.some(
      (branch) => branch.id === branchId && branch.status === "active",
    )
  ) {
    return {
      status: "error",
      message: "Select an active branch available to your account.",
    };
  }

  const { error } = await supabase.rpc("create_staff_invitation", {
    p_organization_id: membership.organization.id,
    p_email: email,
    p_role: role,
    p_branch_id: branchId,
  });

  if (error) {
    console.error("Staff invitation failed", { code: error.code });

    if (error.code === "23505") {
      return {
        status: "error",
        message: "This person already belongs to the gym or has a pending invitation.",
      };
    }

    if (error.code === "P0003") {
      return {
        status: "error",
        message: "This gym has reached its current staff-user allowance.",
      };
    }

    if (error.code === "42501") {
      return {
        status: "error",
        message: "Your role cannot create that invitation.",
      };
    }

    return {
      status: "error",
      message: "The staff invitation could not be created. Please try again.",
    };
  }

  const teamPath = `/gym/${organizationSlug}/team`;
  revalidatePath(teamPath);
  revalidatePath(`/gym/${organizationSlug}`);
  redirect(`${teamPath}?invited=${encodeURIComponent(email)}`);
}

export async function revokeStaffInvitation(
  organizationSlug: string,
  invitationId: string,
) {
  const { membership, supabase } =
    await requireTenantMembership(organizationSlug);

  if (!membership.canManageTeam || !isUuid(invitationId)) {
    redirect(`/gym/${organizationSlug}/team?error=action-not-permitted`);
  }

  const { error } = await supabase.rpc("revoke_staff_invitation", {
    p_organization_id: membership.organization.id,
    p_invitation_id: invitationId,
  });

  if (error) {
    console.error("Staff invitation revocation failed", { code: error.code });
    redirect(`/gym/${organizationSlug}/team?error=action-failed`);
  }

  const teamPath = `/gym/${organizationSlug}/team`;
  revalidatePath(teamPath);
  redirect(`${teamPath}?updated=invitation-revoked`);
}

export async function setStaffStatus(
  organizationSlug: string,
  organizationUserId: string,
  status: "active" | "suspended",
) {
  const { membership, supabase } =
    await requireTenantMembership(organizationSlug);

  if (
    !membership.canManageTeam ||
    !isUuid(organizationUserId) ||
    !["active", "suspended"].includes(status)
  ) {
    redirect(`/gym/${organizationSlug}/team?error=action-not-permitted`);
  }

  const { error } = await supabase.rpc("set_staff_membership_status", {
    p_organization_id: membership.organization.id,
    p_organization_user_id: organizationUserId,
    p_status: status,
  });

  if (error) {
    console.error("Staff status update failed", { code: error.code });
    redirect(`/gym/${organizationSlug}/team?error=action-failed`);
  }

  const teamPath = `/gym/${organizationSlug}/team`;
  revalidatePath(teamPath);
  revalidatePath(`/gym/${organizationSlug}`);
  redirect(`${teamPath}?updated=staff-${status}`);
}
