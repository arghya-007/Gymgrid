import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import { LeadForm } from "../lead-form";
import type { LeadPlanOption } from "../types";

interface PlanRow {
  id: string;
  branch_id: string | null;
  code: string;
  name: string;
}

export default async function NewLeadPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const { membership, supabase } =
    await requireTenantMembership(organizationSlug);

  if (!membership.canManageLeads) {
    redirect(`/gym/${organizationSlug}`);
  }

  const activeBranches = membership.branches.filter(
    (branch) => branch.status === "active",
  );
  const { data: planData } = await supabase
    .from("membership_plans")
    .select("id, branch_id, code, name")
    .eq("organization_id", membership.organization.id)
    .eq("active", true)
    .order("name");
  const plans = ((planData ?? []) as PlanRow[]).map<LeadPlanOption>((plan) => ({
    id: plan.id,
    branchId: plan.branch_id,
    code: plan.code,
    name: plan.name,
  }));

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-4xl">
        <Link
          className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
          href={`/gym/${organizationSlug}/leads`}
        >
          ← Leads
        </Link>
        <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
            Sales pipeline
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Add a lead</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Capture the enquiry, source, plan interest, and next follow-up. Mobile numbers are normalized to the Indian +91 format when applicable.
          </p>
          {activeBranches.length === 0 ? (
            <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              You need access to an active branch before creating a lead.
            </p>
          ) : (
            <div className="mt-10">
              <LeadForm
                branches={activeBranches}
                organizationSlug={organizationSlug}
                plans={plans}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
