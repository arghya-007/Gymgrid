export type LeadStatus =
  | "new"
  | "contacted"
  | "trial_scheduled"
  | "won"
  | "lost";

export type LeadSource =
  | "walk_in"
  | "referral"
  | "website"
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "phone"
  | "other";

export interface LeadFormValues {
  id: string;
  branchId: string;
  fullName: string;
  phone: string;
  email: string;
  source: LeadSource;
  status: LeadStatus;
  interestedPlanId: string | null;
  followUpAt: string | null;
  notes: string;
  lostReason: string;
}

export interface LeadPlanOption {
  id: string;
  branchId: string | null;
  code: string;
  name: string;
}
