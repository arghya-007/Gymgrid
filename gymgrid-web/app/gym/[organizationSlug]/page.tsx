import { connection } from "next/server";
import { requireTenantMembership, tenantRoleLabels } from "@/lib/tenant";

interface SubscriptionRow {
  plan_id: string;
  status: "trialing" | "active" | "past_due" | "cancelled" | "expired";
  current_period_end: string;
}

interface PlanRow {
  name: string;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

export default async function GymDashboardPage({
  params,
}: PageProps<"/gym/[organizationSlug]">) {
  await connection();
  const { organizationSlug } = await params;
  const { membership, supabase } =
    await requireTenantMembership(organizationSlug);

  const teamResult = membership.canManageOrganization
    ? await supabase
        .from("organization_users")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", membership.organization.id)
        .eq("status", "active")
    : { count: null, error: null };

  let subscription: SubscriptionRow | null = null;
  let plan: PlanRow | null = null;

  if (membership.canViewSubscription) {
    const subscriptionResult = await supabase
      .from("subscriptions")
      .select("plan_id, status, current_period_end")
      .eq("organization_id", membership.organization.id)
      .in("status", ["trialing", "active", "past_due"])
      .maybeSingle();

    if (subscriptionResult.error) {
      console.error("Gym subscription summary could not be loaded", {
        code: subscriptionResult.error.code,
      });
    } else {
      subscription = subscriptionResult.data as SubscriptionRow | null;
    }

    if (subscription) {
      const planResult = await supabase
        .from("plans")
        .select("name")
        .eq("id", subscription.plan_id)
        .maybeSingle();
      plan = planResult.data as PlanRow | null;
    }
  }

  const activeBranches = membership.branches.filter(
    (branch) => branch.status === "active",
  );

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
              Gym administration
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              {membership.organization.name}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Signed in as {tenantRoleLabels[membership.primaryRole]}
            </p>
          </div>
          <span className="w-fit rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold capitalize text-slate-700 shadow-sm">
            {membership.organization.status} organization
          </span>
        </div>

        {membership.organization.status === "suspended" ||
        membership.organization.status === "cancelled" ? (
          <div className="mt-8 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            This organization is {membership.organization.status}. Management changes may be restricted until platform access is restored.
          </div>
        ) : null}

        <section
          className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          aria-label="Organization summary"
        >
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Active branches</p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">{activeBranches.length}</p>
            <p className="mt-2 text-xs text-slate-500">Within your assigned scope</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">
              {membership.canManageOrganization ? "Active team" : "Role assignments"}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-tight">
              {membership.canManageOrganization
                ? (teamResult.count ?? "—")
                : membership.roles.length}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              {membership.canManageOrganization
                ? "Owners and staff with access"
                : "Your current permissions"}
            </p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Subscription</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight">
              {membership.canViewSubscription
                ? (plan?.name ?? "Not available")
                : "Restricted"}
            </p>
            <p className="mt-2 text-xs capitalize text-slate-500">
              {subscription?.status ?? "Visible to owners and billing roles"}
            </p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Current period</p>
            <p className="mt-3 text-lg font-semibold tracking-tight">
              {subscription
                ? `Until ${formatDate(subscription.current_period_end)}`
                : "Not available"}
            </p>
            <p className="mt-2 text-xs text-slate-500">Billing details remain read-only here</p>
          </article>
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.4fr_1fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Branches</h2>
                <p className="mt-1 text-sm text-slate-500">Locations available to your role.</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {membership.branches.length} total
              </span>
            </div>
            <div className="mt-5 divide-y divide-slate-100">
              {membership.branches.map((branch) => (
                <div
                  className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                  key={branch.id}
                >
                  <div>
                    <p className="font-medium">{branch.name}</p>
                    <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {branch.code}
                    </p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold capitalize text-emerald-700">
                    {branch.status}
                  </span>
                </div>
              ))}
              {membership.branches.length === 0 ? (
                <p className="py-6 text-sm text-slate-500">
                  No branches are currently available to this role.
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-400">
              Phase 3
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight">
              Operations are ready
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Enrolments, lifecycle actions, receipts, imports, attendance, and daily operational metrics now share one secure tenant-aware workspace.
            </p>
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-sm font-semibold">Next phase</p>
              <p className="mt-1 text-sm text-slate-400">
                Class schedules, capacity, waitlists, and bookings.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
