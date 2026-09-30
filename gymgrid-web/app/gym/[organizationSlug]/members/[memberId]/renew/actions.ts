"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";

export interface RenewMembershipState {
  status: "idle" | "error";
  message: string;
}

function textField(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isValidOptionalDate(value: string) {
  if (!value) return true;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export async function renewMembership(
  organizationSlug: string,
  memberId: string,
  sourceMembershipId: string,
  _previousState: RenewMembershipState,
  formData: FormData,
): Promise<RenewMembershipState> {
  const membershipPlanId = textField(formData, "membershipPlanId");
  const startDate = textField(formData, "startDate");
  const notes = textField(formData, "notes");

  if (
    !isUuid(memberId) ||
    !isUuid(sourceMembershipId) ||
    !isUuid(membershipPlanId) ||
    !isValidOptionalDate(startDate) ||
    notes.length > 2000
  ) {
    return { status: "error", message: "Review the plan, start date, and notes." };
  }

  const { membership, supabase } =
    await requireTenantMembership(organizationSlug);

  if (!membership.canManageMemberships) {
    return { status: "error", message: "Your role does not permit membership renewals." };
  }

  const sourceResult = await supabase
    .from("member_membership_statuses")
    .select("id, member_id, branch_id, status")
    .eq("organization_id", membership.organization.id)
    .eq("id", sourceMembershipId)
    .eq("member_id", memberId)
    .maybeSingle();

  const source = sourceResult.data as {
    id: string;
    member_id: string;
    branch_id: string;
    status: string;
  } | null;

  if (
    sourceResult.error ||
    !source ||
    ["frozen", "cancelled"].includes(source.status) ||
    !membership.branches.some(
      (branch) => branch.id === source.branch_id && branch.status === "active",
    )
  ) {
    return { status: "error", message: "This membership is not available for renewal." };
  }

  const { data, error } = await supabase.rpc("renew_membership", {
    p_organization_id: membership.organization.id,
    p_source_membership_id: sourceMembershipId,
    p_membership_plan_id: membershipPlanId,
    p_start_date: startDate || null,
    p_notes: notes || null,
  });

  if (error) {
    console.error("Membership renewal failed", { code: error.code });

    if (error.code === "42501") {
      return { status: "error", message: "You cannot renew this membership." };
    }
    if (error.code === "23P01") {
      return { status: "error", message: "The renewal overlaps another membership." };
    }
    if (error.code === "P0003") {
      return { status: "error", message: "This gym has reached its active-member allowance." };
    }
    if (["22007", "22023", "23503", "23514"].includes(error.code)) {
      return { status: "error", message: "The membership, plan, or start date is unavailable." };
    }

    return { status: "error", message: "The membership could not be renewed. Please try again." };
  }

  const enrollmentCode = Array.isArray(data) ? data[0]?.enrollment_code : undefined;
  const membersPath = `/gym/${organizationSlug}/members`;
  const memberPath = `${membersPath}/${memberId}`;
  revalidatePath(membersPath);
  revalidatePath(memberPath);
  redirect(
    enrollmentCode
      ? `${memberPath}?renewed=${encodeURIComponent(enrollmentCode)}`
      : `${memberPath}?renewed=membership`,
  );
}
