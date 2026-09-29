import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireAuthenticatedUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  return { supabase, user };
}

export async function requirePlatformAdministrator() {
  const { supabase, user } = await requireAuthenticatedUser();

  const { data: isPlatformAdministrator, error: roleError } = await supabase.rpc(
    "is_platform_administrator",
  );

  if (roleError || !isPlatformAdministrator) {
    redirect("/?error=platform-access-required");
  }

  return { supabase, user };
}
