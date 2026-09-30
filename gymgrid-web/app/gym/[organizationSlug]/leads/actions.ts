"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import type { LeadSource, LeadStatus } from "./types";

export interface LeadActionState {
  status: "idle" | "error";
  message: string;
}

const leadSources: LeadSource[] = [
  "walk_in",
  "referral",
  "website",
  "instagram",
  "facebook",
  "whatsapp",
  "phone",
  "other",
];
const editableStatuses: LeadStatus[] = [
  "new",
  "contacted",
  "trial_scheduled",
  "lost",
];

function textField(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function optionalUuid(value: string) {
  if (!value) {
    return null;
  }

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  )
    ? value
    : undefined;
}

function parseFollowUp(value: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export async function saveLead(
  organizationSlug: string,
  leadId: string | null,
  _previousState: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const fullName = textField(formData, "fullName");
  const phone = textField(formData, "phone");
  const email = textField(formData, "email").toLowerCase();
  const branchId = textField(formData, "branchId");
  const source = textField(formData, "source") as LeadSource;
  const status = leadId
    ? (textField(formData, "status") as LeadStatus)
    : "new";
  const interestedPlanId = optionalUuid(textField(formData, "interestedPlanId"));
  const followUpAt = parseFollowUp(textField(formData, "followUpAt"));
  const notes = textField(formData, "notes");
  const lostReason = textField(formData, "lostReason");

  if (
    fullName.length < 2 ||
    fullName.length > 120 ||
    phone.length < 8 ||
    phone.length > 24 ||
    (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ||
    !leadSources.includes(source) ||
    !editableStatuses.includes(status) ||
    interestedPlanId === undefined ||
    followUpAt === undefined ||
    notes.length > 2000 ||
    (status === "lost" && (lostReason.length < 2 || lostReason.length > 500))
  ) {
    return {
      status: "error",
      message: "Review the contact details, lead status, follow-up, and notes.",
    };
  }

  const { membership, supabase } =
    await requireTenantMembership(organizationSlug);

  if (!membership.canManageLeads) {
    return {
      status: "error",
      message: "Your role does not permit lead changes.",
    };
  }

  if (
    !membership.branches.some(
      (branch) => branch.id === branchId && branch.status === "active",
    )
  ) {
    return {
      status: "error",
      message: "Select an active branch available to your role.",
    };
  }

  const commonArguments = {
    p_organization_id: membership.organization.id,
    p_branch_id: branchId,
    p_full_name: fullName,
    p_phone: phone,
    p_email: email || null,
    p_source: source,
    p_interested_plan_id: interestedPlanId,
    p_follow_up_at: followUpAt,
    p_notes: notes || null,
  };
  const result = leadId
    ? await supabase.rpc("update_lead", {
        p_lead_id: leadId,
        ...commonArguments,
        p_status: status,
        p_lost_reason: status === "lost" ? lostReason : null,
      })
    : await supabase.rpc("create_lead", commonArguments);

  if (result.error) {
    console.error("Lead save failed", { code: result.error.code });

    if (result.error.code === "42501") {
      return {
        status: "error",
        message: "Your role cannot manage leads for that branch.",
      };
    }

    if (["22023", "23502", "23514", "23503"].includes(result.error.code)) {
      return {
        status: "error",
        message: "One or more lead values are invalid or unavailable.",
      };
    }

    return {
      status: "error",
      message: "The lead could not be saved. Please try again.",
    };
  }

  const savedCode = Array.isArray(result.data)
    ? result.data[0]?.lead_code
    : "lead";
  const leadsPath = `/gym/${organizationSlug}/leads`;
  revalidatePath(leadsPath);
  redirect(`${leadsPath}?saved=${encodeURIComponent(savedCode ?? "lead")}`);
}

export async function convertLead(
  organizationSlug: string,
  leadId: string,
  _previousState: LeadActionState,
  formData: FormData,
): Promise<LeadActionState> {
  const dateOfBirth = textField(formData, "dateOfBirth") || null;
  const gender = textField(formData, "gender") || null;
  const validGenders = [
    "female",
    "male",
    "non_binary",
    "prefer_not_to_say",
  ];

  if (
    !/^[0-9a-f-]{36}$/i.test(leadId) ||
    (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) ||
    (gender && !validGenders.includes(gender))
  ) {
    return { status: "error", message: "Review the conversion details." };
  }

  const { membership, supabase } =
    await requireTenantMembership(organizationSlug);

  if (!membership.canManageLeads) {
    return {
      status: "error",
      message: "Your role does not permit lead conversion.",
    };
  }

  const { data, error } = await supabase.rpc("convert_lead_to_member", {
    p_lead_id: leadId,
    p_organization_id: membership.organization.id,
    p_date_of_birth: dateOfBirth,
    p_gender: gender,
  });

  if (error) {
    console.error("Lead conversion failed", { code: error.code });
    return {
      status: "error",
      message:
        error.code === "42501"
          ? "Your role cannot convert this lead."
          : "This lead could not be converted. It may already be closed.",
    };
  }

  const memberCode = Array.isArray(data) ? data[0]?.member_code : "member";
  const leadsPath = `/gym/${organizationSlug}/leads`;
  revalidatePath(leadsPath);
  revalidatePath(`/gym/${organizationSlug}/members`);
  redirect(`${leadsPath}?converted=${encodeURIComponent(memberCode ?? "member")}`);
}
