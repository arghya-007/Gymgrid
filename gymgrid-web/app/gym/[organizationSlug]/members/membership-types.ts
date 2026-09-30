export type MembershipDisplayStatus =
  | "scheduled"
  | "active"
  | "frozen"
  | "expired"
  | "cancelled";

export interface MembershipSummary {
  id: string;
  member_id: string;
  enrollment_code: string;
  plan_name: string;
  status: MembershipDisplayStatus;
  start_date: string;
  end_date: string;
}

export function membershipStatusClassName(status: MembershipDisplayStatus) {
  if (status === "active") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (status === "scheduled") {
    return "bg-sky-50 text-sky-700";
  }
  if (status === "frozen") {
    return "bg-violet-50 text-violet-700";
  }
  if (status === "cancelled") {
    return "bg-rose-50 text-rose-700";
  }
  return "bg-slate-100 text-slate-500";
}
