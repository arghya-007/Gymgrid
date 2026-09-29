import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { signOut } from "@/app/login/actions";
import { getTenantSession, tenantRoleLabels } from "@/lib/tenant";

export default async function GymWorkspacePage() {
  await connection();
  const { memberships, isPlatformAdministrator, user } =
    await getTenantSession();

  if (memberships.length === 1) {
    redirect(`/gym/${memberships[0].organization.slug}`);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100 sm:py-16">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
          <div>
            <Link className="text-xl font-bold tracking-tight text-white" href="/">
              GymGrid
            </Link>
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-400">
              Gym workspace
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              {memberships.length > 1
                ? "Choose an organization"
                : "No gym access yet"}
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
              {memberships.length > 1
                ? "Your account belongs to more than one GymGrid organization. Select the workspace you want to manage."
                : "This account is authenticated, but it does not have an active organization role."}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4 text-sm text-slate-400">
            <span className="hidden max-w-48 truncate md:inline">{user.email}</span>
            <form action={signOut}>
              <button
                className="whitespace-nowrap font-semibold text-white transition hover:text-emerald-300"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

        {memberships.length > 1 ? (
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {memberships.map((membership) => (
              <Link
                className="group rounded-3xl border border-slate-800 bg-slate-900 p-6 transition hover:border-emerald-500/60 hover:bg-slate-900/70"
                href={`/gym/${membership.organization.slug}`}
                key={membership.organization.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-white group-hover:text-emerald-300">
                      {membership.organization.name}
                    </h2>
                    <p className="mt-2 text-sm text-slate-400">
                      {tenantRoleLabels[membership.primaryRole]} · {membership.branches.length}{" "}
                      {membership.branches.length === 1 ? "branch" : "branches"}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold capitalize text-slate-300">
                    {membership.organization.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-10 rounded-3xl border border-slate-800 bg-slate-900 p-8">
            <h2 className="text-lg font-semibold text-white">
              An organization role is required
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Ask a GymGrid platform administrator or your gym owner to add this email to an organization. Pending invitations do not grant access until accepted.
            </p>
            {isPlatformAdministrator ? (
              <Link
                className="mt-6 inline-flex rounded-xl bg-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
                href="/platform/organizations/new"
              >
                Onboard an organization
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
