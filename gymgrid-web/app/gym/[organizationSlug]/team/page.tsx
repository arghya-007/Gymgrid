import { connection } from "next/server";
import { redirect } from "next/navigation";
import {
  requireTenantMembership,
  tenantRoleLabels,
  type TenantRole,
} from "@/lib/tenant";
import { revokeStaffInvitation, setStaffStatus } from "./actions";
import { InviteStaffForm } from "./invite-staff-form";

interface OrganizationUserRow {
  id: string;
  user_id: string;
  status: "invited" | "active" | "suspended";
  joined_at: string | null;
  created_at: string;
}

interface RoleRow {
  organization_user_id: string;
  role: TenantRole;
  branch_id: string | null;
}

interface InvitationRow {
  id: string;
  email: string;
  role: TenantRole;
  branch_id: string | null;
  status: "pending" | "accepted" | "revoked" | "expired";
  accepted_by: string | null;
  expires_at: string;
  created_at: string;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  phone: string | null;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const [{ organizationSlug }, query] = await Promise.all([params, searchParams]);
  const { membership, supabase, user } =
    await requireTenantMembership(organizationSlug);

  if (!membership.canManageTeam) {
    redirect(`/gym/${organizationSlug}`);
  }

  const [usersResult, rolesResult, invitationsResult] = await Promise.all([
    supabase
      .from("organization_users")
      .select("id, user_id, status, joined_at, created_at")
      .eq("organization_id", membership.organization.id)
      .order("created_at"),
    supabase
      .from("organization_user_roles")
      .select("organization_user_id, role, branch_id")
      .eq("organization_id", membership.organization.id),
    supabase
      .from("organization_invitations")
      .select(
        "id, email, role, branch_id, status, accepted_by, expires_at, created_at",
      )
      .eq("organization_id", membership.organization.id)
      .order("created_at", { ascending: false }),
  ]);

  const users = (usersResult.data ?? []) as OrganizationUserRow[];
  const roles = (rolesResult.data ?? []) as RoleRow[];
  const invitations = (invitationsResult.data ?? []) as InvitationRow[];
  const profileResult = users.length
    ? await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in(
          "id",
          users.map((staffUser) => staffUser.user_id),
        )
    : { data: [], error: null };
  const profiles = (profileResult.data ?? []) as ProfileRow[];
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const branchesById = new Map(
    membership.branches.map((branch) => [branch.id, branch.name]),
  );
  const acceptedEmailsByUserId = new Map(
    invitations
      .filter((invitation) => invitation.accepted_by)
      .map((invitation) => [invitation.accepted_by as string, invitation.email]),
  );
  const pendingInvitations = invitations.filter(
    (invitation) =>
      invitation.status === "pending" && new Date(invitation.expires_at) > new Date(),
  );
  const staff = users
    .map((staffUser) => ({
      ...staffUser,
      assignments: roles.filter(
        (assignment) => assignment.organization_user_id === staffUser.id,
      ),
    }))
    .filter((staffUser) =>
      staffUser.assignments.some((assignment) => assignment.role !== "member"),
    );
  const isOwner = membership.roles.some(
    (assignment) =>
      assignment.role === "gym_owner" && assignment.branchId === null,
  );
  const invitedEmail =
    typeof query.invited === "string" ? query.invited.slice(0, 254) : "";
  const updated = typeof query.updated === "string" ? query.updated : "";
  const hasLoadError = Boolean(
    usersResult.error ||
      rolesResult.error ||
      invitationsResult.error ||
      profileResult.error,
  );

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
            Access and roles
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Team
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Invite staff, assign organization or branch access, and suspend access when needed.
          </p>
        </div>

        {invitedEmail ? (
          <p className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">
            Invitation created for {invitedEmail}.
          </p>
        ) : null}
        {updated ? (
          <p className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">
            Team access was updated successfully.
          </p>
        ) : null}
        {query.error ? (
          <p className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
            That team action could not be completed.
          </p>
        ) : null}
        {hasLoadError ? (
          <p className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
            Team data could not be loaded. Confirm that the staff-management migration has been applied.
          </p>
        ) : null}

