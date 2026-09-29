"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformAdministrator } from "@/lib/auth";

export interface TenantOnboardingState {
  status: "idle" | "error" | "success";
  message: string;
  organizationId?: string;
}

function textField(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export async function createTenant(
  _previousState: TenantOnboardingState,
  formData: FormData,
): Promise<TenantOnboardingState> {
  const organizationName = textField(formData, "organizationName");
  const organizationSlug = textField(formData, "organizationSlug").toLowerCase();
  const branchName = textField(formData, "branchName");
  const branchCode = textField(formData, "branchCode").toUpperCase();
  const ownerEmail = textField(formData, "ownerEmail").toLowerCase();
  const planCode = textField(formData, "planCode");
  const subscriptionStart = textField(formData, "subscriptionStart");

  if (
    organizationName.length < 2 ||
    branchName.length < 2 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(organizationSlug) ||
    !/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(branchCode) ||
    !/^\S+@\S+\.\S+$/.test(ownerEmail) ||
    !["launch", "growth", "scale", "enterprise"].includes(planCode) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(subscriptionStart)
  ) {
    return {
      status: "error",
      message: "Review the organization, branch, owner, plan, and date values.",
    };
  }

  const { supabase } = await requirePlatformAdministrator();
  const { data, error } = await supabase.rpc("platform_create_tenant", {
    p_organization_name: organizationName,
    p_organization_slug: organizationSlug,
    p_branch_name: branchName,
    p_branch_code: branchCode,
    p_owner_email: ownerEmail,
    p_plan_code: planCode,
    p_subscription_start: subscriptionStart,
  });

  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: "That organization slug is already in use." };
    }

    console.error("Tenant onboarding failed", { code: error.code });
    return {
      status: "error",
      message: "The organization could not be created. Review the database logs.",
    };
  }

  const organizationId = Array.isArray(data) ? data[0]?.organization_id : undefined;
  revalidatePath("/platform");

  return {
    status: "success",
    message: "Organization, main branch, owner invitation, and subscription were created.",
    organizationId,
  };
}
