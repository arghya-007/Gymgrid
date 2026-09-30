"use client";

import { useActionState } from "react";
import { scheduleClassSession } from "./actions";
import type { ClassProgramOption, TrainerOption } from "./types";

const fieldClassName = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";

export function ClassSessionForm({ organizationSlug, programs, trainers }: { organizationSlug: string; programs: ClassProgramOption[]; trainers: TrainerOption[] }) {
  const schedule = scheduleClassSession.bind(null, organizationSlug);
  const [state, action, pending] = useActionState(schedule, { status: "idle" as const, message: "" });
  return (
    <form action={action} className="space-y-7">
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Class type<select className={fieldClassName} defaultValue={programs.length === 1 ? programs[0].id : ""} name="programId" required><option disabled value="">Select a class type</option>{programs.map((program) => <option key={program.id} value={program.id}>{program.name} ({program.code}) · {program.durationMinutes} min</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">Start time (gym local time)<input className={fieldClassName} name="startLocal" required type="datetime-local" /></label>
        <label className="text-sm font-medium text-slate-700">Trainer <span className="font-normal text-slate-400">(optional)</span><select className={fieldClassName} defaultValue="" name="trainerId"><option value="">Assign later</option>{trainers.map((trainer) => <option key={trainer.organizationUserId} value={trainer.organizationUserId}>{trainer.name} · {trainer.scope}</option>)}</select></label>
        <label className="text-sm font-medium text-slate-700">Capacity override <span className="font-normal text-slate-400">(optional)</span><input className={fieldClassName} max={500} min={1} name="capacity" placeholder="Use class default" type="number" /></label>
      </div>
      {state.message ? <p className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800" role="status">{state.message}</p> : null}
      <button className="rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60" disabled={pending} type="submit">{pending ? "Scheduling class…" : "Schedule class"}</button>
    </form>
  );
}
