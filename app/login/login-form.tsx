"use client";
import { useActionState } from "react"; import { login, type LoginState } from "./actions";
export function LoginForm() { const initial: LoginState = {}; const [state, action, pending] = useActionState(login, initial); return <form action={action} className="stack">
  <div className="field"><label htmlFor="email">Work email</label><input id="email" name="email" type="email" autoComplete="email" required /></div>
  <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required /></div>
  {state.error && <p role="alert" className="error">{state.error}</p>}<button className="btn" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button></form>; }
