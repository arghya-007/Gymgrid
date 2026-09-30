import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import { MembershipPlanForm } from "../plan-form";

export default async function NewMembershipPlanPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const { membership } = await requireTenantMembership(organizationSlug);

  if (!membership.canManageMembershipPlans) {
    redirect(`/gym/${organizationSlug}/plans`);
  }

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
            Add a membership plan
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Set the plan scope, duration, INR price, joining fee, and tax display. Deactivate a plan later instead of deleting its history.
          </p>
          {!membership.canManageOrganization && activeBranches.length === 0 ? (
            <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              You need manager access to an active branch before creating a plan.
            </p>
          ) : (
            <div className="mt-10">
              <MembershipPlanForm
                allowOrganizationWide={membership.canManageOrganization}
                branches={activeBranches}
                organizationSlug={organizationSlug}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
