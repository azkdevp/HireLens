"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { changePassword, type SecurityActionState } from "@/app/(protected)/account/security/actions";
import { requestPasswordReset } from "@/app/forgot-password/actions";
import { resetPassword } from "@/app/reset-password/actions";
import { PASSWORD_REQUIREMENTS } from "@/lib/password-policy";

const initialState: SecurityActionState = {};

function Feedback({ state }: { state: SecurityActionState }) {
  if (state.error) return <p className="error" role="alert">{state.error}</p>;
  if (state.success) return <p className="badge" role="status">{state.success}</p>;
  return null;
}

function PasswordRequirements() {
  return <div><p className="muted" style={{marginBottom:6}}>Password requirements:</p><ul className="muted" style={{marginTop:0}}>{PASSWORD_REQUIREMENTS.map((requirement)=><li key={requirement}>{requirement}</li>)}</ul></div>;
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.success) formRef.current?.reset(); }, [state.success]);
  return <form ref={formRef} action={action} className="stack">
    <label className="field">Current password<input name="currentPassword" type="password" autoComplete="current-password" required /></label>
    <label className="field">New password<input name="password" type="password" autoComplete="new-password" required /></label>
    <label className="field">Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" required /></label>
    <PasswordRequirements />
    <Feedback state={state}/>
    <button className="btn" disabled={pending}>{pending ? "Updating…" : "Update Password"}</button>
  </form>;
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initialState);
  return <form action={action} className="stack">
    <label className="field">Work email<input name="email" type="email" autoComplete="email" required /></label>
    <Feedback state={state}/>
    <button className="btn" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button>
  </form>;
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPassword, initialState);
  return <form action={action} className="stack">
    <label className="field">New password<input name="password" type="password" autoComplete="new-password" required /></label>
    <label className="field">Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" required /></label>
    <PasswordRequirements />
    <Feedback state={state}/>
    {state.success ? <Link className="btn" href="/login">Return to login</Link> : <button className="btn" disabled={pending}>{pending ? "Updating…" : "Update Password"}</button>}
  </form>;
}
