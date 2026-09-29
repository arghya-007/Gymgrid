/** Shared contracts for GymGrid's web portal, future mobile app, and services. */

export const tenantRoleValues = [
  "gym_owner",
  "gym_manager",
  "receptionist",
  "trainer",
  "accountant",
  "member",
] as const;

export type TenantRole = (typeof tenantRoleValues)[number];
export type PlatformRole = "platform_admin";
export type GymRole = PlatformRole | TenantRole;

export const organizationStatusValues = [
  "trial",
  "active",
  "suspended",
  "cancelled",
] as const;

export type OrganizationStatus = (typeof organizationStatusValues)[number];

export interface TenantScope {
  organizationId: string;
  branchId?: string;
}

export interface TenantOnboardingInput {
  organizationName: string;
  organizationSlug: string;
  branchName: string;
  branchCode: string;
  ownerEmail: string;
  planCode: SubscriptionBand;
  subscriptionStart: string;
}

export interface TenantOnboardingResult {
  organizationId: string;
  branchId: string;
  invitationId: string;
  subscriptionId: string;
}

export const subscriptionBandValues = [
  "launch",
  "growth",
  "scale",
  "enterprise",
] as const;

export type SubscriptionBand = (typeof subscriptionBandValues)[number];

export interface SubscriptionAllowance {
  activeMembers: number | null;
  branches: number | null;
  staffUsers: number | null;
}

export const initialSubscriptionAllowances: Readonly<
  Record<Exclude<SubscriptionBand, "enterprise">, SubscriptionAllowance>
> = {
  launch: { activeMembers: 100, branches: 1, staffUsers: 3 },
  growth: { activeMembers: 300, branches: 1, staffUsers: null },
  scale: { activeMembers: 700, branches: 1, staffUsers: null },
};
