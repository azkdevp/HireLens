import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { ResetPasswordForm } from "@/components/account-security-forms";

export default async function ResetPasswordPage() {
  const cookieStore = await cookies();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const validRecovery = Boolean(user && cookieStore.get("hirelens-password-recovery")?.value === "active");
  return <main className="shell" style={{minHeight:"100vh",display:"grid",placeItems:"center"}}><section className="card" style={{width:"min(460px,100%)"}}><p className="badge">ACCOUNT RECOVERY</p><h1>Reset password</h1>{validRecovery?<><p className="muted">Choose a strong new password for your HireLens account.</p><ResetPasswordForm/></>:<><p className="error" role="alert">This password recovery link is invalid or has expired.</p><p><Link className="btn" href="/forgot-password">Request a new link</Link></p></>}</section></main>;
}
