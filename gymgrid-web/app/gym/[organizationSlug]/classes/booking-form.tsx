"use client";

import { useActionState } from "react";
import { bookClassMember } from "./actions";

export interface BookableMemberOption {
  id: string;
  memberCode: string;
  fullName: string;
}

export function ClassBookingForm({
  organizationSlug,
  classSessionId,
  members,
}: {
  organizationSlug: string;
  classSessionId: string;
  members: BookableMemberOption[];
}) {
  const bookingAction = bookClassMember.bind(null, organizationSlug, classSessionId);
  const [state, action, pending] = useActionState(bookingAction, {
    status: "idle" as const,
    message: "",
  });

  return (
    <form action={action} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="flex-1 text-sm font-medium text-slate-700">
        Active branch member
        <select
          className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
          defaultValue=""
          name="memberId"
          required
        >
          <option disabled value="">Select a member</option>
          {members.map((member) => (
            <option key={member.id} value={member.id}>
              {member.fullName} · {member.memberCode}
            </option>
          ))}
        </select>
      </label>
      <button
        className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        disabled={pending || members.length === 0}
        type="submit"
      >
        {pending ? "Adding…" : "Add booking"}
      </button>
      {state.message ? <p className="text-sm text-rose-700" role="status">{state.message}</p> : null}
    </form>
  );
}
