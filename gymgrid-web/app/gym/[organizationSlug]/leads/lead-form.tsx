"use client";

import { useActionState } from "react";
import type { TenantBranch } from "@/lib/tenant";
import { saveLead } from "./actions";
import type { LeadFormValues, LeadPlanOption, LeadSource } from "./types";

const fieldClassName =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";

const sourceLabels: Record<LeadSource, string> = {
  walk_in: "Walk-in",
  referral: "Referral",
  website: "Website",
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  phone: "Phone call",
  other: "Other",
};

function localDateTimeValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function LeadForm({
  organizationSlug,
  branches,
  plans,
  initialLead,
}: {
  organizationSlug: string;
  branches: TenantBranch[];
  plans: LeadPlanOption[];
  initialLead?: LeadFormValues;
}) {
  const save = saveLead.bind(null, organizationSlug, initialLead?.id ?? null);
  const [state, action, pending] = useActionState(save, {
    status: "idle" as const,
    message: "",
  });
  const defaultBranchId = initialLead?.branchId ??
    (branches.length === 1 ? branches[0].id : "");

  return (
    <form action={action} className="space-y-8">
      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="col-span-full mb-1 text-lg font-semibold">Contact</legend>
        <label className="block text-sm font-medium text-slate-700">
          Full name
          <input
            className={fieldClassName}
            defaultValue={initialLead?.fullName}
            maxLength={120}
            minLength={2}
            name="fullName"
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Mobile number
          <input
            className={fieldClassName}
            defaultValue={initialLead?.phone}
            inputMode="tel"
            maxLength={24}
            name="phone"
            placeholder="9876543210"
            required
            type="tel"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
          Email <span className="font-normal text-slate-400">(optional)</span>
          <input
            className={fieldClassName}
            defaultValue={initialLead?.email}
            maxLength={254}
            name="email"
            type="email"
          />
        </label>
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="col-span-full mb-1 text-lg font-semibold">Opportunity</legend>
        <label className="block text-sm font-medium text-slate-700">
          Branch
          <select
            className={fieldClassName}
            defaultValue={defaultBranchId}
            name="branchId"
            required
          >
            {branches.length > 1 ? <option value="">Select a branch</option> : null}
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name} ({branch.code})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Source
          <select
            className={fieldClassName}
            defaultValue={initialLead?.source ?? "walk_in"}
            name="source"
          >
            {Object.entries(sourceLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Interested plan <span className="font-normal text-slate-400">(optional)</span>
          <select
            className={fieldClassName}
            defaultValue={initialLead?.interestedPlanId ?? ""}
            name="interestedPlanId"
          >
            <option value="">Not decided</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} ({plan.code})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Follow-up at <span className="font-normal text-slate-400">(optional)</span>
          <input
            className={fieldClassName}
            defaultValue={localDateTimeValue(initialLead?.followUpAt)}
            name="followUpAt"
            type="datetime-local"
          />
        </label>
        {initialLead ? (
          <label className="block text-sm font-medium text-slate-700">
            Status
            <select
              className={fieldClassName}
              defaultValue={initialLead.status}
              name="status"
            >
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="trial_scheduled">Trial scheduled</option>
              <option value="lost">Lost</option>
            </select>
          </label>
        ) : null}
        {initialLead ? (
          <label className="block text-sm font-medium text-slate-700">
            Lost reason <span className="font-normal text-slate-400">(required only when lost)</span>
            <input
              className={fieldClassName}
              defaultValue={initialLead.lostReason}
              maxLength={500}
              name="lostReason"
            />
          </label>
        ) : null}
        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
          Notes <span className="font-normal text-slate-400">(optional)</span>
          <textarea
            className={fieldClassName}
            defaultValue={initialLead?.notes}
            maxLength={2000}
            name="notes"
            rows={4}
          />
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
        {pending ? "Saving lead…" : initialLead ? "Save lead changes" : "Create lead"}
      </button>
    </form>
  );
}
