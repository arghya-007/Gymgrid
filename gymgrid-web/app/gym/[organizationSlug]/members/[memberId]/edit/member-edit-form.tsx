"use client";

import { useActionState } from "react";
import { updateMemberProfile } from "./actions";

const fieldClassName =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";

export interface EditableMember {
  fullName: string;
  preferredName: string | null;
  email: string | null;
  phone: string;
  dateOfBirth: string | null;
  gender: "female" | "male" | "non_binary" | "prefer_not_to_say" | null;
  notes: string | null;
  consentAt: string | null;
}

export function MemberEditForm({
  organizationSlug,
  memberId,
  member,
}: {
  organizationSlug: string;
  memberId: string;
  member: EditableMember;
}) {
  const updateForMember = updateMemberProfile.bind(
    null,
    organizationSlug,
    memberId,
  );
  const [state, action, pending] = useActionState(updateForMember, {
    status: "idle" as const,
    message: "",
  });

  return (
    <form action={action} className="space-y-8">
      <fieldset className="grid gap-5 sm:grid-cols-2">
        <legend className="col-span-full mb-1 text-lg font-semibold">
          Member details
        </legend>
        <label className="block text-sm font-medium text-slate-700">
          Full name
          <input
            autoComplete="name"
            className={fieldClassName}
            defaultValue={member.fullName}
            maxLength={120}
            minLength={2}
            name="fullName"
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Preferred name <span className="font-normal text-slate-400">(optional)</span>
          <input
            className={fieldClassName}
            defaultValue={member.preferredName ?? ""}
            maxLength={80}
            name="preferredName"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Mobile number
          <input
            autoComplete="tel"
            className={fieldClassName}
            defaultValue={member.phone}
            inputMode="tel"
            name="phone"
            required
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Email <span className="font-normal text-slate-400">(optional)</span>
          <input
            autoComplete="email"
            className={fieldClassName}
            defaultValue={member.email ?? ""}
            name="email"
            type="email"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Date of birth <span className="font-normal text-slate-400">(optional)</span>
          <input
            className={fieldClassName}
            defaultValue={member.dateOfBirth ?? ""}
            max="9999-12-31"
            name="dateOfBirth"
            type="date"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Gender <span className="font-normal text-slate-400">(optional)</span>
          <select
            className={fieldClassName}
            defaultValue={member.gender ?? ""}
            name="gender"
          >
            <option value="">Not specified</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="non_binary">Non-binary</option>
            <option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
          Notes <span className="font-normal text-slate-400">(optional)</span>
          <textarea
            className={fieldClassName}
            defaultValue={member.notes ?? ""}
            maxLength={2000}
            name="notes"
            rows={4}
          />
        </label>
      </fieldset>

      {!member.consentAt ? (
        <label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <input
            className="mt-1 h-4 w-4 accent-emerald-700"
            name="consentConfirmed"
            required
            type="checkbox"
          />
          <span>
            I confirm that the member has agreed to the gym storing these details for membership, attendance, billing, and service reminders.
          </span>
        </label>
      ) : (
        <p className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
          Member data consent was recorded on {new Intl.DateTimeFormat("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          }).format(new Date(member.consentAt))}.
        </p>
      )}

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
        {pending ? "Saving changes…" : "Save member profile"}
      </button>
    </form>
  );
}
