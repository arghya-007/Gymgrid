import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import {
  membershipStatusClassName,
  type MembershipDisplayStatus,
} from "../membership-types";

interface MemberRow {
  id: string;
  member_code: string;
  full_name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string;
  status: "active" | "inactive" | "archived";
  home_branch_id: string;
  created_at: string;
}

interface MembershipRow {
  id: string;
  enrollment_code: string;
  plan_name: string;
  status: MembershipDisplayStatus;
  start_date: string;
  end_date: string;
  contract_amount_minor: number;
  currency: string;
  tax_inclusive: boolean;
  created_at: string;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; memberId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ organizationSlug, memberId }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const { membership, supabase } =
    await requireTenantMembership(organizationSlug);

  const [memberResult, membershipsResult] = await Promise.all([
    supabase
      .from("members")
      .select(
        "id, member_code, full_name, preferred_name, email, phone, status, home_branch_id, created_at",
      )
      .eq("organization_id", membership.organization.id)
      .eq("id", memberId)
      .maybeSingle(),
    supabase
      .from("member_membership_statuses")
      .select(
        "id, enrollment_code, plan_name, status, start_date, end_date, contract_amount_minor, currency, tax_inclusive, created_at",
      )
      .eq("organization_id", membership.organization.id)
      .eq("member_id", memberId)
      .order("start_date", { ascending: false }),
  ]);

  if (memberResult.error) {
    throw new Error("Member could not be loaded.");
  }
  if (!memberResult.data) {
    notFound();
  }

  const member = memberResult.data as MemberRow;
  const memberMemberships = (membershipsResult.data ?? []) as MembershipRow[];
  const branchName = membership.branches.find(
    (branch) => branch.id === member.home_branch_id,
  )?.name;
  const enrolledCode =
    typeof query.enrolled === "string" ? query.enrolled.slice(0, 20) : "";

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-5xl">
        <Link
          className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
          href={`/gym/${organizationSlug}/members`}
        >
          ← Members
        </Link>

        {enrolledCode ? (
          <p className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">
            Enrolment {enrolledCode} was created successfully.
          </p>
        ) : null}

        <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                {member.member_code}
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                {member.full_name}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                {member.phone}{member.email ? ` · ${member.email}` : ""}
              </p>
            </div>
            {membership.canManageMemberships && member.status === "active" ? (
              <Link
                className="inline-flex w-fit rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
                href={`/gym/${organizationSlug}/members/${member.id}/enroll`}
              >
                Enrol in a plan
              </Link>
            ) : null}
          </div>
          <dl className="mt-7 grid gap-4 rounded-2xl bg-slate-50 p-5 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Branch</dt>
              <dd className="mt-1 text-sm font-medium text-slate-800">{branchName ?? "Assigned branch"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Profile status</dt>
              <dd className="mt-1 text-sm font-medium capitalize text-slate-800">{member.status}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">Member since</dt>
              <dd className="mt-1 text-sm font-medium text-slate-800">{formatDate(member.created_at)}</dd>
            </div>
          </dl>
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 p-6 sm:p-8">
            <h2 className="text-xl font-semibold">Membership history</h2>
            <p className="mt-1 text-sm text-slate-500">
              Plan terms and prices are preserved as they were when each enrolment was created.
            </p>
          </div>
          {membershipsResult.error ? (
            <p className="p-6 text-sm text-rose-700">Membership history could not be loaded.</p>
          ) : memberMemberships.length === 0 ? (
            <div className="p-10 text-center">
              <h3 className="font-semibold">No enrolments yet</h3>
              <p className="mt-2 text-sm text-slate-500">Choose an active plan to start this member’s first membership.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {memberMemberships.map((memberMembership) => (
                <article className="grid gap-4 p-6 md:grid-cols-[1fr_1fr_1fr_auto] md:items-center" key={memberMembership.id}>
                  <div>
                    <p className="font-semibold">{memberMembership.plan_name}</p>
                    <p className="mt-1 text-xs text-slate-400">{memberMembership.enrollment_code}</p>
                  </div>
                  <p className="text-sm text-slate-600">
                    {formatDate(memberMembership.start_date)} – {formatDate(memberMembership.end_date)}
                  </p>
                  <div>
                    <p className="text-sm font-medium">{formatMoney(memberMembership.contract_amount_minor, memberMembership.currency)}</p>
                    <p className="mt-1 text-xs text-slate-400">Tax {memberMembership.tax_inclusive ? "included" : "excluded"}</p>
                  </div>
                  <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold capitalize ${membershipStatusClassName(memberMembership.status)}`}>
                    {memberMembership.status}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
