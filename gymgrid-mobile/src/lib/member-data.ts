import { supabase } from "@/lib/supabase";

export interface MemberProfile {
  id: string;
  organizationId: string;
  homeBranchId: string;
  memberCode: string;
  fullName: string;
  preferredName: string | null;
  status: "active" | "inactive" | "archived";
}

interface MemberRow {
  id: string;
  organization_id: string;
  home_branch_id: string;
  member_code: string;
  full_name: string;
  preferred_name: string | null;
  status: "active" | "inactive" | "archived";
}

export async function loadMyMemberProfile(
  organizationId: string,
): Promise<MemberProfile | null> {
  const { data, error } = await supabase
    .from("members")
    .select(
      "id, organization_id, home_branch_id, member_code, full_name, preferred_name, status",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;

  const member = data as MemberRow | null;
  if (!member) return null;

  return {
    id: member.id,
    organizationId: member.organization_id,
    homeBranchId: member.home_branch_id,
    memberCode: member.member_code,
    fullName: member.full_name,
    preferredName: member.preferred_name,
    status: member.status,
  };
}

export function formatGymDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}
