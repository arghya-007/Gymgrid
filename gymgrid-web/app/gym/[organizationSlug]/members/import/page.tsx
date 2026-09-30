import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import { ImportWizard } from "./import-wizard";

export default async function ImportMembersPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const { membership } = await requireTenantMembership(organizationSlug);
  if (!membership.canManageMembers) redirect(`/gym/${organizationSlug}/members`);

  const activeBranches = membership.branches.filter((branch) => branch.status === "active");

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-5xl">
        <Link className="text-sm font-semibold text-emerald-700 hover:text-emerald-900" href={`/gym/${organizationSlug}/members`}>← Members</Link>
        <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Bulk setup</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Import members</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">Download the template, keep its columns unchanged, and add one member per row. Indian 10-digit mobile numbers are normalized to +91 automatically.</p>

          <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Template rules</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 leading-6">
              <li><strong>Required:</strong> full_name and phone.</li>
              <li><strong>Dates:</strong> YYYY-MM-DD. Gender can be female, male, non_binary, or prefer_not_to_say.</li>
              <li>Phone numbers and emails must be unique within the file and this gym.</li>
            </ul>
            <a className="mt-4 inline-flex font-semibold text-emerald-700 hover:text-emerald-900" download href="/member-import-template.csv">Download CSV template</a>
          </div>

          {activeBranches.length === 0 ? (
            <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">You need access to an active branch before importing members.</p>
          ) : (
            <div className="mt-9"><ImportWizard branches={activeBranches} organizationSlug={organizationSlug} /></div>
          )}
        </div>
      </div>
    </main>
  );
}
