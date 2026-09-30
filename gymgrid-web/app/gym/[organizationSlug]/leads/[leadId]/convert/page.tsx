import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import { ConvertLeadForm } from "../../convert-form";
import type { LeadStatus } from "../../types";

interface LeadRow {
  id: string;
  lead_code: string;
  full_name: string;
  phone: string;
  email: string | null;
  branch_id: string;
  status: LeadStatus;
}

export default async function ConvertLeadPage({
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

  const { data, error } = await supabase
    .from("leads")
    .select("id, lead_code, full_name, phone, email, branch_id, status")
    .eq("organization_id", membership.organization.id)
    .eq("id", leadId)
    .maybeSingle();

  if (error) {
    throw new Error("Lead could not be loaded.");
  }
  if (!data) {
    notFound();
  }

  const lead = data as LeadRow;
  if (["won", "lost"].includes(lead.status)) {
    redirect(`/gym/${organizationSlug}/leads`);
  }
  const branchName =
    membership.branches.find((branch) => branch.id === lead.branch_id)?.name ??
    "Assigned branch";

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
          href={`/gym/${organizationSlug}/leads`}
        >
          ← Leads
        </Link>
        <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
            Convert lead
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Create member for {lead.full_name}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            This creates the Member CRM record and marks {lead.lead_code} as won in one transaction.
          </p>
          <dl className="mt-8 grid gap-4 rounded-2xl bg-slate-50 p-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Contact</dt>
              <dd className="mt-1 text-sm font-medium text-slate-800">
                {lead.phone}{lead.email ? ` · ${lead.email}` : ""}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Home branch</dt>
              <dd className="mt-1 text-sm font-medium text-slate-800">{branchName}</dd>
            </div>
          </dl>
          <div className="mt-8">
            <ConvertLeadForm
              leadId={lead.id}
              organizationSlug={organizationSlug}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
