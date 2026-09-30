"use client";

import { useActionState } from "react";
import type { TenantBranch } from "@/lib/tenant";
import { saveClassProgram } from "./actions";

const fieldClassName = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";

export function ClassProgramForm({ organizationSlug, branches }: { organizationSlug: string; branches: TenantBranch[] }) {
  const save = saveClassProgram.bind(null, organizationSlug);
  const [state, action, pending] = useActionState(save, { status: "idle" as const, message: "" });
  return (
    <form action={action} className="space-y-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Class name<input className={fieldClassName} maxLength={120} minLength={2} name="name" placeholder="Morning Yoga" required /></label>
        <label className="text-sm font-medium text-slate-700">Class code<input className={`${fieldClassName} uppercase`} maxLength={20} name="code" pattern="[A-Za-z0-9][A-Za-z0-9_-]*" placeholder="YOGA" required /></label>
        <label className="text-sm font-medium text-slate-700">Branch<select className={fieldClassName} defaultValue={branches.length === 1 ? branches[0].id : ""} name="branchId" required><option disabled value="">Select a branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-slate-700">Duration (min)<input className={fieldClassName} defaultValue={60} max={240} min={15} name="durationMinutes" required type="number" /></label>
          <label className="text-sm font-medium text-slate-700">Capacity<input className={fieldClassName} defaultValue={20} max={500} min={1} name="capacity" required type="number" /></label>
        </div>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">Description <span className="font-normal text-slate-400">(optional)</span><textarea className={fieldClassName} maxLength={1000} name="description" rows={4} /></label>
      </div>
      {state.message ? <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800" role="status">{state.message}</p> : null}
      <button className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60" disabled={pending} type="submit">{pending ? "Saving class type…" : "Create class type"}</button>
    </form>
  );
}
