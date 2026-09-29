import Link from "next/link";
import { connection } from "next/server";
import { requirePlatformAdministrator } from "@/lib/auth";

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  status: "trial" | "active" | "suspended" | "cancelled";
}

export default async function PlatformOrganizationsPage() {
  await connection();
  const { supabase } = await requirePlatformAdministrator();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, slug, status, created_at")
    .order("created_at", { ascending: false });
  const organizations = (data ?? []) as OrganizationRow[];

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Platform admin</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Organizations</h1>
          <p className="mt-2 text-slate-600">Onboard gyms and review tenant status.</p>
        </div>
        <Link className="rounded-xl bg-slate-950 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-700" href="/platform/organizations/new">
          Onboard organization
        </Link>
      </div>

      {error ? (
        <p className="mt-8 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
          Organizations could not be loaded. Check the development database configuration.
        </p>
      ) : null}

      <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {organizations.length === 0 ? (
          <div className="p-10 text-center text-slate-500">No organizations have been onboarded yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {organizations.map((organization) => (
              <article className="flex flex-col justify-between gap-3 p-5 sm:flex-row sm:items-center" key={organization.id}>
                <div>
                  <h2 className="font-semibold">{organization.name}</h2>
                  <p className="mt-1 text-sm text-slate-500">{organization.slug}</p>
                </div>
                <span className="w-fit rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold capitalize text-slate-700">
                  {organization.status}
                </span>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
