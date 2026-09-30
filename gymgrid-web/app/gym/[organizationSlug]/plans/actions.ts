"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import type { MembershipPlanDurationUnit } from "./types";

export interface SaveMembershipPlanState {
  status: "idle" | "error";
  message: string;
}

const durationUnits: MembershipPlanDurationUnit[] = [
  "day",
  "week",
  "month",
  "year",
];

function textField(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function parseAmountMinor(value: string) {
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) {
    return null;
  }

  const [rupees, paise = ""] = value.split(".");
  return Number(rupees) * 100 + Number(paise.padEnd(2, "0"));
}

export async function saveMembershipPlan(
  organizationSlug: string,
  membershipPlanId: string | null,
  _previousState: SaveMembershipPlanState,
  formData: FormData,
): Promise<SaveMembershipPlanState> {
  const code = textField(formData, "code").toUpperCase();
  const name = textField(formData, "name");
  const description = textField(formData, "description");
  const branchId = textField(formData, "branchId") || null;
  const durationValue = Number(textField(formData, "durationValue"));
  const durationUnit = textField(formData, "durationUnit") as MembershipPlanDurationUnit;
  const priceAmountMinor = parseAmountMinor(textField(formData, "price"));
  const joiningFeeAmountMinor = parseAmountMinor(
    textField(formData, "joiningFee") || "0",
  );
  const taxInclusive = formData.get("taxInclusive") === "on";
  const active = formData.get("active") === "on";

  if (
    !/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(code) ||
    name.length < 2 ||
    name.length > 120 ||
    description.length > 1000 ||
    !Number.isInteger(durationValue) ||
    durationValue < 1 ||
    durationValue > 3650 ||
    !durationUnits.includes(durationUnit) ||
    priceAmountMinor === null ||
    joiningFeeAmountMinor === null
  ) {
    return {
      status: "error",
      message: "Review the plan code, name, duration, description, and INR amounts.",
    };
  }

  const { membership, supabase } =
    await requireTenantMembership(organizationSlug);

  if (!membership.canManageMembershipPlans) {
    return {
      status: "error",
      message: "Your role does not permit membership-plan changes.",
    };
  }

  if (branchId) {
    const branch = membership.branches.find(
      (candidate) => candidate.id === branchId && candidate.status === "active",
    );
    if (!branch) {
      return {
        status: "error",
        message: "You do not have access to the selected branch.",
      };
    }
  } else if (!membership.canManageOrganization) {
    return {
      status: "error",
      message: "Only organization-wide owners or managers can manage all-branch plans.",
    };
  }

  const commonArguments = {
    p_organization_id: membership.organization.id,
    p_branch_id: branchId,
    p_code: code,
    p_name: name,
    p_description: description || null,
    p_duration_value: durationValue,
    p_duration_unit: durationUnit,
    p_price_amount_minor: priceAmountMinor,
    p_joining_fee_amount_minor: joiningFeeAmountMinor,
    p_tax_inclusive: taxInclusive,
    p_active: active,
  };
  const result = membershipPlanId
    ? await supabase.rpc("update_membership_plan", {
        p_membership_plan_id: membershipPlanId,
        ...commonArguments,
      })
    : await supabase.rpc("create_membership_plan", commonArguments);

  if (result.error) {
    console.error("Membership plan save failed", { code: result.error.code });

    if (result.error.code === "23505") {
      return {
        status: "error",
        message: "That plan code is already used by this organization.",
      };
    }

    if (result.error.code === "42501") {
      return {
        status: "error",
        message: "Your role cannot manage plans for that scope.",
      };
    }

    if (["22023", "23502", "23514"].includes(result.error.code)) {
      return {
        status: "error",
        message: "One or more membership-plan values are invalid.",
      };
    }

    return {
      status: "error",
      message: "The membership plan could not be saved. Please try again.",
    };
  }

  const savedCode = Array.isArray(result.data)
    ? result.data[0]?.membership_plan_code
    : code;
  const plansPath = `/gym/${organizationSlug}/plans`;
  revalidatePath(plansPath);
  revalidatePath(`/gym/${organizationSlug}`);
  redirect(`${plansPath}?saved=${encodeURIComponent(savedCode ?? code)}`);
}
