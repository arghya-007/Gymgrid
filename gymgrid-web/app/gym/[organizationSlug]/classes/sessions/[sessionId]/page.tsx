import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import { ClassBookingForm, type BookableMemberOption } from "../../booking-form";
import { CancelClassBookingForm } from "../../cancel-booking-form";

interface SessionRow {
  id: string;
  branch_id: string;
  class_program_id: string;
  start_at: string;
  end_at: string;
  capacity: number;
  status: "scheduled" | "cancelled";
}

interface ProgramRow { name: string; code: string; }
interface MembershipRow { member_id: string; }
interface MemberRow { id: string; member_code: string; full_name: string; }
interface BookingRow {
  id: string;
  member_id: string;
  status: "booked" | "waitlisted" | "cancelled";
  confirmed_at: string | null;
  waitlisted_at: string | null;
  promoted_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
}

function formatDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

function localDate(value: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(new Date(value));
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

export default async function ClassSessionBookingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; sessionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ organizationSlug, sessionId }, query] = await Promise.all([params, searchParams]);
  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  if (!membership.canManageClassBookings) redirect(`/gym/${organizationSlug}/classes`);
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) notFound();

  const sessionResult = await supabase
    .from("class_sessions")
    .select("id, branch_id, class_program_id, start_at, end_at, capacity, status")
    .eq("organization_id", membership.organization.id)
    .eq("id", sessionId)
    .maybeSingle();
  const session = sessionResult.data as SessionRow | null;
  if (sessionResult.error || !session) notFound();

  const sessionDate = localDate(session.start_at, membership.organization.timezone);
  const [programResult, bookingsResult, membershipsResult] = await Promise.all([
    supabase
      .from("class_programs")
      .select("name, code")
      .eq("organization_id", membership.organization.id)
      .eq("id", session.class_program_id)
      .maybeSingle(),
    supabase
      .from("class_bookings")
      .select("id, member_id, status, confirmed_at, waitlisted_at, promoted_at, cancellation_reason, created_at")
      .eq("organization_id", membership.organization.id)
      .eq("class_session_id", session.id)
      .order("created_at"),
    supabase
      .from("member_memberships")
      .select("member_id")
      .eq("organization_id", membership.organization.id)
      .eq("branch_id", session.branch_id)
      .eq("lifecycle_state", "open")
      .lte("start_date", sessionDate)
      .gte("end_date", sessionDate),
  ]);
  const program = programResult.data as ProgramRow | null;
  const bookings = (bookingsResult.data ?? []) as BookingRow[];
  const eligibleMemberIds = [...new Set(((membershipsResult.data ?? []) as MembershipRow[]).map((row) => row.member_id))];
  const bookedMemberIds = new Set(bookings.filter((booking) => booking.status !== "cancelled").map((booking) => booking.member_id));
  const allMemberIds = [...new Set([...eligibleMemberIds, ...bookings.map((booking) => booking.member_id)])];
  const membersResult = allMemberIds.length
    ? await supabase
        .from("members")
        .select("id, member_code, full_name")
        .eq("organization_id", membership.organization.id)
        .eq("status", "active")
        .in("id", allMemberIds)
        .order("full_name")
    : { data: [], error: null };
  const members = (membersResult.data ?? []) as MemberRow[];
  const membersById = new Map(members.map((member) => [member.id, member]));
  const bookableMembers: BookableMemberOption[] = members
    .filter((member) => eligibleMemberIds.includes(member.id) && !bookedMemberIds.has(member.id))
    .map((member) => ({ id: member.id, memberCode: member.member_code, fullName: member.full_name }));
  const activeBookings = bookings.filter((booking) => booking.status !== "cancelled");
  const confirmed = activeBookings.filter((booking) => booking.status === "booked");
  const waitlisted = activeBookings.filter((booking) => booking.status === "waitlisted");
  const cancelled = bookings.filter((booking) => booking.status === "cancelled");
  const branchName = membership.branches.find((branch) => branch.id === session.branch_id)?.name ?? "Branch";
  const loadError = programResult.error || bookingsResult.error || membershipsResult.error || membersResult.error;

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-5xl">
        <Link className="text-sm font-semibold text-emerald-700" href={`/gym/${organizationSlug}/classes`}>← Classes</Link>
        <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Bookings</p>
              <h1 className="mt-2 text-3xl font-semibold">{program?.name ?? "Class session"}</h1>
              <p className="mt-2 text-sm text-slate-600">{program?.code} · {branchName} · {formatDateTime(session.start_at, membership.organization.timezone)}</p>
            </div>
            <div className="flex gap-3 text-center">
              <div className="rounded-2xl bg-emerald-50 px-4 py-3"><p className="text-xl font-semibold text-emerald-800">{confirmed.length}/{session.capacity}</p><p className="text-xs text-emerald-700">Booked</p></div>
              <div className="rounded-2xl bg-amber-50 px-4 py-3"><p className="text-xl font-semibold text-amber-800">{waitlisted.length}</p><p className="text-xs text-amber-700">Waitlist</p></div>
            </div>
          </div>
          {query.booked ? <p className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800" role="status">Member booked successfully.</p> : null}
          {query.waitlisted ? <p className="mt-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900" role="status">Capacity is full; the member was added to the waitlist.</p> : null}
          {query.bookingCancelled ? <p className="mt-6 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800" role="status">Booking cancelled. The first eligible waitlisted member was promoted automatically.</p> : null}
          {loadError ? <p className="mt-6 rounded-xl bg-rose-50 p-4 text-sm text-rose-800">Some booking data could not be loaded.</p> : null}
          {session.status === "scheduled" ? (
            <section className="mt-8 border-t border-slate-200 pt-7">
              <h2 className="text-lg font-semibold">Add member</h2>
              <p className="mt-1 text-sm text-slate-500">Only members whose membership covers the class date are listed. Full classes automatically use the waitlist.</p>
              <ClassBookingForm organizationSlug={organizationSlug} classSessionId={session.id} members={bookableMembers} />
              {bookableMembers.length === 0 ? <p className="mt-3 text-sm text-slate-500">No additional eligible members are available.</p> : null}
            </section>
          ) : <p className="mt-8 rounded-xl bg-slate-100 p-4 text-sm text-slate-600">This class is cancelled; its active bookings were cancelled automatically.</p>}
        </div>

        <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-6"><h2 className="text-xl font-semibold">Active roster</h2><p className="mt-1 text-sm text-slate-500">Confirmed members first, followed by the ordered waitlist.</p></div>
          {activeBookings.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">No members are booked yet.</p> : (
            <div className="divide-y divide-slate-100">
              {[...confirmed, ...waitlisted].map((booking, index) => {
                const member = membersById.get(booking.member_id);
                const queuePosition = booking.status === "waitlisted" ? waitlisted.findIndex((candidate) => candidate.id === booking.id) + 1 : null;
                return (
                  <article className="grid gap-4 p-5 sm:grid-cols-[1fr_auto_auto] sm:items-center" key={booking.id}>
                    <div><p className="font-semibold">{member?.full_name ?? "Member"}</p><p className="mt-1 text-xs text-slate-500">{member?.member_code ?? `Roster ${index + 1}`}{booking.promoted_at ? " · promoted from waitlist" : ""}</p></div>
                    <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${booking.status === "booked" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{booking.status === "booked" ? "Booked" : `Waitlist #${queuePosition}`}</span>
                    {session.status === "scheduled" ? <CancelClassBookingForm organizationSlug={organizationSlug} classSessionId={session.id} classBookingId={booking.id} /> : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {cancelled.length ? <details className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><summary className="cursor-pointer font-semibold">Cancelled bookings ({cancelled.length})</summary><div className="mt-4 space-y-3">{cancelled.map((booking) => { const member = membersById.get(booking.member_id); return <div className="flex justify-between gap-4 rounded-xl bg-slate-50 p-4 text-sm" key={booking.id}><span>{member?.full_name ?? "Member"} · {member?.member_code}</span><span className="text-slate-500">{booking.cancellation_reason}</span></div>; })}</div></details> : null}
      </div>
    </main>
  );
}
