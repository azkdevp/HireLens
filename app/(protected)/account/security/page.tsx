import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "@/components/account-security-forms";

export default async function AccountSecurityPage() {
  await requireProfile();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return <div className="stack"><div><p className="badge">ACCOUNT</p><h1>Security</h1><p className="muted">Manage the password used to access your HireLens account.</p></div><section className="card" style={{maxWidth:620}}><h2>Change password</h2><div className="field"><label htmlFor="account-email">Work email</label><input id="account-email" value={user?.email??""} readOnly aria-readonly="true" /></div><ChangePasswordForm/></section></div>;
}
