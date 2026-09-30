import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import { MembershipPlanForm } from "../../plan-form";
import type {
  MembershipPlanDurationUnit,
  MembershipPlanFormValues,
} from "../../types";

interface MembershipPlanRow {
  id: string;
  branch_id: string | null;
  code: string;
  name: string;
  description: string | null;
  duration_value: number;
  duration_unit: MembershipPlanDurationUnit;
  price_amount_minor: number;
  joining_fee_amount_minor: number;
  tax_inclusive: boolean;
  active: boolean;
}

export default async function EditMembershipPlanPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; planId: string }>;
}) {
  const { organizationSlug, planId } = await params;
  const { membership, supabase } =
    await requireTenantMembership(organizationSlug);

  if (!membership.canManageMembershipPlans) {
    redirect(`/gym/${organizationSlug}/plans`);
  }

  const { data, error } = await supabase
    .from("membership_plans")
    .select(
      "id, branch_id, code, name, description, duration_value, duration_unit, price_amount_minor, joining_fee_amount_minor, tax_inclusive, active",
    )
    .eq("organization_id", membership.organization.id)
    .eq("id", planId)
    .maybeSingle();

  if (error) {
    console.error("Membership plan could not be loaded", { code: error.code });
    throw new Error("Membership plan could not be loaded.");
  }

  if (!data) {
    notFound();
  }

  const row = data as MembershipPlanRow;
  const initialPlan: MembershipPlanFormValues = {
    id: row.id,
    branchId: row.branch_id,
    code: row.code,
    name: row.name,
    description: row.description ?? "",
    durationValue: row.duration_value,
    durationUnit: row.duration_unit,
    priceAmountMinor: row.price_amount_minor,
    joiningFeeAmountMinor: row.joining_fee_amount_minor,
    taxInclusive: row.tax_inclusive,
    active: row.active,
  };
  const activeBranches = membership.branches.filter(
    (branch) => branch.status === "active",
  );

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-4xl">
        <Link
          className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
          href={`/gym/${organizationSlug}/plans`}
        >
          ← Membership plans
        </Link>
        <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
            Products and pricing
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Edit {initialPlan.name}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Update this offering or make it inactive. Existing enrolment history will remain intact.
          </p>
          <div className="mt-10">
            <MembershipPlanForm
              allowOrganizationWide={membership.canManageOrganization}
              branches={activeBranches}
              initialPlan={initialPlan}
              organizationSlug={organizationSlug}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
