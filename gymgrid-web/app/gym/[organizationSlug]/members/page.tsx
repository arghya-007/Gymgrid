import Link from "next/link";
import { connection } from "next/server";
import { requireTenantMembership } from "@/lib/tenant";
import {
  membershipStatusClassName,
  type MembershipSummary,
} from "./membership-types";

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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default async function MembersPage({
  params,
  searchParams,
}: PageProps<"/gym/[organizationSlug]/members">) {
  await connection();
  const [{ organizationSlug }, query] = await Promise.all([params, searchParams]);
  const { membership, supabase } =
    await requireTenantMembership(organizationSlug);
  const rawSearch = typeof query.q === "string" ? query.q.trim() : "";
  const search = rawSearch.replace(/[^a-zA-Z0-9 @+.-]/g, "").slice(0, 60);

  let membersQuery = supabase
    .from("members")
    .select(
      "id, member_code, full_name, preferred_name, email, phone, status, home_branch_id, created_at",
    )
    .eq("organization_id", membership.organization.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (search) {
    membersQuery = membersQuery.or(
      `full_name.ilike.%${search}%,member_code.ilike.%${search}%,phone.ilike.%${search}%`,
    );
  }

  const { data, error } = await membersQuery;
  const members = (data ?? []) as MemberRow[];
  const memberIds = members.map((member) => member.id);
  const membershipsResult = memberIds.length > 0
    ? await supabase
        .from("member_membership_statuses")
        .select(
          "id, member_id, enrollment_code, plan_name, status, start_date, end_date",
        )
        .eq("organization_id", membership.organization.id)
        .in("member_id", memberIds)
        .order("start_date", { ascending: false })
    : { data: [], error: null };
  const memberships = (membershipsResult.data ?? []) as MembershipSummary[];
  const latestMembershipByMember = new Map<string, MembershipSummary>();
  for (const memberMembership of memberships) {
    if (!latestMembershipByMember.has(memberMembership.member_id)) {
      latestMembershipByMember.set(
        memberMembership.member_id,
        memberMembership,
      );
    }
  }
  const branchesById = new Map(
    membership.branches.map((branch) => [branch.id, branch.name]),
  );
  const createdCode =
    typeof query.created === "string" ? query.created.slice(0, 20) : "";

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
              Member CRM
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Members
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Contact records across the branches available to your role.
            </p>
          </div>
          {membership.canManageMembers ? (
            <Link
              className="inline-flex w-fit rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
              href={`/gym/${organizationSlug}/members/new`}
            >
              Add member
            </Link>
          ) : null}
        </div>

        {createdCode ? (
          <p className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">
            Member {createdCode} was created successfully.
          </p>
        ) : null}

        <form className="mt-7 flex max-w-xl gap-3" method="get">
          <label className="sr-only" htmlFor="member-search">
            Search members
          </label>
          <input
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
            defaultValue={rawSearch}
            id="member-search"
            name="q"
            placeholder="Search by name, code, or phone"
            type="search"
          />
          <button
            className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:border-slate-400"
            type="submit"
          >
            Search
          </button>
        </form>

        {error || membershipsResult.error ? (
          <p className="mt-7 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            Member records or membership status could not be loaded. Confirm that the latest database migrations have been applied.
          </p>
        ) : null}

        <section className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {members.length === 0 ? (
            <div className="p-10 text-center">
              <h2 className="font-semibold text-slate-900">
                {search ? "No matching members" : "No members yet"}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                {search
                  ? "Try a different name, member code, or phone number."
                  : "Create the first member contact record for this gym."}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {members.map((member) => (
                <article
                  className="grid gap-4 p-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto] md:items-center"
                  key={member.id}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-semibold text-slate-900">
                        {member.full_name}
                      </h2>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        {member.member_code}
                      </span>
                    </div>
                    <p className="mt-2 truncate text-sm text-slate-500">
                      {member.phone}
                      {member.email ? ` · ${member.email}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      {branchesById.get(member.home_branch_id) ?? "Assigned branch"}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Added {formatDate(member.created_at)}
                    </p>
                  </div>
                  {latestMembershipByMember.get(member.id) ? (
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {latestMembershipByMember.get(member.id)?.plan_name}
                      </p>
                      <span
                        className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ${membershipStatusClassName(latestMembershipByMember.get(member.id)!.status)}`}
                      >
                        {latestMembershipByMember.get(member.id)?.status}
                      </span>
                    </div>
                  ) : (
                    <span className="w-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                      Not enrolled
                    </span>
                  )}
                  <Link
                    className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
                    href={`/gym/${organizationSlug}/members/${member.id}`}
                  >
                    View
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>

        <p className="mt-4 text-xs text-slate-500">
          Showing up to 100 newest records within your authorized branch scope.
        </p>
      </div>
    </main>
  );
}
