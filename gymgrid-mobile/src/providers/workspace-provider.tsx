import type { TenantRole } from "@gymgrid/domain";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { supabase } from "@/lib/supabase";
import { useAuth } from "@/providers/auth-provider";

interface MembershipRow {
  id: string;
  organization_id: string;
}

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  status: "trial" | "active" | "suspended" | "cancelled";
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
}

export interface WorkspaceRole {
  role: TenantRole;
  branchId: string | null;
}

export interface TenantWorkspace {
  membershipId: string;
  organization: OrganizationRow;
  roles: WorkspaceRole[];
  branches: Pick<BranchRow, "id" | "code" | "name">[];
  hasMemberMode: boolean;
  hasStaffMode: boolean;
}

interface WorkspaceContextValue {
  error: string | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  workspaces: TenantWorkspace[];
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

async function loadWorkspaces(userId: string): Promise<TenantWorkspace[]> {
  const invitationResult = await supabase.rpc(
    "accept_my_organization_invitations",
  );

  if (invitationResult.error) {
    console.warn("Pending invitations could not be accepted", {
      code: invitationResult.error.code,
    });
  }

  const membershipsResult = await supabase
    .from("organization_users")
    .select("id, organization_id")
    .eq("user_id", userId)
    .eq("status", "active");

  if (membershipsResult.error) {
    throw membershipsResult.error;
  }

  const memberships = (membershipsResult.data ?? []) as MembershipRow[];
  const membershipIds = memberships.map((membership) => membership.id);
  const organizationIds = memberships.map(
    (membership) => membership.organization_id,
  );

  if (memberships.length === 0) {
    return [];
  }

  const [organizationsResult, rolesResult, branchesResult] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, name, slug, status")
      .in("id", organizationIds),
    supabase
      .from("organization_user_roles")
      .select("organization_id, organization_user_id, role, branch_id")
      .in("organization_user_id", membershipIds),
    supabase
      .from("branches")
      .select("id, organization_id, code, name")
      .in("organization_id", organizationIds)
      .eq("status", "active")
      .order("name"),
  ]);

  const firstError = [
    organizationsResult.error,
    rolesResult.error,
    branchesResult.error,
  ].find(Boolean);

  if (firstError) {
    throw firstError;
  }

  const organizations = (organizationsResult.data ?? []) as OrganizationRow[];
  const roles = (rolesResult.data ?? []) as RoleRow[];
  const branches = (branchesResult.data ?? []) as BranchRow[];

  return memberships.flatMap<TenantWorkspace>((membership) => {
    const organization = organizations.find(
      (candidate) => candidate.id === membership.organization_id,
    );
    const membershipRoles = roles
      .filter((role) => role.organization_user_id === membership.id)
      .map(({ role, branch_id }) => ({ role, branchId: branch_id }));

    if (!organization || membershipRoles.length === 0) {
      return [];
    }

    const hasOrganizationWideAccess = membershipRoles.some(
      (role) => role.branchId === null,
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
                membershipRoles.some((role) => role.branchId === branch.id)),
          )
          .map(({ id, code, name }) => ({ id, code, name })),
        hasMemberMode: membershipRoles.some((role) => role.role === "member"),
        hasStaffMode: membershipRoles.some((role) => role.role !== "member"),
      },
    ];
  });
}

export function WorkspaceProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<TenantWorkspace[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!user) {
      setWorkspaces([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      setWorkspaces(await loadWorkspaces(user.id));
    } catch (cause) {
      console.error("Gym workspaces could not be loaded", cause);
      setError("Your gym workspaces could not be loaded. Pull down to try again.");
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    const timeoutId = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timeoutId);
  }, [refresh]);

  const value = useMemo(
    () => ({ error, isLoading, refresh, workspaces }),
    [error, isLoading, refresh, workspaces],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaces() {
  const value = useContext(WorkspaceContext);

  if (!value) {
    throw new Error("useWorkspaces must be used inside WorkspaceProvider");
  }

  return value;
}
