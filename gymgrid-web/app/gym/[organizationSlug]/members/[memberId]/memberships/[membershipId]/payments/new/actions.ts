"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import type { ManualPaymentMethod } from "@/app/gym/[organizationSlug]/payments/payment-types";

export interface RecordPaymentState {
  status: "idle" | "error";
  message: string;
}

const methods: ManualPaymentMethod[] = ["cash", "upi", "card", "bank_transfer", "cheque", "other"];

function textField(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function parseAmountMinor(value: string) {
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export async function recordPayment(
  organizationSlug: string,
  memberId: string,
  membershipId: string,
  _previousState: RecordPaymentState,
  formData: FormData,
): Promise<RecordPaymentState> {
  const amountMinor = parseAmountMinor(textField(formData, "amount"));
  const method = textField(formData, "paymentMethod") as ManualPaymentMethod;
  const paymentDate = textField(formData, "paymentDate");
  const transactionReference = textField(formData, "transactionReference");
  const notes = textField(formData, "notes");

  if (
    !/^[0-9a-f-]{36}$/i.test(memberId) ||
    !/^[0-9a-f-]{36}$/i.test(membershipId) ||
    amountMinor === null ||
    amountMinor <= 0 ||
    !methods.includes(method) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(paymentDate) ||
    transactionReference.length > 120 ||
    notes.length > 1000
  ) {
    return { status: "error", message: "Review the amount, date, method, reference, and notes." };
  }

  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  if (!membership.canManagePayments) {
    return { status: "error", message: "Your role does not permit payment collection." };
  }

  const targetResult = await supabase
    .from("membership_payment_balances")
    .select("membership_id, member_id, branch_id, outstanding_amount_minor")
    .eq("organization_id", membership.organization.id)
    .eq("membership_id", membershipId)
    .eq("member_id", memberId)
    .maybeSingle();
  const target = targetResult.data as { branch_id: string; outstanding_amount_minor: number } | null;
  if (
    targetResult.error ||
    !target ||
    amountMinor > target.outstanding_amount_minor ||
    !membership.branches.some((branch) => branch.id === target.branch_id && branch.status === "active")
  ) {
    return { status: "error", message: "This payment exceeds the available membership balance or branch scope." };
  }

  const { data, error } = await supabase.rpc("record_manual_payment", {
    p_organization_id: membership.organization.id,
    p_membership_id: membershipId,
    p_amount_minor: amountMinor,
    p_payment_method: method,
    p_payment_date: paymentDate,
    p_transaction_reference: transactionReference || null,
    p_notes: notes || null,
  });

  if (error) {
    console.error("Manual payment failed", { code: error.code });
    return {
      status: "error",
      message: error.code === "42501"
        ? "You cannot record this payment."
        : error.code === "22023"
          ? "The amount, date, or membership balance is no longer available."
          : "The payment could not be recorded. Please try again.",
    };
  }

  const paymentId = Array.isArray(data) ? data[0]?.payment_id : undefined;
  const receiptCode = Array.isArray(data) ? data[0]?.receipt_code : undefined;
  revalidatePath(`/gym/${organizationSlug}/payments`);
  revalidatePath(`/gym/${organizationSlug}/members/${memberId}`);
  redirect(
    paymentId
      ? `/gym/${organizationSlug}/payments/${paymentId}/receipt?created=${encodeURIComponent(receiptCode ?? "receipt")}`
      : `/gym/${organizationSlug}/payments`,
  );
}
