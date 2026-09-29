import Link from "next/link";
import { requirePlatformAdministrator } from "@/lib/auth";
import { signOut } from "@/app/login/actions";

export default async function PlatformLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { user } = await requirePlatformAdministrator();

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-4">
          <nav className="flex items-center gap-6">
            <Link className="text-lg font-bold tracking-tight" href="/platform">
              GymGrid
            </Link>
            <Link className="text-sm font-medium text-slate-600 hover:text-slate-950" href="/platform">
              Organizations
            </Link>
          </nav>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-500 sm:inline">{user.email}</span>
            <form action={signOut}>
              <button className="text-sm font-semibold text-slate-700 hover:text-rose-700" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
