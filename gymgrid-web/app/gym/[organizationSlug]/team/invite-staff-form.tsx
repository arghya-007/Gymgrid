"use client";

import { useActionState } from "react";
import type { TenantBranch } from "@/lib/tenant";
import { inviteStaff } from "./actions";

const fieldClassName =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";

export function InviteStaffForm({
  organizationSlug,
  branches,
  canInviteManagers,
}: {
  organizationSlug: string;
  branches: TenantBranch[];
  canInviteManagers: boolean;
}) {
  const invite = inviteStaff.bind(null, organizationSlug);
  const [state, action, pending] = useActionState(invite, {
    status: "idle" as const,
    message: "",
  });

  return (
    <form action={action} className="space-y-5">
      <label className="block text-sm font-medium text-slate-700">
        Email address
        <input
          autoComplete="email"
          className={fieldClassName}
          maxLength={254}
          name="email"
          placeholder="staff@example.com"
          required
          type="email"
        />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Staff role
          <select className={fieldClassName} defaultValue="receptionist" name="role">
            {canInviteManagers ? (
              <option value="gym_manager">Gym manager</option>
            ) : null}
            <option value="receptionist">Receptionist</option>
            <option value="trainer">Trainer</option>
            <option value="accountant">Accountant</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Access scope
          <select className={fieldClassName} defaultValue="" name="branchId">
            <option value="">All branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name} ({branch.code})
              </option>
            ))}
          </select>
        </label>
      </div>

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
        {pending ? "Creating invitation…" : "Create invitation"}
      </button>
    </form>
  );
}
