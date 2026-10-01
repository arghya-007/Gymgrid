import { redirect } from "next/navigation";
import { connection } from "next/server";

import { getTenantSession } from "@/lib/tenant";

export default async function WorkspaceRedirectPage() {
  await connection();
  const { isPlatformAdministrator, memberships } = await getTenantSession();

  if (isPlatformAdministrator) {
    redirect("/platform");
  }

  if (memberships.length > 0) {
    redirect("/gym");
  }

  redirect("/gym");
}
