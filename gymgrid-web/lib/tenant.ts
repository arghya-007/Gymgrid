import { cache } from "react";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser } from "@/lib/auth";

export type TenantRole =
  | "gym_owner"
  | "gym_manager"
  | "receptionist"
  | "trainer"
  | "accountant"
  | "member";

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  status: "trial" | "active" | "suspended" | "cancelled";
  currency: string;
  timezone: string;
}

interface MembershipRow {
  id: string;
  organization_id: string;
  status: "invited" | "active" | "suspended";
}

interface RoleRow {
  organization_id: string;
  organization_user_id: string;
  role: TenantRole;
  branch_id: string | null;
}

interface BranchRow {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  status: "active" | "inactive";
}

export interface TenantRoleAssignment {
  role: TenantRole;
  branchId: string | null;
}

export interface TenantBranch {
  id: string;
  code: string;
  name: string;
  status: "active" | "inactive";
}

export interface TenantMembership {
  membershipId: string;
  organization: OrganizationRow;
  roles: TenantRoleAssignment[];
  branches: TenantBranch[];
  primaryRole: TenantRole;
  canManageOrganization: boolean;
  canManageMembers: boolean;
  canManageMemberships: boolean;
  canManageMembershipPlans: boolean;
  canManageTeam: boolean;
  canManageLeads: boolean;
  canManagePayments: boolean;
  canVoidPayments: boolean;
  canManageCheckIns: boolean;
  canViewOperationalReports: boolean;
  canManageClassPrograms: boolean;
  canManageClassSessions: boolean;
  canManageClassBookings: boolean;
  canViewSubscription: boolean;
}

const rolePriority: TenantRole[] = [
  "gym_owner",
  "gym_manager",
  "receptionist",
  "accountant",
  "trainer",
  "member",
];

export const tenantRoleLabels: Record<TenantRole, string> = {
  gym_owner: "Gym owner",
  gym_manager: "Gym manager",
  receptionist: "Receptionist",
  trainer: "Trainer",
  accountant: "Accountant",
  member: "Member",
};

