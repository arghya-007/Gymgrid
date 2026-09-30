"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";

export interface KioskActionState {
  status: "idle" | "error";
  message: string;
}

function textField(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

export async function recordClassQrCheckIn(
  organizationSlug: string,
  _previousState: KioskActionState,
  formData: FormData,
): Promise<KioskActionState> {
  void _previousState;
  const sessionId = textField(formData, "sessionId");
  const rawToken = textField(formData, "qrToken");
  const token = rawToken.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !/^[0-9a-f-]{36}$/i.test(token)) {
    return { status: "error", message: "Select a class and scan a valid GymGrid member QR pass." };
  }
  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  if (!membership.canManageClassCheckIns) {
    return { status: "error", message: "Your role cannot record class check-ins." };
  }
  const { data, error } = await supabase.rpc("record_class_qr_check_in", {
    p_organization_id: membership.organization.id,
    p_class_session_id: sessionId,
    p_qr_token: token,
  });
  if (error) {
    console.error("Class QR check-in failed", { code: error.code });
    if (error.code === "42501") return { status: "error", message: "Your role cannot check members into that branch class." };
    if (error.code === "P0002") return { status: "error", message: "The class or member QR pass is inactive or unavailable." };
    if (error.code === "22023") return { status: "error", message: "Check-in requires a confirmed booking and an open class check-in window." };
    return { status: "error", message: "The QR check-in could not be recorded. Please try again." };
  }
  const result = Array.isArray(data) ? data[0] : null;
  const kioskPath = `/gym/${organizationSlug}/classes/kiosk`;
  revalidatePath(kioskPath);
  revalidatePath(`/gym/${organizationSlug}/classes/sessions/${sessionId}`);
  redirect(`${kioskPath}?session=${sessionId}&checkedIn=1${result?.already_checked_in ? "&duplicate=1" : ""}`);
}
