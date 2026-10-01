import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTenantMembership } from "@/lib/tenant";
import { MemberEditForm, type EditableMember } from "./member-edit-form";
import { PhotoUploader } from "./photo-uploader";

interface MemberRow {
  id: string;
  member_code: string;
  full_name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string;
  date_of_birth: string | null;
  gender: EditableMember["gender"];
  notes: string | null;
  consent_at: string | null;
  photo_path: string | null;
}

export default async function EditMemberPage({
  params,
}: PageProps<"/gym/[organizationSlug]/members/[memberId]/edit">) {
  const { organizationSlug, memberId } = await params;
  const { membership, supabase } =
    await requireTenantMembership(organizationSlug);

  if (!membership.canManageMembers) notFound();

  const result = await supabase
    .from("members")
    .select(
      "id, member_code, full_name, preferred_name, email, phone, date_of_birth, gender, notes, consent_at, photo_path",
    )
    .eq("organization_id", membership.organization.id)
    .eq("id", memberId)
    .maybeSingle();

  if (result.error) throw new Error("Member profile could not be loaded.");
  if (!result.data) notFound();
  const member = result.data as MemberRow;

  let photoUrl: string | null = null;
  if (member.photo_path) {
    const signedResult = await supabase.storage
      .from("member-photos")
      .createSignedUrl(member.photo_path, 3600);
    photoUrl = signedResult.data?.signedUrl ?? null;
  }

  return (
    <main className="px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-5xl">
        <Link
          className="text-sm font-semibold text-emerald-700 hover:text-emerald-900"
          href={`/gym/${organizationSlug}/members/${member.id}`}
        >
          ← Member profile
        </Link>
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
            {member.member_code}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Edit member</h1>
          <p className="mt-2 text-sm text-slate-500">
            Update contact details and manage the member’s private photograph.
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <PhotoUploader
            currentPhotoPath={member.photo_path}
            currentPhotoUrl={photoUrl}
            memberId={member.id}
            memberName={member.full_name}
            organizationId={membership.organization.id}
          />
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <MemberEditForm
              member={{
                fullName: member.full_name,
                preferredName: member.preferred_name,
                email: member.email,
                phone: member.phone,
                dateOfBirth: member.date_of_birth,
                gender: member.gender,
                notes: member.notes,
                consentAt: member.consent_at,
              }}
              memberId={member.id}
              organizationSlug={organizationSlug}
            />
          </section>
        </div>
      </div>
    </main>
  );
}
