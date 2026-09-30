import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import {
  CancelMembershipForm,
  FreezeMembershipForm,
  ResumeMembershipForm,
} from "./membership-lifecycle-forms";

export default async function ManageMembershipPage({
  params,
}: {
  params: Promise<{ organizationSlug: string; memberId: string; membershipId: string }>;
}) {
  const { organizationSlug, memberId, membershipId } = await params;
  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  const memberPath = `/gym/${organizationSlug}/members/${memberId}`;

  if (!membership.canManageMemberships) redirect(memberPath);

  const [memberResult, membershipResult] = await Promise.all([
    supabase
      .from("members")
      .select("id, member_code, full_name")
      .eq("organization_id", membership.organization.id)
      .eq("id", memberId)
      .maybeSingle(),
    supabase
      .from("member_membership_statuses")
      .select("id, member_id, enrollment_code, plan_name, start_date, end_date, status")
      .eq("organization_id", membership.organization.id)
      .eq("member_id", memberId)
      .eq("id", membershipId)
      .maybeSingle(),
  ]);

  if (memberResult.error || membershipResult.error) throw new Error("Membership lifecycle could not be loaded.");
  if (!memberResult.data || !membershipResult.data) notFound();

  const member = memberResult.data as { id: string; member_code: string; full_name: string };
  const target = membershipResult.data as {
    id: string;
    enrollment_code: string;
    plan_name: string;
    status: "active" | "scheduled" | "frozen" | "expired" | "cancelled";
  };
  if (["expired", "cancelled"].includes(target.status)) redirect(memberPath);

  const formProps = { organizationSlug, memberId, membershipId };

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-3xl">
        <Link className="text-sm font-semibold text-emerald-700 hover:text-emerald-900" href={memberPath}>← {member.full_name}</Link>
        <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">{member.member_code} · {target.enrollment_code}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Manage {target.plan_name}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">Current status: <span className="font-semibold capitalize text-slate-900">{target.status}</span>. Lifecycle changes are recorded with the acting staff member and preserved for audit.</p>

          {target.status === "active" ? (
            <section className="mt-9 rounded-2xl border border-violet-200 bg-violet-50/50 p-5">
              <h2 className="font-semibold text-slate-900">Freeze membership</h2>
              <p className="mt-1 mb-5 text-sm text-slate-600">Pause access today. Resuming later extends the end date by the frozen duration.</p>
              <FreezeMembershipForm {...formProps} />
            </section>
          ) : null}

          {target.status === "frozen" ? (
            <section className="mt-9 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5">
              <h2 className="font-semibold text-slate-900">Resume membership</h2>
              <div className="mt-4"><ResumeMembershipForm {...formProps} /></div>
            </section>
          ) : null}

          <section className="mt-6 rounded-2xl border border-rose-200 bg-rose-50/40 p-5">
            <h2 className="font-semibold text-slate-900">Cancel membership</h2>
            <p className="mt-1 mb-5 text-sm text-slate-600">Cancellation is effective today and cannot be undone. The record remains in membership history.</p>
            <CancelMembershipForm {...formProps} />
          </section>
        </div>
      </div>
    </main>
  );
}
