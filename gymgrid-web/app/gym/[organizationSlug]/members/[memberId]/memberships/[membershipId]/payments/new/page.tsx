import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import { formatMoney } from "@/app/gym/[organizationSlug]/payments/payment-types";
import { PaymentForm } from "./payment-form";

export default async function NewPaymentPage({ params }: {
  params: Promise<{ organizationSlug: string; memberId: string; membershipId: string }>;
}) {
  const { organizationSlug, memberId, membershipId } = await params;
  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  const memberPath = `/gym/${organizationSlug}/members/${memberId}`;
  if (!membership.canManagePayments) redirect(memberPath);

  const [memberResult, balanceResult, dateResult] = await Promise.all([
    supabase.from("members").select("id, member_code, full_name").eq("organization_id", membership.organization.id).eq("id", memberId).maybeSingle(),
    supabase.from("membership_payment_balances").select("membership_id, member_id, enrollment_code, plan_name, contract_amount_minor, paid_amount_minor, outstanding_amount_minor, currency").eq("organization_id", membership.organization.id).eq("member_id", memberId).eq("membership_id", membershipId).maybeSingle(),
    supabase.rpc("organization_local_date", { p_organization_id: membership.organization.id }),
  ]);
  if (memberResult.error || balanceResult.error || dateResult.error) throw new Error("Payment details could not be loaded.");
  if (!memberResult.data || !balanceResult.data) notFound();
  const member = memberResult.data as { id: string; member_code: string; full_name: string };
  const balance = balanceResult.data as {
    membership_id: string; enrollment_code: string; plan_name: string; contract_amount_minor: number;
    paid_amount_minor: number; outstanding_amount_minor: number; currency: string;
  };
  if (balance.outstanding_amount_minor <= 0) redirect(memberPath);

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-3xl">
        <Link className="text-sm font-semibold text-emerald-700 hover:text-emerald-900" href={memberPath}>← {member.full_name}</Link>
        <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">{member.member_code} · {balance.enrollment_code}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Record payment</h1>
          <p className="mt-3 text-sm text-slate-600">{balance.plan_name}</p>
          <dl className="mt-7 grid gap-4 rounded-2xl bg-slate-50 p-5 sm:grid-cols-3">
            <div><dt className="text-xs font-semibold uppercase text-slate-400">Contract</dt><dd className="mt-1 font-semibold">{formatMoney(balance.contract_amount_minor, balance.currency)}</dd></div>
            <div><dt className="text-xs font-semibold uppercase text-slate-400">Paid</dt><dd className="mt-1 font-semibold">{formatMoney(balance.paid_amount_minor, balance.currency)}</dd></div>
            <div><dt className="text-xs font-semibold uppercase text-slate-400">Outstanding</dt><dd className="mt-1 font-semibold text-amber-700">{formatMoney(balance.outstanding_amount_minor, balance.currency)}</dd></div>
          </dl>
          <div className="mt-9"><PaymentForm currency={balance.currency} localDate={String(dateResult.data)} memberId={member.id} membershipId={balance.membership_id} organizationSlug={organizationSlug} outstandingAmountMinor={balance.outstanding_amount_minor} /></div>
        </div>
      </div>
    </main>
  );
}
