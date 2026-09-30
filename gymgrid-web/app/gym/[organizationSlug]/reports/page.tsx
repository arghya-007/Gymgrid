import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";

interface ReportRow {
  report_date: string;
  check_in_count: number;
  new_member_count: number;
  payment_amount_minor: number;
  expiring_membership_count: number;
}

function localDateKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone,
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function validDate(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(amountMinor / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00.000Z`));
}

export default async function ReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ branch?: string; start?: string; end?: string }>;
}) {
  await connection();
  const [{ organizationSlug }, query] = await Promise.all([params, searchParams]);
  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  if (!membership.canViewOperationalReports) redirect(`/gym/${organizationSlug}`);

  const activeBranches = membership.branches.filter((branch) => branch.status === "active");
  const today = localDateKey(new Date(), membership.organization.timezone);
  const requestedStart = validDate(query.start) ? query.start! : shiftDate(today, -6);
  const requestedEnd = validDate(query.end) ? query.end! : today;
  const rangeDays = (new Date(`${requestedEnd}T00:00:00.000Z`).getTime() - new Date(`${requestedStart}T00:00:00.000Z`).getTime()) / 86_400_000;
  const validRange = rangeDays >= 0 && rangeDays <= 92;
  const startDate = validRange ? requestedStart : shiftDate(today, -6);
  const endDate = validRange ? requestedEnd : today;
  const allowAllBranches = membership.canManageOrganization;
  const selectedBranch = activeBranches.find((branch) => branch.id === query.branch);
  const branchId = allowAllBranches && (!query.branch || query.branch === "all")
    ? null
    : (selectedBranch?.id ?? activeBranches[0]?.id ?? null);

  const reportResult = branchId || allowAllBranches
    ? await supabase.rpc("get_operational_report", {
        p_organization_id: membership.organization.id,
        p_branch_id: branchId,
        p_start_date: startDate,
        p_end_date: endDate,
      })
    : { data: [], error: null };
  const rows = (reportResult.data ?? []) as ReportRow[];
  const totals = rows.reduce(
    (result, row) => ({
      checkIns: result.checkIns + Number(row.check_in_count),
      newMembers: result.newMembers + Number(row.new_member_count),
      payments: result.payments + Number(row.payment_amount_minor),
      expiries: result.expiries + Number(row.expiring_membership_count),
    }),
    { checkIns: 0, newMembers: 0, payments: 0, expiries: 0 },
  );

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Operations</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Daily report</h1>
        <p className="mt-2 text-sm text-slate-600">Attendance, new members, recorded collections, and membership end dates.</p>

        <form className="mt-7 grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:grid-cols-4 sm:items-end" method="get">
          <label className="text-sm font-medium text-slate-700">Branch
            <select className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm" defaultValue={branchId ?? "all"} name="branch">
              {allowAllBranches ? <option value="all">All branches</option> : null}
              {activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-700">From
            <input className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm" defaultValue={startDate} max={today} name="start" required type="date" />
          </label>
          <label className="text-sm font-medium text-slate-700">To
            <input className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm" defaultValue={endDate} max={today} name="end" required type="date" />
          </label>
          <button className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700" type="submit">Run report</button>
        </form>
        <p className="mt-3 text-xs text-slate-500">Choose up to 93 days. Voided receipts are excluded from collections.</p>

        {reportResult.error ? <p className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">The report could not be loaded. Confirm that the latest database migration is applied and the selected branch is in your scope.</p> : null}

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Report totals">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Check-ins</p><p className="mt-2 text-3xl font-semibold">{totals.checkIns}</p></article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">New members</p><p className="mt-2 text-3xl font-semibold">{totals.newMembers}</p></article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Recorded collections</p><p className="mt-2 text-2xl font-semibold">{formatMoney(totals.payments, membership.organization.currency)}</p></article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">Membership end dates</p><p className="mt-2 text-3xl font-semibold">{totals.expiries}</p></article>
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-4 font-semibold">Date</th><th className="px-5 py-4 font-semibold">Check-ins</th><th className="px-5 py-4 font-semibold">New members</th><th className="px-5 py-4 font-semibold">Collections</th><th className="px-5 py-4 font-semibold">Ending</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => <tr key={row.report_date}><td className="whitespace-nowrap px-5 py-4 font-medium">{formatDate(row.report_date)}</td><td className="px-5 py-4">{row.check_in_count}</td><td className="px-5 py-4">{row.new_member_count}</td><td className="whitespace-nowrap px-5 py-4">{formatMoney(Number(row.payment_amount_minor), membership.organization.currency)}</td><td className="px-5 py-4">{row.expiring_membership_count}</td></tr>)}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