export const getTenantSession = cache(async () => {
  const { supabase, user } = await requireAuthenticatedUser();
  const invitationResult = await supabase.rpc(
    "accept_my_organization_invitations",
  );

  if (invitationResult.error) {
    console.error("Pending staff invitations could not be accepted", {
      code: invitationResult.error.code,
    });
  }

  const { data: membershipData, error: membershipError } = await supabase
    .from("organization_users")
    .select("id, organization_id, status")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (membershipError) {
    console.error("Tenant memberships could not be loaded", {
      code: membershipError.code,
    });
    throw new Error("Tenant memberships could not be loaded.");
  }

  const membershipRows = (membershipData ?? []) as MembershipRow[];
  const membershipIds = membershipRows.map((membership) => membership.id);
  const organizationIds = membershipRows.map(
    (membership) => membership.organization_id,
  );

  const [platformResult, organizationsResult, rolesResult, branchesResult] =
    await Promise.all([
      supabase.rpc("is_platform_administrator"),
      organizationIds.length > 0
        ? supabase
            .from("organizations")
            .select("id, name, slug, status, currency, timezone")
            .in("id", organizationIds)
        : Promise.resolve({ data: [], error: null }),
      membershipIds.length > 0
        ? supabase
            .from("organization_user_roles")
            .select("organization_id, organization_user_id, role, branch_id")
            .in("organization_user_id", membershipIds)
        : Promise.resolve({ data: [], error: null }),
      organizationIds.length > 0
        ? supabase
            .from("branches")
            .select("id, organization_id, code, name, status")
            .in("organization_id", organizationIds)
            .order("name")
        : Promise.resolve({ data: [], error: null }),
    ]);

  const firstError = [
    platformResult.error,
    organizationsResult.error,
    rolesResult.error,
    branchesResult.error,
  ].find(Boolean);

  if (firstError) {
    console.error("Tenant workspace context could not be loaded", {
      code: firstError.code,
    });
    throw new Error("Tenant workspace context could not be loaded.");
  }

  const organizations = (organizationsResult.data ?? []) as OrganizationRow[];
  const roles = (rolesResult.data ?? []) as RoleRow[];
  const branches = (branchesResult.data ?? []) as BranchRow[];

  const memberships = membershipRows.flatMap<TenantMembership>((membership) => {
    const organization = organizations.find(
      (candidate) => candidate.id === membership.organization_id,
    );
    const membershipRoles = roles
      .filter((role) => role.organization_user_id === membership.id)
      .map((role) => ({ role: role.role, branchId: role.branch_id }));

    if (!organization || membershipRoles.length === 0) {
      return [];
    }

    const primaryRole =
      rolePriority.find((role) =>
        membershipRoles.some((assignment) => assignment.role === role),
      ) ?? membershipRoles[0].role;
    const hasOrganizationRole = (role: TenantRole) =>
      membershipRoles.some(
        (assignment) => assignment.role === role && assignment.branchId === null,
      );
    const hasOrganizationWideAccess = membershipRoles.some(
      (assignment) => assignment.branchId === null,
    );

    return [
      {
        membershipId: membership.id,
        organization,
        roles: membershipRoles,
        branches: branches
          .filter(
            (branch) =>
              branch.organization_id === organization.id &&
              (hasOrganizationWideAccess ||
                membershipRoles.some(
                  (assignment) => assignment.branchId === branch.id,
                )),
          )
          .map(({ id, code, name, status }) => ({ id, code, name, status })),
        primaryRole,
        canManageOrganization:
          hasOrganizationRole("gym_owner") ||
          hasOrganizationRole("gym_manager"),
        canManageMembers: membershipRoles.some((assignment) =>
          ["gym_owner", "gym_manager", "receptionist"].includes(
            assignment.role,
          ),
        ),
        canManageMemberships: membershipRoles.some((assignment) =>
          ["gym_owner", "gym_manager", "receptionist"].includes(
            assignment.role,
          ),
        ),
        canManageMembershipPlans: membershipRoles.some((assignment) =>
          ["gym_owner", "gym_manager"].includes(assignment.role),
        ),
        canManageTeam:
          hasOrganizationRole("gym_owner") ||
          hasOrganizationRole("gym_manager"),
        canManageLeads: membershipRoles.some((assignment) =>
          ["gym_owner", "gym_manager", "receptionist"].includes(
            assignment.role,
          ),
        ),
        canManagePayments: membershipRoles.some((assignment) =>
          ["gym_owner", "gym_manager", "receptionist", "accountant"].includes(
            assignment.role,
          ),
        ),
        canVoidPayments: membershipRoles.some((assignment) =>
          ["gym_owner", "gym_manager", "accountant"].includes(
            assignment.role,
          ),
        ),
        canManageCheckIns: membershipRoles.some((assignment) =>
          ["gym_owner", "gym_manager", "receptionist"].includes(
            assignment.role,
          ),
        ),
        canViewOperationalReports: membershipRoles.some((assignment) =>
          ["gym_owner", "gym_manager"].includes(assignment.role),
        ),
        canManageClassPrograms: membershipRoles.some((assignment) =>
          ["gym_owner", "gym_manager"].includes(assignment.role),
        ),
        canManageClassSessions: membershipRoles.some((assignment) =>
          ["gym_owner", "gym_manager", "receptionist"].includes(
            assignment.role,
          ),
        ),
        canManageClassBookings: membershipRoles.some((assignment) =>
          ["gym_owner", "gym_manager", "receptionist"].includes(
            assignment.role,
          ),
        ),
        canViewSubscription:
          hasOrganizationRole("gym_owner") ||
          hasOrganizationRole("gym_manager") ||
          hasOrganizationRole("accountant"),
      },
    ];
  });

  return {
    supabase,
    user,
    isPlatformAdministrator: Boolean(platformResult.data),
    memberships: memberships.sort((a, b) =>
      a.organization.name.localeCompare(b.organization.name),
    ),
  };
});

export const requireTenantMembership = cache(async (organizationSlug: string) => {
  const session = await getTenantSession();
  const membership = session.memberships.find(
    (candidate) => candidate.organization.slug === organizationSlug,
  );

  if (!membership) {
    redirect("/gym?error=workspace-access-required");
  }

  return { ...session, membership };
});
