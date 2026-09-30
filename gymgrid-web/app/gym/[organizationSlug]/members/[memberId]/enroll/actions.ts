"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";

export interface EnrollMemberState {
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

export async function enrollMember(
  organizationSlug: string,
  memberId: string,
  _previousState: EnrollMemberState,
  formData: FormData,
): Promise<EnrollMemberState> {
  const membershipPlanId = textField(formData, "membershipPlanId");
  const startDate = textField(formData, "startDate");
  const notes = textField(formData, "notes");
  const parsedStartDate = new Date(`${startDate}T00:00:00Z`);

  if (
    !isUuid(memberId) ||
    !isUuid(membershipPlanId) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    Number.isNaN(parsedStartDate.getTime()) ||
    parsedStartDate.toISOString().slice(0, 10) !== startDate ||
    notes.length > 2000
  ) {
    return {
      status: "error",
      message: "Select a plan and review the start date and notes.",
    };
  }

  const { membership, supabase } =
    await requireTenantMembership(organizationSlug);

  if (!membership.canManageMemberships) {
    return {
      status: "error",
      message: "Your role does not permit member enrolments.",
    };
  }

  const memberResult = await supabase
    .from("members")
    .select("id, home_branch_id, status")
    .eq("organization_id", membership.organization.id)
    .eq("id", memberId)
    .maybeSingle();
  const member = memberResult.data as {
    id: string;
    home_branch_id: string;
    status: string;
  } | null;

  if (
    memberResult.error ||
    !member ||
    member.status !== "active" ||
    !membership.branches.some(
      (branch) => branch.id === member.home_branch_id && branch.status === "active",
    )
  ) {
    return {
      status: "error",
      message: "This member is not available in your active branch scope.",
    };
  }

  const { data, error } = await supabase.rpc("enroll_member", {
    p_organization_id: membership.organization.id,
    p_member_id: memberId,
    p_membership_plan_id: membershipPlanId,
    p_start_date: startDate,
    p_notes: notes || null,
  });

  if (error) {
    console.error("Member enrolment failed", { code: error.code });

    if (error.code === "42501") {
      return { status: "error", message: "You cannot enrol this member." };
    }
    if (error.code === "23P01") {
      return {
        status: "error",
        message: "These dates overlap an existing membership.",
      };
    }
    if (error.code === "P0003") {
      return {
        status: "error",
        message: "This gym has reached its active-member allowance.",
      };
    }
    if (["22007", "22023", "23503", "23514"].includes(error.code)) {
      return {
        status: "error",
        message: "The member, plan, or start date is unavailable.",
      };
    }

    return {
      status: "error",
      message: "The membership could not be created. Please try again.",
    };
  }

  const enrollmentCode = Array.isArray(data)
    ? data[0]?.enrollment_code
    : undefined;
  const membersPath = `/gym/${organizationSlug}/members`;
  const memberPath = `${membersPath}/${memberId}`;
  revalidatePath(membersPath);
  revalidatePath(memberPath);
  redirect(
    enrollmentCode
      ? `${memberPath}?enrolled=${encodeURIComponent(enrollmentCode)}`
      : memberPath,
  );
}
