import Link from "next/link";
import { connection } from "next/server";
import { requireTenantMembership } from "@/lib/tenant";
import { CancelSessionForm } from "./cancel-session-form";

interface ProgramRow { id: string; branch_id: string; code: string; name: string; description: string | null; default_duration_minutes: number; default_capacity: number; active: boolean; }
interface SessionRow { id: string; branch_id: string; class_program_id: string; trainer_organization_user_id: string | null; start_at: string; end_at: string; capacity: number; status: "scheduled" | "cancelled"; cancellation_reason: string | null; }
interface BookingRow { class_session_id: string; status: "booked" | "waitlisted" | "cancelled"; }
interface UserRow { id: string; user_id: string; }
interface ProfileRow { id: string; full_name: string | null; }

function formatDateTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(value));
}

export default async function ClassesPage({ params, searchParams }: { params: Promise<{ organizationSlug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const requestNow = new Date();
  const recentBoundary = new Date(requestNow);
  recentBoundary.setUTCDate(recentBoundary.getUTCDate() - 1);
  const [{ organizationSlug }, query] = await Promise.all([params, searchParams]);
  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  const [programsResult, sessionsResult] = await Promise.all([
    supabase.from("class_programs").select("id, branch_id, code, name, description, default_duration_minutes, default_capacity, active").eq("organization_id", membership.organization.id).order("name"),
    supabase.from("class_sessions").select("id, branch_id, class_program_id, trainer_organization_user_id, start_at, end_at, capacity, status, cancellation_reason").eq("organization_id", membership.organization.id).gte("start_at", recentBoundary.toISOString()).order("start_at").limit(100),
  ]);
  const programs = (programsResult.data ?? []) as ProgramRow[];
  const sessions = (sessionsResult.data ?? []) as SessionRow[];
  const sessionIds = sessions.map((session) => session.id);
  const bookingsResult = sessionIds.length && membership.canManageClassBookings
    ? await supabase.from("class_bookings").select("class_session_id, status").eq("organization_id", membership.organization.id).in("class_session_id", sessionIds).in("status", ["booked", "waitlisted"])
    : { data: [], error: null };
  const bookings = (bookingsResult.data ?? []) as BookingRow[];
  const trainerMembershipIds = [...new Set(sessions.flatMap((session) => session.trainer_organization_user_id ? [session.trainer_organization_user_id] : []))];
  const usersResult = trainerMembershipIds.length ? await supabase.from("organization_users").select("id, user_id").eq("organization_id", membership.organization.id).in("id", trainerMembershipIds) : { data: [], error: null };
  const users = (usersResult.data ?? []) as UserRow[];
  const profilesResult = users.length ? await supabase.from("profiles").select("id, full_name").in("id", users.map((user) => user.user_id)) : { data: [], error: null };
  const profiles = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile.full_name]));
  const trainers = new Map(users.map((user) => [user.id, profiles.get(user.user_id) ?? "Trainer"]));
  const programsById = new Map(programs.map((program) => [program.id, program]));
  const branches = new Map(membership.branches.map((branch) => [branch.id, branch.name]));
  const loadError = programsResult.error || sessionsResult.error || bookingsResult.error || usersResult.error || profilesResult.error;
  const now = requestNow.getTime();

  return <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10"><div className="mx-auto max-w-7xl"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Scheduling</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Classes</h1><p className="mt-2 text-sm text-slate-600">Reusable class types and the upcoming branch calendar.</p></div><div className="flex flex-wrap gap-3">{membership.canManageClassPrograms ? <Link className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700" href={`/gym/${organizationSlug}/classes/programs/new`}>New class type</Link> : null}{membership.canManageClassSessions ? <Link className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700" href={`/gym/${organizationSlug}/classes/sessions/new`}>Schedule class</Link> : null}</div></div>
  {query.saved || query.scheduled || query.cancelled ? <p className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">Class schedule updated successfully.</p> : null}
  {loadError ? <p className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">Class data could not be loaded. Confirm the latest migration is applied.</p> : null}
  <section className="mt-7 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 p-6"><h2 className="text-xl font-semibold">Upcoming calendar</h2><p className="mt-1 text-sm text-slate-500">Up to 100 sessions from yesterday onward.</p></div>{sessions.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">No classes are scheduled yet.</p> : <div className="divide-y divide-slate-100">{sessions.map((session) => { const program = programsById.get(session.class_program_id); const completed = session.status === "scheduled" && new Date(session.end_at).getTime() < now; const sessionBookings = bookings.filter((booking) => booking.class_session_id === session.id); const confirmedCount = sessionBookings.filter((booking) => booking.status === "booked").length; const waitlistCount = sessionBookings.filter((booking) => booking.status === "waitlisted").length; return <article className="grid gap-4 p-6 lg:grid-cols-[1.2fr_1fr_0.8fr_1.3fr] lg:items-center" key={session.id}><div><p className="font-semibold">{program?.name ?? "Class"}</p><p className="mt-1 text-xs text-slate-400">{program?.code} · {branches.get(session.branch_id) ?? "Branch"}</p></div><div className="text-sm text-slate-600"><p>{formatDateTime(session.start_at, membership.organization.timezone)}</p><p className="mt-1 text-xs">to {formatDateTime(session.end_at, membership.organization.timezone)}</p></div><div><p className="text-sm">{membership.canManageClassBookings ? `${confirmedCount}/${session.capacity} booked` : `Capacity ${session.capacity}`}</p><p className="mt-1 text-xs text-slate-500">{membership.canManageClassBookings && waitlistCount ? `${waitlistCount} waitlisted · ` : ""}{session.trainer_organization_user_id ? trainers.get(session.trainer_organization_user_id) ?? "Trainer" : "Trainer unassigned"}</p></div><div className="flex flex-col items-start gap-3 lg:items-end"><span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${session.status === "cancelled" ? "bg-rose-50 text-rose-700" : completed ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>{completed ? "completed" : session.status}</span>{membership.canManageClassBookings ? <Link className="text-xs font-semibold text-emerald-700" href={`/gym/${organizationSlug}/classes/sessions/${session.id}`}>Manage bookings</Link> : null}{session.status === "cancelled" ? <p className="text-xs text-slate-500">{session.cancellation_reason}</p> : membership.canManageClassSessions && !completed ? <CancelSessionForm organizationSlug={organizationSlug} sessionId={session.id} /> : null}</div></article>; })}</div>}</section>
  <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold">Class types</h2><p className="mt-1 text-sm text-slate-500">Branch defaults used when scheduling.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{programs.length}</span></div><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{programs.map((program) => <article className="rounded-2xl border border-slate-200 p-5" key={program.id}><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{program.name}</h3><p className="mt-1 text-xs font-semibold text-emerald-700">{program.code}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${program.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{program.active ? "Active" : "Inactive"}</span></div><p className="mt-3 text-sm text-slate-500">{program.description || "No description"}</p><p className="mt-4 text-xs text-slate-500">{branches.get(program.branch_id)} · {program.default_duration_minutes} min · {program.default_capacity} spots</p></article>)}</div>{programs.length === 0 ? <p className="mt-6 text-sm text-slate-500">No class types are available.</p> : null}</section>
  </div></main>;
}
