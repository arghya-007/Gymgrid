"use client";

import { useActionState } from "react";
import type { TenantBranch } from "@/lib/tenant";
import { saveMembershipPlan } from "./actions";
import type { MembershipPlanFormValues } from "./types";

const fieldClassName =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";

function amountInputValue(amountMinor: number) {
  return (amountMinor / 100).toFixed(2);
}

export function MembershipPlanForm({
  organizationSlug,
  branches,
  allowOrganizationWide,
  initialPlan,
}: {
  organizationSlug: string;
  branches: TenantBranch[];
  allowOrganizationWide: boolean;
  initialPlan?: MembershipPlanFormValues;
}) {
  const savePlan = saveMembershipPlan.bind(
    null,
    organizationSlug,
    initialPlan?.id ?? null,
  );
  const [state, action, pending] = useActionState(savePlan, {
    status: "idle" as const,
    message: "",
  });
  const defaultBranchId =
    initialPlan?.branchId ??
    (allowOrganizationWide ? "" : branches.length === 1 ? branches[0].id : "");

  return (
    <form action={action} className="space-y-8">
      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="col-span-full mb-1 text-lg font-semibold">Plan details</legend>
        <label className="block text-sm font-medium text-slate-700">
          Plan name
          <input
            className={fieldClassName}
            defaultValue={initialPlan?.name}
            maxLength={120}
            minLength={2}
            name="name"
            placeholder="Annual Membership"
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Plan code
          <input
            className={`${fieldClassName} uppercase`}
            defaultValue={initialPlan?.code}
            maxLength={20}
            name="code"
            pattern="[A-Za-z0-9][A-Za-z0-9_-]*"
            placeholder="ANNUAL"
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
          Description <span className="font-normal text-slate-400">(optional)</span>
          <textarea
            className={fieldClassName}
            defaultValue={initialPlan?.description}
            maxLength={1000}
            name="description"
            rows={3}
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Available at
          <select
            className={fieldClassName}
            defaultValue={defaultBranchId}
            name="branchId"
            required={!allowOrganizationWide}
          >
            {allowOrganizationWide ? <option value="">All branches</option> : null}
            {!allowOrganizationWide && branches.length > 1 ? (
              <option disabled value="">Select a branch</option>
            ) : null}
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name} ({branch.code})
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-[1fr_1.3fr] gap-3">
          <label className="block text-sm font-medium text-slate-700">
            Duration
            <input
              className={fieldClassName}
              defaultValue={initialPlan?.durationValue ?? 1}
              max={3650}
              min={1}
              name="durationValue"
              required
              type="number"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Unit
            <select
              className={fieldClassName}
              defaultValue={initialPlan?.durationUnit ?? "month"}
              name="durationUnit"
              required
            >
              <option value="day">Day(s)</option>
              <option value="week">Week(s)</option>
              <option value="month">Month(s)</option>
              <option value="year">Year(s)</option>
            </select>
          </label>
        </div>
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="col-span-full mb-1 text-lg font-semibold">Pricing</legend>
        <label className="block text-sm font-medium text-slate-700">
          Membership price (₹)
          <input
            className={fieldClassName}
            defaultValue={
              initialPlan ? amountInputValue(initialPlan.priceAmountMinor) : ""
            }
            inputMode="decimal"
            min="0"
            name="price"
            placeholder="9999.00"
            required
            step="0.01"
            type="number"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Joining fee (₹)
          <input
            className={fieldClassName}
            defaultValue={
              initialPlan
                ? amountInputValue(initialPlan.joiningFeeAmountMinor)
                : "0.00"
            }
            inputMode="decimal"
            min="0"
            name="joiningFee"
            required
            step="0.01"
            type="number"
          />
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
          <input
            className="mt-0.5 h-4 w-4 accent-emerald-600"
            defaultChecked={initialPlan?.taxInclusive ?? true}
            name="taxInclusive"
            type="checkbox"
          />
          <span>
            <span className="block font-semibold">Price includes applicable tax</span>
            <span className="mt-1 block text-xs text-slate-500">
              Display the entered amount as the member-facing total.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm text-slate-700">
          <input
            className="mt-0.5 h-4 w-4 accent-emerald-600"
            defaultChecked={initialPlan?.active ?? true}
            name="active"
            type="checkbox"
          />
          <span>
            <span className="block font-semibold">Plan is active</span>
            <span className="mt-1 block text-xs text-slate-500">
              Inactive plans remain in history but cannot be offered for new enrolments.
            </span>
          </span>
        </label>
      </fieldset>

      {state.message ? (
        <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800" role="status">
          {state.message}
        </p>
      ) : null}

      <button
        className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending
          ? "Saving plan…"
          : initialPlan
            ? "Save plan changes"
            : "Create membership plan"}
      </button>
    </form>
  );
}
