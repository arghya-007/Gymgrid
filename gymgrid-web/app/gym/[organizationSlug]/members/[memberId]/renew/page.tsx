import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import { RenewalForm, type RenewalPlanOption } from "./renewal-form";

interface SourceMembership {
  id: string;
  member_id: string;
  branch_id: string;
  enrollment_code: string;
  plan_name: string;
  end_date: string;
  status: string;
}

interface PlanRow {
  id: string;
  code: string;
  name: string;
  duration_value: number;
  duration_unit: "day" | "week" | "month" | "year";
  price_amount_minor: number;
  joining_fee_amount_minor: number;
  currency: string;
}

export default async function RenewMembershipPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; memberId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ organizationSlug, memberId }, query] = await Promise.all([params, searchParams]);
  const sourceMembershipId = typeof query.from === "string" ? query.from : "";
  const { membership, supabase } = await requireTenantMembership(organizationSlug);

  if (!membership.canManageMemberships) {
    redirect(`/gym/${organizationSlug}/members/${memberId}`);
  }

  const [memberResult, sourceResult] = await Promise.all([
    supabase
      .from("members")
      .select("id, member_code, full_name, home_branch_id, status")
      .eq("organization_id", membership.organization.id)
      .eq("id", memberId)
      .maybeSingle(),
    supabase
      .from("member_membership_statuses")
      .select("id, member_id, branch_id, enrollment_code, plan_name, end_date, status")
      .eq("organization_id", membership.organization.id)
      .eq("member_id", memberId)
      .eq("id", sourceMembershipId)
      .maybeSingle(),
  ]);

  if (memberResult.error || sourceResult.error) throw new Error("Membership renewal could not be loaded.");
  if (!memberResult.data || !sourceResult.data) notFound();

  const member = memberResult.data as {
    id: string;
    member_code: string;
    full_name: string;
    home_branch_id: string;
    status: string;
  };
  const source = sourceResult.data as SourceMembership;

  if (["frozen", "cancelled"].includes(source.status)) {
    redirect(`/gym/${organizationSlug}/members/${memberId}`);
  }

  const plansResult = await supabase
    .from("membership_plans")
    .select("id, code, name, duration_value, duration_unit, price_amount_minor, joining_fee_amount_minor, currency")
    .eq("organization_id", membership.organization.id)
    .eq("active", true)
    .or(`branch_id.is.null,branch_id.eq.${source.branch_id}`)
    .order("sort_order")
    .order("name");
  const plans = ((plansResult.data ?? []) as PlanRow[]).map<RenewalPlanOption>((plan) => ({
    id: plan.id,
    code: plan.code,
    name: plan.name,
    durationValue: plan.duration_value,
    durationUnit: plan.duration_unit,
    priceAmountMinor: plan.price_amount_minor,
    joiningFeeAmountMinor: plan.joining_fee_amount_minor,
    currency: plan.currency,
  }));

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-3xl">
        <Link className="text-sm font-semibold text-emerald-700 hover:text-emerald-900" href={`/gym/${organizationSlug}/members/${member.id}`}>
          ← {member.full_name}
        </Link>
        <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
            {member.member_code} · Membership renewal
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Renew {source.plan_name}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Renewal preserves the existing membership and links a new immutable plan snapshot after it.
          </p>
          {member.status !== "active" ? (
            <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Only active member profiles can be renewed.</p>
          ) : plansResult.error ? (
            <p className="mt-8 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Membership plans could not be loaded.</p>
          ) : plans.length === 0 ? (
            <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No active plan is available for this membership’s branch.</p>
          ) : (
            <div className="mt-9">
              <RenewalForm memberId={member.id} organizationSlug={organizationSlug} plans={plans} sourceMembershipId={source.id} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