        <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_1.6fr]">
          <section className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">Invite staff</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Email delivery is not connected yet. Share the GymGrid login URL; access activates only when the person signs in with this exact email.
            </p>
            <div className="mt-6">
              <InviteStaffForm
                branches={membership.branches.filter(
                  (branch) => branch.status === "active",
                )}
                canInviteManagers={isOwner}
                organizationSlug={organizationSlug}
              />
            </div>
          </section>

          <div className="space-y-6">
            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 p-6">
                <div>
                  <h2 className="text-xl font-semibold">Active team</h2>
                  <p className="mt-1 text-sm text-slate-500">Owners and staff with organization access.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {staff.length} people
                </span>
              </div>
              {staff.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500">No staff records are available.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {staff.map((staffUser) => {
                    const profile = profilesById.get(staffUser.user_id);
                    const hasOwnerRole = staffUser.assignments.some(
                      (assignment) => assignment.role === "gym_owner",
                    );
                    const hasManagerRole = staffUser.assignments.some(
                      (assignment) => assignment.role === "gym_manager",
                    );
                    const canChangeStatus =
                      staffUser.user_id !== user.id &&
                      !hasOwnerRole &&
                      (isOwner || !hasManagerRole);
                    const nextStatus =
                      staffUser.status === "suspended" ? "active" : "suspended";

                    return (
                      <article className="p-6" key={staffUser.id}>
                        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-slate-900">
                                {profile?.full_name ||
                                  acceptedEmailsByUserId.get(staffUser.user_id) ||
                                  "Staff member"}
                              </h3>
                              <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ${
                                staffUser.status === "active"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-800"
                              }`}>
                                {staffUser.status}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-slate-500">
                              {acceptedEmailsByUserId.get(staffUser.user_id) ||
                                profile?.phone ||
                                "Contact details unavailable"}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {staffUser.assignments.map((assignment) => (
                                <span
                                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600"
                                  key={`${assignment.role}-${assignment.branch_id ?? "all"}`}
                                >
                                  {tenantRoleLabels[assignment.role]} · {assignment.branch_id
                                    ? (branchesById.get(assignment.branch_id) ?? "Assigned branch")
                                    : "All branches"}
                                </span>
                              ))}
                            </div>
                            <p className="mt-3 text-xs text-slate-400">
                              {staffUser.joined_at
                                ? `Joined ${formatDate(staffUser.joined_at)}`
                                : `Added ${formatDate(staffUser.created_at)}`}
                            </p>
                          </div>
                          {canChangeStatus ? (
                            <form
                              action={setStaffStatus.bind(
                                null,
                                organizationSlug,
                                staffUser.id,
                                nextStatus,
                              )}
                            >
                              <button
                                className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:border-slate-400"
                                type="submit"
                              >
                                {nextStatus === "active" ? "Restore access" : "Suspend access"}
                              </button>
                            </form>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-6">
                <h2 className="text-xl font-semibold">Pending invitations</h2>
                <p className="mt-1 text-sm text-slate-500">Invitations expire seven days after creation.</p>
              </div>
              {pendingInvitations.length === 0 ? (
                <p className="p-8 text-center text-sm text-slate-500">No pending invitations.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {pendingInvitations.map((invitation) => {
                    const canRevoke = isOwner || invitation.role !== "gym_manager";
                    return (
                      <article
                        className="flex flex-col justify-between gap-4 p-6 sm:flex-row sm:items-center"
                        key={invitation.id}
                      >
                        <div>
                          <p className="font-semibold text-slate-900">{invitation.email}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {tenantRoleLabels[invitation.role]} · {invitation.branch_id
                              ? (branchesById.get(invitation.branch_id) ?? "Assigned branch")
                              : "All branches"}
                          </p>
                          <p className="mt-2 text-xs text-slate-400">
                            Expires {formatDate(invitation.expires_at)}
                          </p>
                        </div>
                        {canRevoke ? (
                          <form
                            action={revokeStaffInvitation.bind(
                              null,
                              organizationSlug,
                              invitation.id,
                            )}
                          >
                            <button
                              className="rounded-xl border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                              type="submit"
                            >
                              Revoke
                            </button>
                          </form>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
