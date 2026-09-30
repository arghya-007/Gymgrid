"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";

export interface VoidPaymentState { status: "idle" | "error"; message: string }

export async function voidPayment(
  organizationSlug: string,
  paymentId: string,
  _previousState: VoidPaymentState,
  formData: FormData,
): Promise<VoidPaymentState> {
  const reason = String(formData.get("reason") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(paymentId) || reason.length < 2 || reason.length > 500) {
    return { status: "error", message: "Enter a void reason between 2 and 500 characters." };
  }
  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  if (!membership.canVoidPayments) return { status: "error", message: "Your role cannot void payments." };

  const paymentResult = await supabase.from("manual_payments").select("id, branch_id, status").eq("organization_id", membership.organization.id).eq("id", paymentId).maybeSingle();
  const payment = paymentResult.data as { branch_id: string; status: string } | null;
  if (paymentResult.error || !payment || payment.status !== "recorded" || !membership.branches.some((branch) => branch.id === payment.branch_id)) {
    return { status: "error", message: "This payment is unavailable." };
  }

  const { error } = await supabase.rpc("void_manual_payment", {
    p_organization_id: membership.organization.id,
    p_payment_id: paymentId,
    p_reason: reason,
  });
  if (error) {
    console.error("Payment void failed", { code: error.code });
    return { status: "error", message: error.code === "42501" ? "You cannot void this payment." : "The payment could not be voided." };
  }
  revalidatePath(`/gym/${organizationSlug}/payments`);
  revalidatePath(`/gym/${organizationSlug}/payments/${paymentId}/receipt`);
  redirect(`/gym/${organizationSlug}/payments/${paymentId}/receipt?voided=1`);
}
