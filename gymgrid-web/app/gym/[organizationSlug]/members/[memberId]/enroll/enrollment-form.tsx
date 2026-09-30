"use client";

import { useActionState } from "react";
import { enrollMember } from "./actions";

export interface EnrollmentPlanOption {
  id: string;
  code: string;
  name: string;
  durationValue: number;
  durationUnit: "day" | "week" | "month" | "year";
  priceAmountMinor: number;
  joiningFeeAmountMinor: number;
  currency: string;
}

const fieldClassName =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";

function formatMoney(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}

export function EnrollmentForm({
  organizationSlug,
  memberId,
  plans,
}: {
  organizationSlug: string;
  memberId: string;
  plans: EnrollmentPlanOption[];
}) {
  const enroll = enrollMember.bind(null, organizationSlug, memberId);
  const [state, action, pending] = useActionState(enroll, {
    status: "idle" as const,
    message: "",
  });

  return (
    <form action={action} className="space-y-7">
      <label className="block text-sm font-medium text-slate-700">
        Membership plan
        <select className={fieldClassName} defaultValue="" name="membershipPlanId" required>
          <option disabled value="">Select an active plan</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.name} ({plan.code}) · {plan.durationValue} {plan.durationUnit}{plan.durationValue === 1 ? "" : "s"} · {formatMoney(plan.priceAmountMinor + plan.joiningFeeAmountMinor, plan.currency)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Start date
        <input className={fieldClassName} max="9999-12-31" name="startDate" required type="date" />
        <span className="mt-2 block text-xs font-normal text-slate-400">
          The end date is calculated from the selected plan’s duration.
        </span>
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Enrolment notes <span className="font-normal text-slate-400">(optional)</span>
        <textarea className={fieldClassName} maxLength={2000} name="notes" rows={4} />
      </label>

      {state.message ? (
        <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800" role="status">
          {state.message}
        </p>
      ) : null}

      <button
        className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Creating membership…" : "Create membership"}
      </button>
    </form>
  );
}
