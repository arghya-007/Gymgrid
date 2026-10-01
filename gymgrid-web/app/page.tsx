import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-50">
      <section className="max-w-2xl space-y-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">
          Pilot-ready foundation
        </p>
        <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
          GymGrid
        </h1>
        <p className="text-lg leading-8 text-slate-300">
          A multi-tenant gym management platform for Indian fitness businesses.
          Run gym operations on the web and give owners, staff, and members secure mobile access from the same tenant-aware system.
        </p>
        <Link
          className="inline-flex rounded-xl bg-emerald-400 px-5 py-3 font-semibold text-slate-950 transition hover:bg-emerald-300"
          href="/login"
        >
          Sign in to GymGrid
        </Link>
      </section>
    </main>
  );
}
