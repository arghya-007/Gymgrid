"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";

export interface UpdateMemberState {
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

export async function updateMemberProfile(
  organizationSlug: string,
  memberId: string,
  _previousState: UpdateMemberState,
  formData: FormData,
): Promise<UpdateMemberState> {
  const fullName = textField(formData, "fullName");
  const preferredName = textField(formData, "preferredName");
  const phone = textField(formData, "phone");
  const email = textField(formData, "email").toLowerCase();
  const dateOfBirth = textField(formData, "dateOfBirth");
  const gender = textField(formData, "gender");
  const notes = textField(formData, "notes");
  const consentConfirmed = formData.get("consentConfirmed") === "on";

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

  if (!membership.canManageMembers) {
    return {
      status: "error",
      message: "Your role does not permit member profile changes.",
    };
  }

  const { error } = await supabase.rpc("update_member_profile", {
    p_organization_id: membership.organization.id,
    p_member_id: memberId,
    p_full_name: fullName,
    p_phone: phone,
    p_email: email || null,
    p_preferred_name: preferredName || null,
    p_date_of_birth: dateOfBirth || null,
    p_gender: gender || null,
    p_notes: notes || null,
    p_consent_confirmed: consentConfirmed,
    p_consent_version: consentConfirmed ? "2026-10-v1" : null,
  });

  if (error) {
    console.error("Member profile update failed", { code: error.code });

    if (error.code === "42501") {
      return {
        status: "error",
        message: "Your role does not permit changes for this member.",
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
      message: "The member profile could not be updated. Please try again.",
    };
  }

  const memberPath = `/gym/${organizationSlug}/members/${memberId}`;
  revalidatePath(memberPath);
  revalidatePath(`/gym/${organizationSlug}/members`);
  redirect(`${memberPath}?profile=updated`);
}
