"use client";

import { useActionState } from "react";
import { convertLead } from "./actions";

const fieldClassName =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";

export function ConvertLeadForm({
  organizationSlug,
  leadId,
}: {
  organizationSlug: string;
  leadId: string;
}) {
  const convert = convertLead.bind(null, organizationSlug, leadId);
  const [state, action, pending] = useActionState(convert, {
    status: "idle" as const,
    message: "",
  });

  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Date of birth <span className="font-normal text-slate-400">(optional)</span>
          <input className={fieldClassName} name="dateOfBirth" type="date" />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Gender <span className="font-normal text-slate-400">(optional)</span>
          <select className={fieldClassName} defaultValue="" name="gender">
            <option value="">Not specified</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="non_binary">Non-binary</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </label>
      </div>
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
        {pending ? "Converting lead…" : "Create member and mark won"}
      </button>
    </form>
  );
}
