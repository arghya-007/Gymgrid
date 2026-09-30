import Link from "next/link";
import { connection } from "next/server";
import { requireTenantMembership } from "@/lib/tenant";
import type { MembershipPlanDurationUnit } from "./types";

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
  currency: string;
  tax_inclusive: boolean;
  active: boolean;
}

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
  }).format(amountMinor / 100);
}

function formatDuration(value: number, unit: MembershipPlanDurationUnit) {
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

export default async function MembershipPlansPage({
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
  const { data, error } = await supabase
    .from("membership_plans")
    .select(
      "id, branch_id, code, name, description, duration_value, duration_unit, price_amount_minor, joining_fee_amount_minor, currency, tax_inclusive, active",
    )
    .eq("organization_id", membership.organization.id)
    .order("active", { ascending: false })
    .order("sort_order")
    .order("name");

  const plans = (data ?? []) as MembershipPlanRow[];
  const branchesById = new Map(
    membership.branches.map((branch) => [branch.id, branch.name]),
  );
  const activePlans = plans.filter((plan) => plan.active).length;
  const savedCode =
    typeof query.saved === "string" ? query.saved.slice(0, 20) : "";

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
              Products and pricing
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Membership plans
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Configure the memberships your gym can offer across all or selected branches.
            </p>
          </div>
          {membership.canManageMembershipPlans ? (
            <Link
              className="inline-flex w-fit rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
              href={`/gym/${organizationSlug}/plans/new`}
            >
              Add membership plan
            </Link>
          ) : null}
        </div>

        {savedCode ? (
          <p
            className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
            role="status"
          >
            Membership plan {savedCode} was saved successfully.
          </p>
        ) : null}

        <section
          aria-label="Membership plan summary"
          className="mt-7 grid gap-4 sm:grid-cols-3"
        >
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Active plans</p>
            <p className="mt-2 text-3xl font-semibold">{activePlans}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Inactive plans</p>
            <p className="mt-2 text-3xl font-semibold">{plans.length - activePlans}</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Available branches</p>
            <p className="mt-2 text-3xl font-semibold">{membership.branches.length}</p>
          </article>
        </section>

        {error ? (
          <p className="mt-7 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            Membership plans could not be loaded. Confirm that the membership-plan migration has been applied.
          </p>
        ) : null}

        <section className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {plans.length === 0 ? (
            <div className="p-10 text-center">
              <h2 className="font-semibold text-slate-900">No membership plans yet</h2>
              <p className="mt-2 text-sm text-slate-500">
                Add monthly, quarterly, annual, or branch-specific offerings for this gym.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {plans.map((plan) => (
                <article
                  className="grid gap-5 p-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto] md:items-center"
                  key={plan.id}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-slate-900">{plan.name}</h2>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        {plan.code}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">
                      {plan.branch_id
                        ? (branchesById.get(plan.branch_id) ?? "Assigned branch")
                        : "All branches"}
                      {plan.description ? ` · ${plan.description}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {formatDuration(plan.duration_value, plan.duration_unit)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Membership period</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {formatMoney(plan.price_amount_minor, plan.currency)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {plan.joining_fee_amount_minor > 0
                        ? `+ ${formatMoney(plan.joining_fee_amount_minor, plan.currency)} joining fee`
                        : "No joining fee"}
                      {plan.tax_inclusive ? " · Tax inclusive" : " · Tax extra"}
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 md:justify-end">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        plan.active
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {plan.active ? "Active" : "Inactive"}
                    </span>
                    {membership.canManageMembershipPlans ? (
                      <Link
                        className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
                        href={`/gym/${organizationSlug}/plans/${plan.id}/edit`}
                      >
                        Edit
                      </Link>
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
