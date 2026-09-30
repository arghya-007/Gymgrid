import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import { KioskScannerForm, type KioskSessionOption } from "./scanner-form";

interface SessionRow { id: string; branch_id: string; class_program_id: string; start_at: string; end_at: string; status: "scheduled" | "cancelled"; }
interface ProgramRow { id: string; name: string; code: string; }
interface CheckInRow { id: string; member_id: string; checked_in_at: string; }
interface MemberRow { id: string; member_code: string; full_name: string; }

function formatDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}

export default async function ClassKioskPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const requestNow = new Date();
  const windowStart = new Date(requestNow);
  windowStart.setUTCDate(windowStart.getUTCDate() - 1);
  const windowEnd = new Date(requestNow);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + 7);
  const [{ organizationSlug }, query] = await Promise.all([params, searchParams]);
  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  if (!membership.canManageClassCheckIns) redirect(`/gym/${organizationSlug}/classes`);

  const branchIds = membership.branches.filter((branch) => branch.status === "active").map((branch) => branch.id);
  const sessionsResult = branchIds.length
    ? await supabase
        .from("class_sessions")
        .select("id, branch_id, class_program_id, start_at, end_at, status")
        .eq("organization_id", membership.organization.id)
        .eq("status", "scheduled")
        .in("branch_id", branchIds)
        .gte("end_at", windowStart.toISOString())
        .lte("start_at", windowEnd.toISOString())
        .order("start_at")
        .limit(100)
    : { data: [], error: null };
  const sessions = (sessionsResult.data ?? []) as SessionRow[];
  const programIds = [...new Set(sessions.map((session) => session.class_program_id))];
  const programsResult = programIds.length
    ? await supabase.from("class_programs").select("id, name, code").eq("organization_id", membership.organization.id).in("id", programIds)
    : { data: [], error: null };
  const programs = new Map(((programsResult.data ?? []) as ProgramRow[]).map((program) => [program.id, program]));
  const branches = new Map(membership.branches.map((branch) => [branch.id, branch.name]));
  const requestedSessionId = typeof query.session === "string" ? query.session : "";
  const selectedSession = sessions.find((session) => session.id === requestedSessionId) ?? sessions[0] ?? null;
  const sessionOptions: KioskSessionOption[] = sessions.map((session) => {
    const program = programs.get(session.class_program_id);
    return {
      id: session.id,
      label: `${program?.name ?? "Class"} · ${branches.get(session.branch_id) ?? "Branch"} · ${formatDateTime(session.start_at, membership.organization.timezone)}`,
    };
  });
  const checkInsResult = selectedSession
    ? await supabase
        .from("class_check_ins")
        .select("id, member_id, checked_in_at")
        .eq("organization_id", membership.organization.id)
        .eq("class_session_id", selectedSession.id)
        .order("checked_in_at", { ascending: false })
        .limit(20)
    : { data: [], error: null };
  const checkIns = (checkInsResult.data ?? []) as CheckInRow[];
  const memberIds = [...new Set(checkIns.map((checkIn) => checkIn.member_id))];
  const membersResult = memberIds.length
    ? await supabase.from("members").select("id, member_code, full_name").eq("organization_id", membership.organization.id).in("id", memberIds)
    : { data: [], error: null };
  const members = new Map(((membersResult.data ?? []) as MemberRow[]).map((member) => [member.id, member]));
  const loadError = sessionsResult.error || programsResult.error || checkInsResult.error || membersResult.error;

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <Link className="text-sm font-semibold text-emerald-700" href={`/gym/${organizationSlug}/classes`}>← Classes</Link>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Scanner ready</span>
        </div>
        <div className="mt-5 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Class kiosk</p>
            <h1 className="mt-2 text-3xl font-semibold">QR check-in</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">Use a USB/Bluetooth QR scanner or paste the payload. Only confirmed bookings can enter, from 90 minutes before class until 30 minutes after it ends.</p>
            {query.checkedIn ? <p className={`mt-6 rounded-xl p-4 text-sm ${query.duplicate ? "bg-amber-50 text-amber-900" : "bg-emerald-50 text-emerald-800"}`} role="status">{query.duplicate ? "This member was already checked in." : "Member checked in successfully."}</p> : null}
            {loadError ? <p className="mt-6 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">Kiosk data could not be loaded.</p> : null}
            {sessions.length ? <div className="mt-8"><KioskScannerForm organizationSlug={organizationSlug} selectedSessionId={selectedSession?.id ?? ""} sessions={sessionOptions} /></div> : <p className="mt-8 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">No scheduled classes are available in the next seven days.</p>}
          </section>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-6"><h2 className="text-xl font-semibold">Recent arrivals</h2><p className="mt-1 text-sm text-slate-500">Latest 20 for the selected class.</p></div>
            {checkIns.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">No class check-ins yet.</p> : <div className="divide-y divide-slate-100">{checkIns.map((checkIn) => { const member = members.get(checkIn.member_id); return <article className="flex items-center justify-between gap-4 p-5" key={checkIn.id}><div><p className="font-semibold">{member?.full_name ?? "Member"}</p><p className="mt-1 text-xs text-slate-500">{member?.member_code ?? "Member record"}</p></div><time className="text-xs text-slate-500">{formatDateTime(checkIn.checked_in_at, membership.organization.timezone)}</time></article>; })}</div>}
          </section>
        </div>
      </div>
    </main>
  );
}
