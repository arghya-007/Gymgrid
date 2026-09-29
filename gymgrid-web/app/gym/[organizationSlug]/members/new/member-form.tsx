"use client";

import { useActionState } from "react";
import type { TenantBranch } from "@/lib/tenant";
import { createMember } from "./actions";

const fieldClassName =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";

export function MemberForm({
  organizationSlug,
  branches,
}: {
  organizationSlug: string;
  branches: TenantBranch[];
}) {
  const createMemberForOrganization = createMember.bind(null, organizationSlug);
  const [state, action, pending] = useActionState(createMemberForOrganization, {
    status: "idle" as const,
    message: "",
  });

  return (
    <form action={action} className="space-y-8">
      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="col-span-full mb-1 text-lg font-semibold">
          Basic details
        </legend>
        <label className="block text-sm font-medium text-slate-700">
          Full name
          <input
            autoComplete="name"
            className={fieldClassName}
            maxLength={120}
            minLength={2}
            name="fullName"
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Preferred name <span className="font-normal text-slate-400">(optional)</span>
          <input
            className={fieldClassName}
            maxLength={80}
            name="preferredName"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Mobile number
          <input
            autoComplete="tel"
            className={fieldClassName}
            inputMode="tel"
            name="phone"
            placeholder="98765 43210"
            required
          />
          <span className="mt-2 block text-xs font-normal text-slate-400">
            Indian 10-digit numbers are stored with the +91 country code.
          </span>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Email <span className="font-normal text-slate-400">(optional)</span>
          <input
            autoComplete="email"
            className={fieldClassName}
            name="email"
            type="email"
          />
        </label>
      </fieldset>

      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="col-span-full mb-1 text-lg font-semibold">
          Gym profile
        </legend>
        <label className="block text-sm font-medium text-slate-700">
          Home branch
          <select
            className={fieldClassName}
            defaultValue={branches.length === 1 ? branches[0].id : ""}
            name="homeBranchId"
            required
          >
            <option disabled value="">
              Select a branch
            </option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name} ({branch.code})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Date of birth <span className="font-normal text-slate-400">(optional)</span>
          <input className={fieldClassName} max="9999-12-31" name="dateOfBirth" type="date" />
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
        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
          Notes <span className="font-normal text-slate-400">(optional)</span>
          <textarea
            className={fieldClassName}
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
        {pending ? "Creating member…" : "Create member"}
      </button>
    </form>
  );
}
