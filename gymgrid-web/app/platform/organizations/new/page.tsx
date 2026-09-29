import Link from "next/link";
import { OnboardingForm } from "./onboarding-form";

export default function NewOrganizationPage() {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link className="text-sm font-semibold text-emerald-700 hover:text-emerald-900" href="/platform">
        ← Organizations
      </Link>
      <div className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Tenant onboarding</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Create an organization</h1>
        <p className="mt-3 max-w-2xl text-slate-600">
          This transaction creates the tenant, its first branch, owner invitation, annual subscription, and entitlement snapshot together.
        </p>
        <div className="mt-10">
          <OnboardingForm today={today} />
        </div>
      </div>
    </main>
  );
}
