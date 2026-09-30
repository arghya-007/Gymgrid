import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import { MemberForm } from "./member-form";

export default async function NewMemberPage({
  params,
}: PageProps<"/gym/[organizationSlug]/members/new">) {
  const { organizationSlug } = await params;
  const { membership } = await requireTenantMembership(organizationSlug);

  if (!membership.canManageMembers) {
    redirect(`/gym/${organizationSlug}/members`);
  }

  const activeBranches = membership.branches.filter(
    (branch) => branch.status === "active",
  );

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-4xl">
        <Link
          className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
          href={`/gym/${organizationSlug}/members`}
        >
          ← Members
        </Link>
        <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
            Member CRM
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Add a member
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
            Create the contact record first, then open the member profile to enrol them in a membership plan.
          </p>
          {activeBranches.length === 0 ? (
            <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              You need access to an active branch before creating a member.
            </p>
          ) : (
            <div className="mt-10">
              <MemberForm
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
