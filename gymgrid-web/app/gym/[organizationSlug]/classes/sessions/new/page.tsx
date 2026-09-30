import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import { ClassSessionForm } from "../../session-form";
import type { ClassProgramOption, TrainerOption } from "../../types";

interface ProgramRow { id: string; branch_id: string; code: string; name: string; default_duration_minutes: number; default_capacity: number; }
interface RoleRow { organization_user_id: string; branch_id: string | null; }
interface UserRow { id: string; user_id: string; }
interface ProfileRow { id: string; full_name: string | null; }

export default async function NewClassSessionPage({ params }: { params: Promise<{ organizationSlug: string }> }) {
  const { organizationSlug } = await params;
  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  if (!membership.canManageClassSessions) redirect(`/gym/${organizationSlug}/classes`);
  const branchIds = membership.branches.filter((branch) => branch.status === "active").map((branch) => branch.id);
  const programsResult = branchIds.length ? await supabase.from("class_programs").select("id, branch_id, code, name, default_duration_minutes, default_capacity").eq("organization_id", membership.organization.id).eq("active", true).in("branch_id", branchIds).order("name") : { data: [], error: null };
  const trainerRolesResult = await supabase.from("organization_user_roles").select("organization_user_id, branch_id").eq("organization_id", membership.organization.id).eq("role", "trainer");
  const trainerRoles = (trainerRolesResult.data ?? []) as RoleRow[];
  const trainerMembershipIds = [...new Set(trainerRoles.map((role) => role.organization_user_id))];
  const usersResult = trainerMembershipIds.length ? await supabase.from("organization_users").select("id, user_id").eq("organization_id", membership.organization.id).eq("status", "active").in("id", trainerMembershipIds) : { data: [], error: null };
  const users = (usersResult.data ?? []) as UserRow[];
  const profilesResult = users.length ? await supabase.from("profiles").select("id, full_name").in("id", users.map((user) => user.user_id)) : { data: [], error: null };
  const profiles = new Map(((profilesResult.data ?? []) as ProfileRow[]).map((profile) => [profile.id, profile.full_name]));
  const branches = new Map(membership.branches.map((branch) => [branch.id, branch.name]));
  const programs: ClassProgramOption[] = ((programsResult.data ?? []) as ProgramRow[]).map((program) => ({ id: program.id, branchId: program.branch_id, code: program.code, name: program.name, durationMinutes: program.default_duration_minutes, defaultCapacity: program.default_capacity }));
  const trainers: TrainerOption[] = users.map((user) => { const assignments = trainerRoles.filter((role) => role.organization_user_id === user.id); return { organizationUserId: user.id, name: profiles.get(user.user_id) ?? "Trainer", scope: assignments.some((role) => role.branch_id === null) ? "All branches" : assignments.map((role) => branches.get(role.branch_id ?? "") ?? "Assigned branch").join(", ") }; });
  return <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10"><div className="mx-auto max-w-4xl"><Link className="text-sm font-semibold text-emerald-700" href={`/gym/${organizationSlug}/classes`}>← Classes</Link><div className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10"><p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Class calendar</p><h1 className="mt-2 text-3xl font-semibold">Schedule a class</h1><p className="mt-3 text-sm leading-6 text-slate-600">Times are interpreted in {membership.organization.timezone}. A trainer cannot be assigned to overlapping sessions.</p>{programs.length ? <div className="mt-9"><ClassSessionForm organizationSlug={organizationSlug} programs={programs} trainers={trainers} /></div> : <p className="mt-8 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Create an active class type before scheduling a session.</p>}</div></div></main>;
}
