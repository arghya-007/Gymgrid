import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import { CheckInButton } from "./check-in-button";

interface MemberRow {
  id: string;
  member_code: string;
  full_name: string;
  phone: string;
}

interface CheckInRow {
  id: string;
  member_id: string;
  checked_in_at: string;
  checked_in_local_date: string;
}

function formatCheckInTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export default async function CheckInsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<{ branch?: string; q?: string; checkedIn?: string }>;
}) {
  await connection();
  const [{ organizationSlug }, query] = await Promise.all([params, searchParams]);
  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  if (!membership.canManageCheckIns) redirect(`/gym/${organizationSlug}`);

  const activeBranches = membership.branches.filter((branch) => branch.status === "active");
  const selectedBranch = activeBranches.find((branch) => branch.id === query.branch) ?? activeBranches[0];
  const rawSearch = typeof query.q === "string" ? query.q.trim() : "";
  const search = rawSearch.replace(/[^a-zA-Z0-9 @+.-]/g, "").slice(0, 60);
  const checkedInCode = typeof query.checkedIn === "string"
    ? query.checkedIn.replace(/[^A-Z0-9-]/gi, "").slice(0, 20)
    : "";

  const recentResult = selectedBranch
    ? await supabase
        .from("member_check_ins")
        .select("id, member_id, checked_in_at, checked_in_local_date")
        .eq("organization_id", membership.organization.id)
        .eq("branch_id", selectedBranch.id)
        .order("checked_in_at", { ascending: false })
        .limit(25)
    : { data: [], error: null };
  const recent = (recentResult.data ?? []) as CheckInRow[];

  const searchResult = search && selectedBranch
    ? await supabase
        .from("members")
        .select("id, member_code, full_name, phone")
        .eq("organization_id", membership.organization.id)
        .eq("status", "active")
        .or(`full_name.ilike.%${search}%,member_code.ilike.%${search}%,phone.ilike.%${search}%`)
        .order("full_name")
        .limit(20)
    : { data: [], error: null };
  const searchMembers = (searchResult.data ?? []) as MemberRow[];
  const searchMemberIds = searchMembers.map((member) => member.id);
  const activeMembershipsResult = selectedBranch && searchMemberIds.length
    ? await supabase
        .from("member_membership_statuses")
        .select("member_id")
        .eq("organization_id", membership.organization.id)
        .eq("branch_id", selectedBranch.id)
        .eq("status", "active")
        .in("member_id", searchMemberIds)
    : { data: [], error: null };
  const activeMemberIds = new Set((activeMembershipsResult.data ?? []).map((row) => row.member_id as string));

  const recentMemberIds = [...new Set(recent.map((entry) => entry.member_id))];
  const recentMembersResult = recentMemberIds.length
    ? await supabase
        .from("members")
        .select("id, member_code, full_name, phone")
        .eq("organization_id", membership.organization.id)
        .in("id", recentMemberIds)
    : { data: [], error: null };
  const recentMembers = new Map(
    ((recentMembersResult.data ?? []) as MemberRow[]).map((member) => [member.id, member]),
  );
  const loadError = recentResult.error || searchResult.error || activeMembershipsResult.error || recentMembersResult.error;

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Front desk</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Member check-ins</h1>
        <p className="mt-2 text-sm text-slate-600">Find an active member, validate their branch membership, and record attendance.</p>

        {checkedInCode ? (
          <p className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">{checkedInCode} checked in successfully.</p>
        ) : null}
        {loadError ? (
          <p className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Check-in data could not be loaded. Confirm that the latest database migration is applied.</p>
        ) : null}

        {activeBranches.length === 0 ? (
          <p className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">You need access to an active branch before recording check-ins.</p>
        ) : (
          <>
            <section className="mt-7 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <form className="grid gap-4 sm:grid-cols-[minmax(12rem,0.7fr)_minmax(16rem,1.3fr)_auto] sm:items-end" method="get">
                <label className="text-sm font-medium text-slate-700">Branch
                  <select className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" defaultValue={selectedBranch?.id} name="branch">
                    {activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}
                  </select>
                </label>
                <label className="text-sm font-medium text-slate-700">Member name, code, or phone
                  <input className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" defaultValue={rawSearch} name="q" placeholder="Search members" required type="search" />
                </label>
                <button className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700" type="submit">Find member</button>
              </form>
            </section>

            {search ? (
              <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-200 px-6 py-5"><h2 className="font-semibold">Search results</h2><p className="mt-1 text-sm text-slate-500">Active member records matching “{search}”.</p></div>
                {searchMembers.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No matching members were found.</p> : (
                  <div className="divide-y divide-slate-100">
                    {searchMembers.map((member) => {
                      const canCheckIn = activeMemberIds.has(member.id);
                      return (
                        <article className="flex flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center" key={member.id}>
                          <div><p className="font-semibold text-slate-900">{member.full_name}</p><p className="mt-1 text-sm text-slate-500">{member.member_code} · {member.phone}</p></div>
                          {canCheckIn && selectedBranch ? <CheckInButton branchId={selectedBranch.id} memberId={member.id} organizationSlug={organizationSlug} /> : <span className="w-fit rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">No active membership here</span>}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            ) : null}

            <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-5"><h2 className="font-semibold">Recent attendance</h2><p className="mt-1 text-sm text-slate-500">The 25 newest entries at {selectedBranch?.name}.</p></div>
              {recent.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No check-ins have been recorded at this branch.</p> : (
                <div className="divide-y divide-slate-100">
                  {recent.map((entry) => {
                    const member = recentMembers.get(entry.member_id);
                    return <article className="flex items-center justify-between gap-5 p-5" key={entry.id}><div><p className="font-semibold">{member?.full_name ?? "Member"}</p><p className="mt-1 text-xs text-slate-400">{member?.member_code ?? ""} {member?.phone ? `· ${member.phone}` : ""}</p></div><time className="text-right text-sm text-slate-600" dateTime={entry.checked_in_at}>{formatCheckInTime(entry.checked_in_at, membership.organization.timezone)}</time></article>;
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
