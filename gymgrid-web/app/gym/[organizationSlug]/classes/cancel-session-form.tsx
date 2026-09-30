"use client";

import { useActionState } from "react";
import { cancelClassSession } from "./actions";

export function CancelSessionForm({ organizationSlug, sessionId }: { organizationSlug: string; sessionId: string }) {
  const cancel = cancelClassSession.bind(null, organizationSlug, sessionId);
  const [state, action, pending] = useActionState(cancel, { status: "idle" as const, message: "" });
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="text-xs font-medium text-slate-600">Cancellation reason<input className="mt-1 w-52 rounded-lg border border-slate-300 px-3 py-2 text-xs" maxLength={500} minLength={2} name="reason" placeholder="Trainer unavailable" required /></label>
      <button className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60" disabled={pending} type="submit">{pending ? "Cancelling…" : "Cancel class"}</button>
      {state.message ? <p className="basis-full text-xs text-rose-700" role="status">{state.message}</p> : null}
    </form>
  );
}
