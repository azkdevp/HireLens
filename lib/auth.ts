import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

export async function requireProfile(roles?: Role[]): Promise<Profile> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data } = await supabase.from("user_profiles").select("id, authentication_user_id, full_name, role").eq("authentication_user_id", user.id).single();
  if (!data) redirect("/access-denied");
  const profile = data as Profile;
  if (roles && !roles.includes(profile.role)) redirect("/access-denied");
  return profile;
}

export function isHR(role: Role) { return role === "HR_RECRUITER"; }
