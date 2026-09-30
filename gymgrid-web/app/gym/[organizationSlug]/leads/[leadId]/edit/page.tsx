import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import { LeadForm } from "../../lead-form";
import type {
  LeadFormValues,
  LeadPlanOption,
  LeadSource,
  LeadStatus,
} from "../../types";

interface LeadRow {
  id: string;
  branch_id: string;
  full_name: string;
  phone: string;
  email: string | null;
  source: LeadSource;
  status: LeadStatus;
  interested_plan_id: string | null;
  follow_up_at: string | null;
  notes: string | null;
  lost_reason: string | null;
}

interface PlanRow {
  id: string;
  branch_id: string | null;
  code: string;
  name: string;
}

export default async function EditLeadPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; leadId: string }>;
}) {
  const { organizationSlug, leadId } = await params;
  const { membership, supabase } =
    await requireTenantMembership(organizationSlug);

  if (!membership.canManageLeads) {
    redirect(`/gym/${organizationSlug}`);
  }

  const [leadResult, plansResult] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id, branch_id, full_name, phone, email, source, status, interested_plan_id, follow_up_at, notes, lost_reason",
      )
      .eq("organization_id", membership.organization.id)
      .eq("id", leadId)
      .maybeSingle(),
    supabase
      .from("membership_plans")
      .select("id, branch_id, code, name")
      .eq("organization_id", membership.organization.id)
      .eq("active", true)
      .order("name"),
  ]);

  if (leadResult.error) {
    throw new Error("Lead could not be loaded.");
  }
  if (!leadResult.data) {
    notFound();
  }

  const row = leadResult.data as LeadRow;
  if (row.status === "won") {
    redirect(`/gym/${organizationSlug}/leads`);
  }

  const initialLead: LeadFormValues = {
    id: row.id,
    branchId: row.branch_id,
    fullName: row.full_name,
    phone: row.phone,
    email: row.email ?? "",
    source: row.source,
    status: row.status,
    interestedPlanId: row.interested_plan_id,
    followUpAt: row.follow_up_at,
    notes: row.notes ?? "",
    lostReason: row.lost_reason ?? "",
  };
  const plans = ((plansResult.data ?? []) as PlanRow[]).map<LeadPlanOption>(
    (plan) => ({
      id: plan.id,
      branchId: plan.branch_id,
      code: plan.code,
      name: plan.name,
    }),
  );
  const activeBranches = membership.branches.filter(
    (branch) => branch.status === "active",
  );

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
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Edit {initialLead.fullName}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Record contact progress, schedule the next follow-up, or close the lead as lost. Use Convert from the lead list when they join.
          </p>
          <div className="mt-10">
            <LeadForm
              branches={activeBranches}
              initialLead={initialLead}
              organizationSlug={organizationSlug}
              plans={plans}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
