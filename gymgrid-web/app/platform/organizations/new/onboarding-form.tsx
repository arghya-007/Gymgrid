"use client";

import { useActionState } from "react";
import { createTenant } from "./actions";

const fieldClassName =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";

export function OnboardingForm({ today }: { today: string }) {
  const [state, action, pending] = useActionState(createTenant, {
    status: "idle" as const,
    message: "",
  });

  return (
    <form action={action} className="space-y-8">
      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="col-span-full mb-1 text-lg font-semibold">Organization</legend>
        <label className="block text-sm font-medium text-slate-700">
          Trading name
          <input className={fieldClassName} name="organizationName" minLength={2} required />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          URL slug
          <input className={fieldClassName} name="organizationSlug" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="iron-house-fitness" required />
        </label>
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="col-span-full mb-1 text-lg font-semibold">First branch</legend>
        <label className="block text-sm font-medium text-slate-700">
          Branch name
          <input className={fieldClassName} name="branchName" defaultValue="Main Branch" minLength={2} required />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Branch code
          <input className={fieldClassName} name="branchCode" defaultValue="MAIN" maxLength={20} pattern="[A-Za-z0-9][A-Za-z0-9_-]*" required />
        </label>
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="col-span-full mb-1 text-lg font-semibold">Owner and subscription</legend>
        <label className="block text-sm font-medium text-slate-700">
          Owner email
          <input className={fieldClassName} name="ownerEmail" type="email" required />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Plan
          <select className={fieldClassName} defaultValue="launch" name="planCode" required>
            <option value="launch">Launch — 100 active members</option>
            <option value="growth">Growth — 300 active members</option>
            <option value="scale">Scale — 700 active members</option>
            <option value="enterprise">Enterprise — custom</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Subscription starts
          <input className={fieldClassName} defaultValue={today} name="subscriptionStart" type="date" required />
        </label>
      </fieldset>

      <p className="text-sm leading-6 text-slate-500">
        If the owner already has an Auth account, access is linked immediately. Otherwise a pending invitation is recorded for the future email workflow.
      </p>

      {state.message ? (
        <p
          className={`rounded-xl p-4 text-sm ${state.status === "success" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}
          role="status"
        >
          {state.message}
        </p>
      ) : null}

      <button
        className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Creating secure tenant…" : "Create organization"}
      </button>
    </form>
  );
}
