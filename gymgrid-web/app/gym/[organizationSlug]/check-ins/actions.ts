"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";

export interface CheckInState {
  status: "idle" | "error";
  message: string;
}

function textField(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export async function recordMemberCheckIn(
  organizationSlug: string,
  _previousState: CheckInState,
  formData: FormData,
): Promise<CheckInState> {
  const memberId = textField(formData, "memberId");
  const branchId = textField(formData, "branchId");
  if (!/^[0-9a-f-]{36}$/i.test(memberId) || !/^[0-9a-f-]{36}$/i.test(branchId)) {
    return { status: "error", message: "The selected member or branch is invalid." };
  }

  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  const branch = membership.branches.find(
    (candidate) => candidate.id === branchId && candidate.status === "active",
  );
  if (!membership.canManageCheckIns || !branch) {
    return { status: "error", message: "Your role cannot record a check-in for that branch." };
  }

  const { error } = await supabase.rpc("record_member_check_in", {
    p_organization_id: membership.organization.id,
    p_branch_id: branch.id,
    p_member_id: memberId,
  });
  if (error) {
    console.error("Member check-in failed", { code: error.code });
    if (error.code === "23505") {
      return { status: "error", message: "This member was checked in less than two minutes ago." };
    }
    if (error.code === "P0002") {
      return { status: "error", message: "This member has no active membership at the selected branch." };
    }
    if (error.code === "42501") {
      return { status: "error", message: "Your role no longer permits check-ins for this branch." };
    }
    return { status: "error", message: "The check-in could not be recorded. Please try again." };
  }

  const memberResult = await supabase
    .from("members")
    .select("member_code")
    .eq("organization_id", membership.organization.id)
    .eq("id", memberId)
    .maybeSingle();
  const checkInsPath = `/gym/${organizationSlug}/check-ins`;
  revalidatePath(checkInsPath);
  revalidatePath(`/gym/${organizationSlug}`);
  const memberCode = typeof memberResult.data?.member_code === "string"
    ? memberResult.data.member_code
    : "member";
  redirect(`${checkInsPath}?branch=${encodeURIComponent(branch.id)}&checkedIn=${encodeURIComponent(memberCode)}`);
}
