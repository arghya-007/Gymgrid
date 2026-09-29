import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { requireTenantMembership, tenantRoleLabels } from "@/lib/tenant";
import { GymNavigation } from "./gym-navigation";

export default async function GymOrganizationLayout({
  children,
  params,
}: LayoutProps<"/gym/[organizationSlug]">) {
  const { organizationSlug } = await params;
  const { membership, user, isPlatformAdministrator } =
    await requireTenantMembership(organizationSlug);

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950 lg:grid lg:grid-cols-[17rem_1fr]">
      <aside className="hidden min-h-screen flex-col bg-slate-950 px-5 py-6 text-slate-100 lg:flex">
        <Link className="px-3 text-xl font-bold tracking-tight" href="/gym">
          GymGrid
        </Link>
        <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <p className="truncate font-semibold text-white">
            {membership.organization.name}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {tenantRoleLabels[membership.primaryRole]}
          </p>
        </div>
        <GymNavigation organizationSlug={organizationSlug} />
        <div className="mt-auto space-y-3 border-t border-slate-800 pt-5">
          {isPlatformAdministrator ? (
            <Link
              className="block px-3 text-sm font-medium text-slate-400 transition hover:text-white"
              href="/platform"
            >
              Platform console
            </Link>
          ) : null}
          <p className="truncate px-3 text-xs text-slate-500">{user.email}</p>
          <form action={signOut}>
            <button
              className="px-3 text-sm font-semibold text-slate-300 transition hover:text-rose-300"
              type="submit"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="border-b border-slate-200 bg-white px-5 py-4 lg:hidden">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <Link className="text-sm font-bold" href="/gym">
                GymGrid
              </Link>
              <p className="truncate text-xs text-slate-500">
                {membership.organization.name}
              </p>
            </div>
            <form action={signOut}>
              <button className="text-sm font-semibold text-slate-700" type="submit">
                Sign out
              </button>
            </form>
          </div>
          <GymNavigation mobile organizationSlug={organizationSlug} />
        </header>
        {children}
      </div>
    </div>
  );
}
