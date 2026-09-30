import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import QRCode from "qrcode";
import { requireTenantMembership } from "@/lib/tenant";
import { RotateQrPassForm } from "./rotate-pass-form";

interface MemberRow { id: string; member_code: string; full_name: string; status: "active" | "inactive" | "archived"; home_branch_id: string; }
interface PassRow { id: string; token: string; created_at: string; }

export default async function MemberQrPassPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; memberId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ organizationSlug, memberId }, query] = await Promise.all([params, searchParams]);
  const { membership, supabase } = await requireTenantMembership(organizationSlug);
  if (!membership.canManageCheckIns) redirect(`/gym/${organizationSlug}/members/${memberId}`);
  if (!/^[0-9a-f-]{36}$/i.test(memberId)) notFound();

  const [memberResult, passResult] = await Promise.all([
    supabase
      .from("members")
      .select("id, member_code, full_name, status, home_branch_id")
      .eq("organization_id", membership.organization.id)
      .eq("id", memberId)
      .maybeSingle(),
    supabase
      .from("member_qr_passes")
      .select("id, token, created_at")
      .eq("organization_id", membership.organization.id)
      .eq("member_id", memberId)
      .eq("active", true)
      .maybeSingle(),
  ]);
  if (memberResult.error || !memberResult.data) notFound();
  const member = memberResult.data as MemberRow;
  const pass = passResult.data as PassRow | null;
  const qrPayload = pass ? `gymgrid:member:${pass.token}` : null;
  const qrDataUrl = qrPayload
    ? await QRCode.toDataURL(qrPayload, { errorCorrectionLevel: "M", margin: 2, width: 360 })
    : null;
  const branchName = membership.branches.find((branch) => branch.id === member.home_branch_id)?.name ?? "Assigned branch";

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-3xl">
        <Link className="text-sm font-semibold text-emerald-700" href={`/gym/${organizationSlug}/members/${member.id}`}>← Member profile</Link>
        <section className="mt-5 rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Member access pass</p>
          <h1 className="mt-2 text-3xl font-semibold">{member.full_name}</h1>
          <p className="mt-2 text-sm text-slate-500">{member.member_code} · {branchName}</p>
          {query.rotated ? <p className="mx-auto mt-6 max-w-lg rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800" role="status">A new QR pass is active. The previous pass can no longer be used.</p> : null}
          {passResult.error ? <p className="mx-auto mt-6 max-w-lg rounded-xl bg-rose-50 p-4 text-sm text-rose-800">The active QR pass could not be loaded.</p> : null}
          {qrDataUrl ? (
            <div className="mt-7">
              <div className="mx-auto w-fit rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <Image alt={`QR pass for ${member.full_name}`} height={360} priority src={qrDataUrl} unoptimized width={360} />
              </div>
              <p className="mt-4 text-sm text-slate-500">Scan this pass only at a signed-in GymGrid kiosk. Replacing it invalidates the previous code immediately.</p>
            </div>
          ) : <p className="mx-auto mt-7 max-w-lg rounded-xl bg-amber-50 p-4 text-sm text-amber-900">No active QR pass exists for this member.</p>}
          <div className="mt-7 flex justify-center">
            <RotateQrPassForm hasPass={Boolean(pass)} memberId={member.id} organizationSlug={organizationSlug} />
          </div>
        </section>
      </div>
    </main>
  );
}
