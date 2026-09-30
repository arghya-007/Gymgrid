import Link from "next/link";
import { redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import {
  formatDate,
  formatMoney,
  paymentMethodLabels,
  type ManualPaymentMethod,
} from "./payment-types";

interface PaymentRow {
  id: string;
  member_id: string;
  receipt_code: string;
  amount_minor: number;
  currency: string;
  payment_date: string;
  payment_method: ManualPaymentMethod;
  status: "recorded" | "voided";
}

export default async function PaymentsPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params;
  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  if (!membership.canManagePayments) redirect(`/gym/${organizationSlug}`);

  const paymentsResult = await supabase
    .from("manual_payments")
    .select("id, member_id, receipt_code, amount_minor, currency, payment_date, payment_method, status")
    .eq("organization_id", membership.organization.id)
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);
  const payments = (paymentsResult.data ?? []) as PaymentRow[];
  const memberIds = [...new Set(payments.map((payment) => payment.member_id))];
  const membersResult = memberIds.length
    ? await supabase
        .from("members")
        .select("id, member_code, full_name")
        .eq("organization_id", membership.organization.id)
        .in("id", memberIds)
    : { data: [], error: null };
  const members = new Map(
    (membersResult.data ?? []).map((member) => [
      member.id as string,
      { code: member.member_code as string, name: member.full_name as string },
    ]),
  );
  const recordedTotal = payments
    .filter((payment) => payment.status === "recorded")
    .reduce((total, payment) => total + payment.amount_minor, 0);
  const currency = payments[0]?.currency ?? membership.organization.currency;

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Collections</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Payments and receipts</h1>
        <p className="mt-2 text-sm text-slate-500">The 100 newest manual collections in your authorized branch scope.</p>

        <section className="mt-7 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Recorded total</p>
            <p className="mt-2 text-2xl font-semibold">{formatMoney(recordedTotal, currency)}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Receipts</p>
            <p className="mt-2 text-2xl font-semibold">{payments.filter((payment) => payment.status === "recorded").length}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Voided</p>
            <p className="mt-2 text-2xl font-semibold">{payments.filter((payment) => payment.status === "voided").length}</p>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {paymentsResult.error || membersResult.error ? (
            <p className="p-6 text-sm text-rose-700">Payments could not be loaded. Confirm the latest migration is applied.</p>
          ) : payments.length === 0 ? (
            <div className="p-10 text-center">
              <h2 className="font-semibold">No payments recorded yet</h2>
              <p className="mt-2 text-sm text-slate-500">Open a member’s membership history to record the first collection.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {payments.map((payment) => {
                const member = members.get(payment.member_id);
                return (
                  <article className="grid gap-3 p-5 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center" key={payment.id}>
                    <div>
                      <p className="font-semibold">{member?.name ?? "Member"}</p>
                      <p className="mt-1 text-xs text-slate-400">{member?.code} · {payment.receipt_code}</p>
                    </div>
                    <div className="text-sm text-slate-600">
                      <p>{formatDate(payment.payment_date)}</p>
                      <p className="mt-1 text-xs">{paymentMethodLabels[payment.payment_method]}</p>
                    </div>
                    <div className="text-sm font-semibold">{formatMoney(payment.amount_minor, payment.currency)}</div>
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${payment.status === "recorded" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>{payment.status}</span>
                      <Link className="text-sm font-semibold text-emerald-700 hover:text-emerald-900" href={`/gym/${organizationSlug}/payments/${payment.id}/receipt`}>Receipt</Link>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
