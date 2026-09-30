"use client";

import { useActionState } from "react";
import { paymentMethodLabels, type ManualPaymentMethod } from "@/app/gym/[organizationSlug]/payments/payment-types";
import { recordPayment } from "./actions";

const methods = Object.entries(paymentMethodLabels) as [ManualPaymentMethod, string][];
const fieldClassName = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";

export function PaymentForm({
  organizationSlug,
  memberId,
  membershipId,
  outstandingAmountMinor,
  currency,
  localDate,
}: {
  organizationSlug: string;
  memberId: string;
  membershipId: string;
  outstandingAmountMinor: number;
  currency: string;
  localDate: string;
}) {
  const save = recordPayment.bind(null, organizationSlug, memberId, membershipId);
  const [state, action, pending] = useActionState(save, { status: "idle" as const, message: "" });
  return (
    <form action={action} className="space-y-7">
      <label className="block text-sm font-medium text-slate-700">
        Amount ({currency})
        <input className={fieldClassName} inputMode="decimal" max={(outstandingAmountMinor / 100).toFixed(2)} min="0.01" name="amount" placeholder="0.00" required step="0.01" />
      </label>
      <div className="grid gap-6 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Payment method
          <select className={fieldClassName} defaultValue="" name="paymentMethod" required>
            <option disabled value="">Select method</option>
            {methods.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Payment date
          <input className={fieldClassName} defaultValue={localDate} max={localDate} name="paymentDate" required type="date" />
        </label>
      </div>
      <label className="block text-sm font-medium text-slate-700">
        Transaction reference <span className="font-normal text-slate-400">(optional)</span>
        <input className={fieldClassName} maxLength={120} name="transactionReference" placeholder="UPI reference, cheque number, or bank reference" />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Notes <span className="font-normal text-slate-400">(optional)</span>
        <textarea className={fieldClassName} maxLength={1000} name="notes" rows={3} />
      </label>
      {state.message ? <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800" role="status">{state.message}</p> : null}
      <button className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Recording payment…" : "Record payment and issue receipt"}
      </button>
    </form>
  );
}
