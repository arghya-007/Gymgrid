"use client";

import { useActionState } from "react";
import { rotateMemberQrPass } from "./actions";

export function RotateQrPassForm({
  organizationSlug,
  memberId,
  hasPass,
}: {
  organizationSlug: string;
  memberId: string;
  hasPass: boolean;
}) {
  const rotateAction = rotateMemberQrPass.bind(null, organizationSlug, memberId);
  const [state, action, pending] = useActionState(rotateAction, {
    status: "idle" as const,
    message: "",
  });
  return (
    <form action={action}>
      <button
        className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Generating…" : hasPass ? "Replace QR pass" : "Generate QR pass"}
      </button>
      {state.message ? <p className="mt-3 text-sm text-rose-700" role="status">{state.message}</p> : null}
    </form>
  );
}
