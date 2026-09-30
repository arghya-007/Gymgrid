"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";

export interface QrPassActionState {
  status: "idle" | "error";
  message: string;
}

export async function rotateMemberQrPass(
  organizationSlug: string,
  memberId: string,
  _previousState: QrPassActionState,
): Promise<QrPassActionState> {
  void _previousState;
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) {
    return { status: "error", message: "The member QR pass could not be identified." };
  }
  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  if (!membership.canManageCheckIns) {
    return { status: "error", message: "Your role cannot issue member QR passes." };
  }
  const { error } = await supabase.rpc("rotate_member_qr_pass", {
    p_organization_id: membership.organization.id,
    p_member_id: memberId,
  });
  if (error) {
    console.error("Member QR pass rotation failed", { code: error.code });
    return { status: "error", message: "The QR pass could not be issued. Confirm the member is active and in your branch scope." };
  }
  const passPath = `/gym/${organizationSlug}/members/${memberId}/qr-pass`;
  revalidatePath(passPath);
  redirect(`${passPath}?rotated=1`);
}
