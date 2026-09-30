import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import { formatDate, formatMoney, paymentMethodLabels, type ManualPaymentMethod } from "../../payment-types";
import { PrintReceiptButton, VoidPaymentForm } from "./receipt-controls";

interface PaymentRow {
  id: string; branch_id: string; member_id: string; membership_id: string; receipt_code: string;
  amount_minor: number; currency: string; payment_date: string; payment_method: ManualPaymentMethod;
  transaction_reference: string | null; notes: string | null; status: "recorded" | "voided";
  void_reason: string | null; created_at: string;
}

export default async function ReceiptPage({ params, searchParams }: {
  params: Promise<{ organizationSlug: string; paymentId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ organizationSlug, paymentId }, query] = await Promise.all([params, searchParams]);
  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  if (!membership.canManagePayments) redirect(`/gym/${organizationSlug}`);

  const paymentResult = await supabase
    .from("manual_payments")
    .select("id, branch_id, member_id, membership_id, receipt_code, amount_minor, currency, payment_date, payment_method, transaction_reference, notes, status, void_reason, created_at")
    .eq("organization_id", membership.organization.id)
    .eq("id", paymentId)
    .maybeSingle();
  if (paymentResult.error) throw new Error("Receipt could not be loaded.");
  if (!paymentResult.data) notFound();
  const payment = paymentResult.data as PaymentRow;

  const [memberResult, membershipResult] = await Promise.all([
    supabase.from("members").select("member_code, full_name, phone, email").eq("organization_id", membership.organization.id).eq("id", payment.member_id).maybeSingle(),
    supabase.from("member_membership_statuses").select("enrollment_code, plan_name, tax_inclusive").eq("organization_id", membership.organization.id).eq("id", payment.membership_id).maybeSingle(),
  ]);
  if (!memberResult.data || !membershipResult.data) notFound();
  const member = memberResult.data as { member_code: string; full_name: string; phone: string; email: string | null };
  const enrollment = membershipResult.data as { enrollment_code: string; plan_name: string; tax_inclusive: boolean };
  const branchName = membership.branches.find((branch) => branch.id === payment.branch_id)?.name ?? "Gym branch";
  const justCreated = typeof query.created === "string";
  const justVoided = query.voided === "1";

  return (
    <main className="px-5 py-8 print:bg-white print:p-0 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 print:hidden">
          <Link className="text-sm font-semibold text-emerald-700 hover:text-emerald-900" href={`/gym/${organizationSlug}/payments`}>← Payments</Link>
          <PrintReceiptButton />
        </div>
        {justCreated ? <p className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 print:hidden" role="status">Payment recorded and receipt issued successfully.</p> : null}
        {justVoided ? <p className="mb-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 print:hidden" role="status">The payment was voided. Its audit record has been preserved.</p> : null}

        <article className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none sm:p-10">
          <header className="flex items-start justify-between gap-6 border-b border-slate-200 pb-7">
            <div>
              <p className="text-2xl font-bold tracking-tight">{membership.organization.name}</p>
              <p className="mt-1 text-sm text-slate-500">{branchName}</p>
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Payment receipt</p>
              <p className="mt-2 font-mono text-sm font-semibold">{payment.receipt_code}</p>
              {payment.status === "voided" ? <p className="mt-2 inline-flex rounded-full bg-rose-100 px-3 py-1 text-xs font-bold uppercase text-rose-700">Voided</p> : null}
            </div>
          </header>

          <section className="grid gap-6 border-b border-slate-200 py-7 sm:grid-cols-2">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Received from</p><p className="mt-2 font-semibold">{member.full_name}</p><p className="mt-1 text-sm text-slate-500">{member.member_code} · {member.phone}{member.email ? ` · ${member.email}` : ""}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">For membership</p><p className="mt-2 font-semibold">{enrollment.plan_name}</p><p className="mt-1 text-sm text-slate-500">{enrollment.enrollment_code}</p></div>
          </section>

          <section className="grid gap-5 py-7 sm:grid-cols-3">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Amount</p><p className="mt-2 text-2xl font-bold">{formatMoney(payment.amount_minor, payment.currency)}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Payment date</p><p className="mt-2 font-semibold">{formatDate(payment.payment_date)}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Method</p><p className="mt-2 font-semibold">{paymentMethodLabels[payment.payment_method]}</p></div>
          </section>

          {payment.transaction_reference || payment.notes ? <section className="rounded-2xl bg-slate-50 p-5 text-sm"><p><span className="font-semibold">Reference:</span> {payment.transaction_reference ?? "—"}</p>{payment.notes ? <p className="mt-2"><span className="font-semibold">Notes:</span> {payment.notes}</p> : null}</section> : null}
          <p className="mt-7 text-xs leading-5 text-slate-400">System-generated receipt. Membership pricing is recorded as tax {enrollment.tax_inclusive ? "inclusive" : "exclusive"}. Configure tax invoicing separately before using this document as a statutory tax invoice.</p>
          {payment.status === "voided" ? <p className="mt-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-800"><span className="font-semibold">Void reason:</span> {payment.void_reason}</p> : null}
        </article>

        {payment.status === "recorded" && membership.canVoidPayments ? (
          <section className="mt-6 rounded-3xl border border-rose-200 bg-white p-6 print:hidden">
            <h2 className="font-semibold">Correct a payment mistake</h2>
            <p className="mt-1 mb-5 text-sm text-slate-500">Receipts cannot be edited or deleted. Void this payment and record a replacement.</p>
            <VoidPaymentForm organizationSlug={organizationSlug} paymentId={payment.id} />
          </section>
        ) : null}
      </div>
    </main>
  );
}
