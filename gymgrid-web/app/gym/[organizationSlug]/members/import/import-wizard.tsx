"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { TenantBranch } from "@/lib/tenant";
import { processMemberImport, type MemberImportState } from "./actions";

const fieldClassName =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";
const initialState: MemberImportState = {
  stage: "upload",
  message: "",
  branchId: "",
  fileName: "",
  rows: [],
};

export function ImportWizard({
  organizationSlug,
  branches,
}: {
  organizationSlug: string;
  branches: TenantBranch[];
}) {
  const runImport = processMemberImport.bind(null, organizationSlug);
  const [state, action, pending] = useActionState(runImport, initialState);
  const selectedBranch = branches.find((branch) => branch.id === state.branchId);

  if (state.stage === "preview") {
    const visibleRows = state.rows.slice(0, 25);
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <p className="font-semibold text-emerald-950">Ready to import {state.rows.length} member{state.rows.length === 1 ? "" : "s"}</p>
          <p className="mt-1 text-sm text-emerald-800">{state.fileName} · {selectedBranch?.name ?? "Selected branch"}</p>
        </div>

        {state.message ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="status">{state.message}</p>
        ) : null}

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Phone</th>
                  <th className="px-4 py-3 font-semibold">Email</th>
                  <th className="px-4 py-3 font-semibold">DOB</th>
                  <th className="px-4 py-3 font-semibold">Gender</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {visibleRows.map((row, index) => (
                  <tr key={`${row.phone}-${index}`}>
                    <td className="px-4 py-3 font-medium text-slate-900">{row.full_name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{row.phone}</td>
                    <td className="px-4 py-3 text-slate-600">{row.email ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600">{row.date_of_birth ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{row.gender?.replaceAll("_", " ") ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {state.rows.length > visibleRows.length ? (
            <p className="border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">Showing the first {visibleRows.length} of {state.rows.length} validated rows.</p>
          ) : null}
        </div>

        <p className="text-sm leading-6 text-slate-600">Confirming creates every member in one transaction. If any phone or email now conflicts with an existing member, the whole batch is cancelled.</p>
        <div className="flex flex-wrap gap-3">
          <form action={action}>
            <input name="mode" type="hidden" value="confirm" />
            <button className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
              {pending ? "Importing members…" : `Import ${state.rows.length} members`}
            </button>
          </form>
          <Link className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:border-slate-400" href={`/gym/${organizationSlug}/members/import`}>Choose another file</Link>
        </div>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-7">
      <input name="mode" type="hidden" value="preview" />
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700">
          Home branch
          <select className={fieldClassName} defaultValue={branches.length === 1 ? branches[0].id : ""} name="branchId" required>
            <option disabled value="">Select a branch</option>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700">
          CSV file
          <input accept=".csv,text/csv" className={fieldClassName} name="file" required type="file" />
          <span className="mt-2 block text-xs font-normal text-slate-400">Maximum 500 members or 512 KB per batch.</span>
        </label>
      </div>

      {state.message ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800" role="status">{state.message}</p>
      ) : null}

      <button className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Validating file…" : "Preview import"}
      </button>
    </form>
  );
}
