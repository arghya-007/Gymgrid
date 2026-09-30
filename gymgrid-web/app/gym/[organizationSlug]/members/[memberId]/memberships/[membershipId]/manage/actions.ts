"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";

export interface MembershipLifecycleState {
  status: "idle" | "error";
  message: string;
}

function textField(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function lifecycleContext(
  organizationSlug: string,
  memberId: string,
  membershipId: string,
) {
  if (!isUuid(memberId) || !isUuid(membershipId)) return null;
  const context = await requireTenantMembership(organizationSlug);
  if (!context.membership.canManageMemberships) return null;

  const result = await context.supabase
    .from("member_membership_statuses")
    .select("id, member_id, branch_id, status")
    .eq("organization_id", context.membership.organization.id)
    .eq("member_id", memberId)
    .eq("id", membershipId)
    .maybeSingle();
  const target = result.data as { branch_id: string; status: string } | null;

  if (
    result.error ||
    !target ||
    !context.membership.branches.some(
      (branch) => branch.id === target.branch_id && branch.status === "active",
    )
  ) return null;

  return { ...context, target };
}

function completeLifecycle(
  organizationSlug: string,
  memberId: string,
  outcome: "frozen" | "resumed" | "cancelled",
): never {
  const membersPath = `/gym/${organizationSlug}/members`;
  const memberPath = `${membersPath}/${memberId}`;
  revalidatePath(membersPath);
  revalidatePath(memberPath);
  redirect(`${memberPath}?lifecycle=${outcome}`);
}

function lifecycleError(code: string | undefined, operation: string) {
  if (code === "42501") return `You cannot ${operation} this membership.`;
  if (code === "23P01") return "This change would overlap another membership.";
  if (["22023", "23503", "23514"].includes(code ?? "")) {
    return `This membership cannot be ${operation}d in its current state.`;
  }
  return `The membership could not be ${operation}d. Please try again.`;
}

export async function freezeMembership(
  organizationSlug: string,
  memberId: string,
  membershipId: string,
  _previousState: MembershipLifecycleState,
  formData: FormData,
): Promise<MembershipLifecycleState> {
  const reason = textField(formData, "reason");
  if (reason.length > 500) return { status: "error", message: "Keep the freeze reason within 500 characters." };

  const context = await lifecycleContext(organizationSlug, memberId, membershipId);
  if (!context || context.target.status !== "active") {
    return { status: "error", message: "This membership is not available to freeze." };
  }

  const { error } = await context.supabase.rpc("freeze_membership", {
    p_organization_id: context.membership.organization.id,
    p_membership_id: membershipId,
    p_effective_date: null,
    p_reason: reason || null,
  });
  if (error) {
    console.error("Membership freeze failed", { code: error.code });
    return { status: "error", message: lifecycleError(error.code, "freeze") };
  }

  return completeLifecycle(organizationSlug, memberId, "frozen");
}

export async function resumeMembership(
  organizationSlug: string,
  memberId: string,
  membershipId: string,
  _previousState: MembershipLifecycleState,
  _formData: FormData,
): Promise<MembershipLifecycleState> {
  void _previousState;
  void _formData;
  const context = await lifecycleContext(organizationSlug, memberId, membershipId);
  if (!context || context.target.status !== "frozen") {
    return { status: "error", message: "This membership is not available to resume." };
  }

  const { error } = await context.supabase.rpc("resume_membership", {
    p_organization_id: context.membership.organization.id,
    p_membership_id: membershipId,
    p_effective_date: null,
  });
  if (error) {
    console.error("Membership resume failed", { code: error.code });
    return { status: "error", message: lifecycleError(error.code, "resume") };
  }

  return completeLifecycle(organizationSlug, memberId, "resumed");
}

export async function cancelMembership(
  organizationSlug: string,
  memberId: string,
  membershipId: string,
  _previousState: MembershipLifecycleState,
  formData: FormData,
): Promise<MembershipLifecycleState> {
  const reason = textField(formData, "reason");
  if (reason.length < 2 || reason.length > 500) {
    return { status: "error", message: "Enter a cancellation reason between 2 and 500 characters." };
  }

  const context = await lifecycleContext(organizationSlug, memberId, membershipId);
  if (!context || !["active", "scheduled", "frozen"].includes(context.target.status)) {
    return { status: "error", message: "This membership is not available to cancel." };
  }

  const { error } = await context.supabase.rpc("cancel_membership", {
    p_organization_id: context.membership.organization.id,
    p_membership_id: membershipId,
    p_effective_date: null,
    p_reason: reason,
  });
  if (error) {
    console.error("Membership cancellation failed", { code: error.code });
    return { status: "error", message: lifecycleError(error.code, "cancel") };
  }

  return completeLifecycle(organizationSlug, memberId, "cancelled");
}
