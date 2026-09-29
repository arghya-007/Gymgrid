"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";

export interface CreateMemberState {
  status: "idle" | "error";
  message: string;
}

const genderValues = [
  "female",
  "male",
  "non_binary",
  "prefer_not_to_say",
] as const;

function textField(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export async function createMember(
  organizationSlug: string,
  _previousState: CreateMemberState,
  formData: FormData,
): Promise<CreateMemberState> {
  const fullName = textField(formData, "fullName");
  const preferredName = textField(formData, "preferredName");
  const phone = textField(formData, "phone");
  const email = textField(formData, "email").toLowerCase();
  const homeBranchId = textField(formData, "homeBranchId");
  const dateOfBirth = textField(formData, "dateOfBirth");
  const gender = textField(formData, "gender");
  const notes = textField(formData, "notes");

  if (
    fullName.length < 2 ||
    fullName.length > 120 ||
    preferredName.length > 80 ||
    phone.replace(/\D/g, "").length < 10 ||
    (email && !/^\S+@\S+\.\S+$/.test(email)) ||
    (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) ||
    (gender && !genderValues.includes(gender as (typeof genderValues)[number])) ||
    notes.length > 2000
  ) {
    return {
      status: "error",
      message: "Review the member name, phone, email, date, and notes.",
    };
  }

  const { membership, supabase } =
    await requireTenantMembership(organizationSlug);
  const branch = membership.branches.find(
    (candidate) =>
      candidate.id === homeBranchId && candidate.status === "active",
  );

  if (!membership.canManageMembers || !branch) {
    return {
      status: "error",
      message: "You do not have permission to add members to that branch.",
    };
  }

  const { data, error } = await supabase.rpc("create_member", {
    p_organization_id: membership.organization.id,
    p_home_branch_id: branch.id,
    p_full_name: fullName,
    p_phone: phone,
    p_email: email || null,
    p_preferred_name: preferredName || null,
    p_date_of_birth: dateOfBirth || null,
    p_gender: gender || null,
    p_notes: notes || null,
  });

  if (error) {
    console.error("Member creation failed", { code: error.code });

    if (error.code === "42501") {
      return {
        status: "error",
        message: "Your role does not permit member creation for this branch.",
      };
    }

    if (error.code === "22023" || error.code === "23514") {
      return {
        status: "error",
        message: "One or more member details are invalid.",
      };
    }

    return {
      status: "error",
      message: "The member could not be created. Please try again.",
    };
  }

  const memberCode = Array.isArray(data) ? data[0]?.member_code : undefined;
  const membersPath = `/gym/${organizationSlug}/members`;
  revalidatePath(membersPath);
  revalidatePath(`/gym/${organizationSlug}`);
  redirect(
    memberCode
      ? `${membersPath}?created=${encodeURIComponent(memberCode)}`
      : membersPath,
  );
}
