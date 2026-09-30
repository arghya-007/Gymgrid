"use client";

import { useActionState } from "react";
import { cancelMemberClassBooking } from "./actions";

export function CancelClassBookingForm({
  organizationSlug,
  classSessionId,
  classBookingId,
}: {
  organizationSlug: string;
  classSessionId: string;
  classBookingId: string;
}) {
  const cancelAction = cancelMemberClassBooking.bind(
    null,
    organizationSlug,
    classSessionId,
    classBookingId,
  );
  const [state, action, pending] = useActionState(cancelAction, {
    status: "idle" as const,
    message: "",
  });

  return (
    <form action={action} className="flex flex-wrap items-center justify-end gap-2">
      <label className="sr-only" htmlFor={`cancel-booking-${classBookingId}`}>Cancellation reason</label>
      <input
        className="w-44 rounded-lg border border-slate-300 px-3 py-2 text-xs outline-none focus:border-rose-500"
        id={`cancel-booking-${classBookingId}`}
        maxLength={500}
        minLength={2}
        name="reason"
        placeholder="Cancellation reason"
        required
      />
      <button
        className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Cancelling…" : "Cancel"}
      </button>
      {state.message ? <p className="basis-full text-right text-xs text-rose-700" role="status">{state.message}</p> : null}
    </form>
  );
}
