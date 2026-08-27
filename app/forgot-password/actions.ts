"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { recoveryEmailSchema } from "@/lib/password-policy";
import type { SecurityActionState } from "@/app/(protected)/account/security/actions";

const genericSuccess = "If an account exists for this email, a password reset link has been sent.";

export async function requestPasswordReset(_: SecurityActionState, formData: FormData): Promise<SecurityActionState> {
  const parsed = recoveryEmailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.0.0.1") ? "http" : "https");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? (host ? `${protocol}://${host}` : null);
  if (!siteUrl) return { success: genericSuccess };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password&type=recovery`
  });
  return { success: genericSuccess };
}
