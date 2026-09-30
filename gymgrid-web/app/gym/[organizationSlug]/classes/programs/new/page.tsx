import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import { ClassProgramForm } from "../../program-form";

export default async function NewClassProgramPage({ params }: { params: Promise<{ organizationSlug: string }> }) {
  const { organizationSlug } = await params;
  const { membership } = await requireTenantMembership(organizationSlug);
  if (!membership.canManageClassPrograms) redirect(`/gym/${organizationSlug}/classes`);
  const branches = membership.branches.filter((branch) => branch.status === "active");
  return <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10"><div className="mx-auto max-w-4xl"><Link className="text-sm font-semibold text-emerald-700" href={`/gym/${organizationSlug}/classes`}>← Classes</Link><div className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Schedule setup</p><h1 className="mt-2 text-3xl font-semibold">Create a class type</h1><p className="mt-3 text-sm leading-6 text-slate-600">Define a reusable branch class with its standard duration and booking capacity.</p>{branches.length ? <div className="mt-9"><ClassProgramForm branches={branches} organizationSlug={organizationSlug} /></div> : <p className="mt-8 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">You need an active branch in your scope.</p>}</div></div></main>;
}
