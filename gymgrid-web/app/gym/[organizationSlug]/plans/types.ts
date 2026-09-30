export type MembershipPlanDurationUnit = "day" | "week" | "month" | "year";

export interface MembershipPlanFormValues {
  id: string;
  branchId: string | null;
  code: string;
  name: string;
  description: string;
  durationValue: number;
  durationUnit: MembershipPlanDurationUnit;
  priceAmountMinor: number;
  joiningFeeAmountMinor: number;
  taxInclusive: boolean;
  active: boolean;
}
