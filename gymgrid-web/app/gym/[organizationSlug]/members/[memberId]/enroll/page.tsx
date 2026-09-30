import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import {
  EnrollmentForm,
  type EnrollmentPlanOption,
} from "./enrollment-form";

interface MemberRow {
  id: string;
  member_code: string;
  full_name: string;
  home_branch_id: string;
  status: "active" | "inactive" | "archived";
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

export default async function EnrollMemberPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; memberId: string }>;
}) {
  const { organizationSlug, memberId } = await params;
  const { membership, supabase } =
    await requireTenantMembership(organizationSlug);

  if (!membership.canManageMemberships) {
    redirect(`/gym/${organizationSlug}/members/${memberId}`);
  }

  const memberResult = await supabase
    .from("members")
    .select("id, member_code, full_name, home_branch_id, status")
    .eq("organization_id", membership.organization.id)
    .eq("id", memberId)
    .maybeSingle();

  if (memberResult.error) {
    throw new Error("Member could not be loaded.");
  }
  if (!memberResult.data) {
    notFound();
  }

  const member = memberResult.data as MemberRow;
  const plansResult = await supabase
    .from("membership_plans")
    .select(
      "id, code, name, duration_value, duration_unit, price_amount_minor, joining_fee_amount_minor, currency",
    )
    .eq("organization_id", membership.organization.id)
    .eq("active", true)
    .or(`branch_id.is.null,branch_id.eq.${member.home_branch_id}`)
    .order("sort_order")
    .order("name");
  const plans = ((plansResult.data ?? []) as PlanRow[]).map<EnrollmentPlanOption>(
    (plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      durationValue: plan.duration_value,
      durationUnit: plan.duration_unit,
      priceAmountMinor: plan.price_amount_minor,
      joiningFeeAmountMinor: plan.joining_fee_amount_minor,
      currency: plan.currency,
    }),
  );

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
          href={`/gym/${organizationSlug}/members/${member.id}`}
        >
          ← {member.full_name}
        </Link>
        <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
            {member.member_code} · Membership enrolment
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Enrol {member.full_name}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            The plan terms and price will be preserved on this membership. Payment collection is recorded separately in the next Operations slice.
          </p>

          {member.status !== "active" ? (
            <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Only active member profiles can be enrolled.
            </p>
          ) : plansResult.error ? (
            <p className="mt-8 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              Membership plans could not be loaded.
            </p>
          ) : plans.length === 0 ? (
            <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Create an active organization-wide or branch-specific membership plan first.
            </p>
          ) : (
            <div className="mt-9">
              <EnrollmentForm
                memberId={member.id}
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
