"use server";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { changePasswordSchema } from "@/lib/password-policy";

export type SecurityActionState = { error?: string; success?: string };

export async function changePassword(_: SecurityActionState, formData: FormData): Promise<SecurityActionState> {
  await requireProfile();
  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword")
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Your session is no longer valid. Please sign in again." };

  const { error: verificationError } = await supabase.auth.signInWithPassword({ email: user.email, password: parsed.data.currentPassword });
  if (verificationError) return { error: "The current password is incorrect." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: "The password could not be updated. Check the password requirements and try again." };
  return { success: "Your password has been updated." };
}
