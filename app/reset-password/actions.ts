"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { newPasswordSchema } from "@/lib/password-policy";
import type { SecurityActionState } from "@/app/(protected)/account/security/actions";

export async function resetPassword(_: SecurityActionState, formData: FormData): Promise<SecurityActionState> {
  const parsed = newPasswordSchema.safeParse({ password: formData.get("password"), confirmPassword: formData.get("confirmPassword") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const cookieStore = await cookies();
  if (cookieStore.get("hirelens-password-recovery")?.value !== "active") return { error: "This password recovery link is invalid or has expired." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "This password recovery link is invalid or has expired." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "The password could not be updated. Request a new recovery link and try again." };

  cookieStore.delete("hirelens-password-recovery");
  await supabase.auth.signOut();
  return { success: "Your password has been reset. You can now sign in with the new password." };
}
