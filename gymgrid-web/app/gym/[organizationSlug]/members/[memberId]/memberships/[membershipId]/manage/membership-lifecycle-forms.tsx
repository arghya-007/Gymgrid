"use client";

import { useActionState } from "react";
import {
  cancelMembership,
  freezeMembership,
  resumeMembership,
} from "./actions";

const fieldClassName =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";
const initialState = { status: "idle" as const, message: "" };

function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800" role="status">{message}</p>
  ) : null;
}

export function FreezeMembershipForm(props: {
  organizationSlug: string;
  memberId: string;
  membershipId: string;
}) {
  const [state, action, pending] = useActionState(
    freezeMembership.bind(null, props.organizationSlug, props.memberId, props.membershipId),
    initialState,
  );
  return (
    <form action={action}>
      <label className="block text-sm font-medium text-slate-700">
        Freeze reason <span className="font-normal text-slate-400">(optional)</span>
        <textarea className={fieldClassName} maxLength={500} name="reason" rows={3} />
      </label>
      <ErrorMessage message={state.message} />
      <button className="mt-5 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Freezing…" : "Freeze from today"}
      </button>
    </form>
  );
}

export function ResumeMembershipForm(props: {
  organizationSlug: string;
  memberId: string;
  membershipId: string;
}) {
  const [state, action, pending] = useActionState(
    resumeMembership.bind(null, props.organizationSlug, props.memberId, props.membershipId),
    initialState,
  );
  return (
    <form action={action}>
      <p className="text-sm leading-6 text-slate-600">The membership end date will be extended by the number of frozen days.</p>
      <ErrorMessage message={state.message} />
      <button className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Resuming…" : "Resume today"}
      </button>
    </form>
  );
}

export function CancelMembershipForm(props: {
  organizationSlug: string;
  memberId: string;
  membershipId: string;
}) {
  const [state, action, pending] = useActionState(
    cancelMembership.bind(null, props.organizationSlug, props.memberId, props.membershipId),
    initialState,
  );
  return (
    <form action={action}>
      <label className="block text-sm font-medium text-slate-700">
        Cancellation reason
        <textarea className={fieldClassName} maxLength={500} minLength={2} name="reason" required rows={3} />
      </label>
      <ErrorMessage message={state.message} />
      <button className="mt-5 rounded-xl border border-rose-300 bg-white px-5 py-3 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60" disabled={pending} type="submit">
        {pending ? "Cancelling…" : "Cancel membership"}
      </button>
    </form>
  );
}
