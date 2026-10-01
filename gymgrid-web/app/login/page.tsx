import Link from "next/link";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60">
        <Link className="text-sm font-semibold text-emerald-700" href="/">
          GymGrid
        </Link>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950">
          Sign in to GymGrid
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Use your invited platform or gym-team account. GymGrid will route you to the workspace your role can access.
        </p>
        <LoginForm />
      </section>
    </main>
  );
}
