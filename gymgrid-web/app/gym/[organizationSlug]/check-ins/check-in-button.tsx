"use client";

import { useActionState } from "react";
import { recordMemberCheckIn } from "./actions";

export function CheckInButton({
  organizationSlug,
  branchId,
  memberId,
}: {
  organizationSlug: string;
  branchId: string;
  memberId: string;
}) {
  const save = recordMemberCheckIn.bind(null, organizationSlug);
  const [state, action, pending] = useActionState(save, {
    status: "idle" as const,
    message: "",
  });

  return (
    <form action={action} className="text-right">
      <input name="branchId" type="hidden" value={branchId} />
      <input name="memberId" type="hidden" value={memberId} />
      <button
        className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Checking in…" : "Check in"}
      </button>
      {state.message ? <p className="mt-2 max-w-xs text-xs text-rose-700" role="status">{state.message}</p> : null}
    </form>
  );
}
