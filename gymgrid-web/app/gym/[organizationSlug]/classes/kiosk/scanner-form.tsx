"use client";

import { useActionState } from "react";
import { recordClassQrCheckIn } from "./actions";

export interface KioskSessionOption {
  id: string;
  label: string;
}

export function KioskScannerForm({
  organizationSlug,
  sessions,
  selectedSessionId,
}: {
  organizationSlug: string;
  sessions: KioskSessionOption[];
  selectedSessionId: string;
}) {
  const checkInAction = recordClassQrCheckIn.bind(null, organizationSlug);
  const [state, action, pending] = useActionState(checkInAction, {
    status: "idle" as const,
    message: "",
  });
  return (
    <form action={action} className="space-y-5">
      <label className="block text-sm font-medium text-slate-700">
        Class session
        <select
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
          defaultValue={selectedSessionId}
          name="sessionId"
          required
        >
          <option disabled value="">Select a class</option>
          {sessions.map((session) => <option key={session.id} value={session.id}>{session.label}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Member QR pass
        <input
          autoComplete="off"
          autoFocus
          className="mt-2 w-full rounded-2xl border-2 border-slate-300 bg-white px-5 py-5 text-lg outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
          name="qrToken"
          placeholder="Scan or paste the GymGrid QR payload"
          required
        />
      </label>
      {state.message ? <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800" role="status">{state.message}</p> : null}
      <button
        className="w-full rounded-2xl bg-slate-950 px-6 py-4 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        disabled={pending || sessions.length === 0}
        type="submit"
      >
        {pending ? "Checking in…" : "Check in member"}
      </button>
    </form>
  );
}
