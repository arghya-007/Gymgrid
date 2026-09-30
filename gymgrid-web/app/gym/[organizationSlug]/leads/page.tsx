import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import type { LeadSource, LeadStatus } from "./types";

interface LeadRow {
  id: string;
  branch_id: string;
  lead_code: string;
  full_name: string;
  phone: string;
  email: string | null;
  source: LeadSource;
  status: LeadStatus;
  interested_plan_id: string | null;
  follow_up_at: string | null;
  lost_reason: string | null;
  converted_member_id: string | null;
  created_at: string;
}

interface PlanRow {
  id: string;
  name: string;
}

const statusLabels: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  trial_scheduled: "Trial scheduled",
  won: "Won",
  lost: "Lost",
};

const sourceLabels: Record<LeadSource, string> = {
  walk_in: "Walk-in",
  referral: "Referral",
  website: "Website",
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  phone: "Phone call",
  other: "Other",
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function statusClassName(status: LeadStatus) {
  if (status === "won") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "lost") {
    return "bg-slate-100 text-slate-500";
  }
  if (status === "trial_scheduled") {
    return "bg-violet-50 text-violet-700";
  }
  return "bg-amber-50 text-amber-800";
}

export default async function LeadsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const [{ organizationSlug }, query] = await Promise.all([params, searchParams]);
  const { membership, supabase } =
    await requireTenantMembership(organizationSlug);

  if (!membership.canManageLeads) {
    redirect(`/gym/${organizationSlug}`);
  }

  const rawSearch = typeof query.q === "string" ? query.q.trim() : "";
  const search = rawSearch.replace(/[^a-zA-Z0-9 @+.-]/g, "").slice(0, 60);
  const requestedStatus = typeof query.status === "string" ? query.status : "";
  const status = Object.keys(statusLabels).includes(requestedStatus)
    ? (requestedStatus as LeadStatus)
    : null;

  let leadsQuery = supabase
    .from("leads")
    .select(
      "id, branch_id, lead_code, full_name, phone, email, source, status, interested_plan_id, follow_up_at, lost_reason, converted_member_id, created_at",
    )
    .eq("organization_id", membership.organization.id)
    .order("created_at", { ascending: false })
    .limit(150);

  if (search) {
    leadsQuery = leadsQuery.or(
      `full_name.ilike.%${search}%,lead_code.ilike.%${search}%,phone.ilike.%${search}%`,
    );
  }
  if (status) {
    leadsQuery = leadsQuery.eq("status", status);
  }

  const [leadsResult, plansResult] = await Promise.all([
    leadsQuery,
    supabase
      .from("membership_plans")
      .select("id, name")
      .eq("organization_id", membership.organization.id),
  ]);
  const leads = (leadsResult.data ?? []) as LeadRow[];
  const plans = (plansResult.data ?? []) as PlanRow[];
  const branchesById = new Map(
    membership.branches.map((branch) => [branch.id, branch.name]),
  );
  const plansById = new Map(plans.map((plan) => [plan.id, plan.name]));
  const openLeads = leads.filter(
    (lead) => !["won", "lost"].includes(lead.status),
  ).length;
  const wonLeads = leads.filter((lead) => lead.status === "won").length;
  const scheduledFollowUps = leads.filter(
    (lead) =>
      lead.follow_up_at &&
      !["won", "lost"].includes(lead.status),
  ).length;
  const savedCode = typeof query.saved === "string" ? query.saved.slice(0, 20) : "";
  const convertedCode =
    typeof query.converted === "string" ? query.converted.slice(0, 20) : "";

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
              Sales pipeline
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Leads
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Track enquiries, follow-ups, trials, and conversions across your branches.
            </p>
          </div>
          <Link
            className="inline-flex w-fit rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
            href={`/gym/${organizationSlug}/leads/new`}
          >
            Add lead
          </Link>
        </div>

        {savedCode ? (
          <p className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">
            Lead {savedCode} was saved successfully.
          </p>
        ) : null}
        {convertedCode ? (
          <p className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">
            Lead converted successfully. Member {convertedCode} is now in the Member CRM.
          </p>
        ) : null}

        <section aria-label="Lead summary" className="mt-7 grid gap-4 sm:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Open leads</p>
            <p className="mt-2 text-3xl font-semibold">{openLeads}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Follow-ups scheduled</p>
            <p className="mt-2 text-3xl font-semibold">{scheduledFollowUps}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Converted</p>
            <p className="mt-2 text-3xl font-semibold">{wonLeads}</p>
          </article>
        </section>

        <form className="mt-7 grid max-w-3xl gap-3 sm:grid-cols-[1fr_190px_auto]" method="get">
          <input
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
            defaultValue={rawSearch}
            name="q"
            placeholder="Search by name, code, or phone"
            type="search"
          />
          <select
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm"
            defaultValue={status ?? ""}
            name="status"
          >
            <option value="">All statuses</option>
            {Object.entries(statusLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button
            className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:border-slate-400"
            type="submit"
          >
            Filter
          </button>
        </form>

        {leadsResult.error || plansResult.error ? (
          <p className="mt-7 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            Leads could not be loaded. Confirm that the lead-management migration has been applied.
          </p>
        ) : null}

        <section className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {leads.length === 0 ? (
            <div className="p-10 text-center">
              <h2 className="font-semibold text-slate-900">
                {search || status ? "No matching leads" : "No leads yet"}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {search || status
                  ? "Try another search or status filter."
                  : "Capture the first walk-in, referral, phone, or online enquiry."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {leads.map((lead) => (
                <article
                  className="grid gap-5 p-5 md:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.9fr)_auto] md:items-center"
                  key={lead.id}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-slate-900">{lead.full_name}</h2>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        {lead.lead_code}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-sm text-slate-500">
                      {lead.phone}{lead.email ? ` · ${lead.email}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      {branchesById.get(lead.branch_id) ?? "Assigned branch"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {sourceLabels[lead.source]}
                      {lead.interested_plan_id
                        ? ` · ${plansById.get(lead.interested_plan_id) ?? "Selected plan"}`
                        : ""}
                    </p>
                  </div>
                  <div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusClassName(lead.status)}`}>
                      {statusLabels[lead.status]}
                    </span>
                    <p className="mt-2 text-xs text-slate-500">
                      {lead.follow_up_at
                        ? `Follow up ${formatDateTime(lead.follow_up_at)}`
                        : lead.lost_reason || `Added ${formatDateTime(lead.created_at)}`}
                    </p>
                  </div>
                  <div className="flex gap-3 md:justify-end">
                    {!lead.converted_member_id ? (
                      <>
                        <Link
                          className="text-sm font-semibold text-slate-600 hover:text-slate-950"
                          href={`/gym/${organizationSlug}/leads/${lead.id}/edit`}
                        >
                          Edit
                        </Link>
                        {lead.status !== "lost" ? (
                          <Link
                            className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
                            href={`/gym/${organizationSlug}/leads/${lead.id}/convert`}
                          >
                            Convert
                          </Link>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
