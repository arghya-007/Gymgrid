import { supabase } from "@/lib/supabase";

export interface StaffMember {
  id: string;
  organizationId: string;
  homeBranchId: string;
  memberCode: string;
  fullName: string;
  preferredName: string | null;
  email: string | null;
  phone: string;
  status: "active" | "inactive" | "archived";
  authUserId: string | null;
  photoPath: string | null;
  photoUrl: string | null;
}

interface StaffMemberRow {
  id: string;
  organization_id: string;
  home_branch_id: string;
  member_code: string;
  full_name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string;
  status: "active" | "inactive" | "archived";
  auth_user_id: string | null;
  photo_path: string | null;
}

export async function loadStaffMember(
  organizationId: string,
  memberId: string,
): Promise<StaffMember | null> {
  const { data, error } = await supabase
    .from("members")
    .select(
      "id, organization_id, home_branch_id, member_code, full_name, preferred_name, email, phone, status, auth_user_id, photo_path",
    )
    .eq("organization_id", organizationId)
    .eq("id", memberId)
    .maybeSingle();

  if (error) throw error;

  const member = data as StaffMemberRow | null;
  if (!member) return null;

  let photoUrl: string | null = null;
  if (member.photo_path) {
    const signedResult = await supabase.storage
      .from("member-photos")
      .createSignedUrl(member.photo_path, 3600);
    if (!signedResult.error) photoUrl = signedResult.data.signedUrl;
  }

  return {
    id: member.id,
    organizationId: member.organization_id,
    homeBranchId: member.home_branch_id,
    memberCode: member.member_code,
    fullName: member.full_name,
    preferredName: member.preferred_name,
    email: member.email,
    phone: member.phone,
    status: member.status,
    authUserId: member.auth_user_id,
    photoPath: member.photo_path,
    photoUrl,
  };
}

export function formatGymDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

export function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    currency,
    maximumFractionDigits: 2,
    style: "currency",
  }).format(amountMinor / 100);
}

export function todayInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
