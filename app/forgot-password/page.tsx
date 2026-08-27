import Link from "next/link";
import { ForgotPasswordForm } from "@/components/account-security-forms";

export default function ForgotPasswordPage() {
  return <main className="shell" style={{minHeight:"100vh",display:"grid",placeItems:"center"}}><section className="card" style={{width:"min(430px,100%)"}}><p className="badge">ACCOUNT RECOVERY</p><h1>Forgot password?</h1><p className="muted">Enter your work email and we’ll send recovery instructions if an account exists.</p><ForgotPasswordForm/><p style={{marginTop:18,textAlign:"center"}}><Link href="/login">Return to login</Link></p></section></main>;
}
