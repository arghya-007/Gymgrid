"use client";

import { useActionState } from "react";
import { voidPayment } from "./actions";

export function PrintReceiptButton() {
  return <button className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white print:hidden" onClick={() => window.print()} type="button">Print receipt</button>;
}

export function VoidPaymentForm({ organizationSlug, paymentId }: { organizationSlug: string; paymentId: string }) {
  const [state, action, pending] = useActionState(voidPayment.bind(null, organizationSlug, paymentId), { status: "idle" as const, message: "" });
  return (
    <form action={action} className="print:hidden">
      <label className="block text-sm font-medium text-slate-700">Void reason<textarea className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-rose-500" maxLength={500} minLength={2} name="reason" required rows={3} /></label>
      {state.message ? <p className="mt-3 text-sm text-rose-700" role="status">{state.message}</p> : null}
      <button className="mt-4 rounded-xl border border-rose-300 px-5 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60" disabled={pending} type="submit">{pending ? "Voiding…" : "Void payment"}</button>
    </form>
  );
}
