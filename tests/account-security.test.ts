import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { changePasswordSchema, newPasswordSchema, passwordSchema, recoveryEmailSchema } from "@/lib/password-policy";

describe("account security validation", () => {
  it("accepts a production-minded password", () => expect(passwordSchema.safeParse("Strong#Pass1").success).toBe(true));
  it.each(["Short1!", "lowercase1!", "UPPERCASE1!", "NoNumber!", "NoSymbol1"])("rejects weak password %s", (password) => {
    expect(passwordSchema.safeParse(password).success).toBe(false);
  });
  it("rejects mismatched change-password confirmation", () => {
    expect(changePasswordSchema.safeParse({ currentPassword: "Current#1", password: "Strong#Pass1", confirmPassword: "Strong#Pass2" }).success).toBe(false);
  });
  it("rejects mismatched recovery confirmation", () => {
    expect(newPasswordSchema.safeParse({ password: "Strong#Pass1", confirmPassword: "Strong#Pass2" }).success).toBe(false);
  });
  it("validates recovery email format", () => {
    expect(recoveryEmailSchema.safeParse("person@example.com").success).toBe(true);
    expect(recoveryEmailSchema.safeParse("not-an-email").success).toBe(false);
  });
});

describe("account security contracts", () => {
  const middleware = readFileSync(resolve("middleware.ts"), "utf8");
  const migration = readFileSync(resolve("supabase/migrations/202608020001_sprint1.sql"), "utf8");
  const changeAction = readFileSync(resolve("app/(protected)/account/security/actions.ts"), "utf8");
  const forgotAction = readFileSync(resolve("app/forgot-password/actions.ts"), "utf8");

  it("keeps account security protected while recovery routes are public", () => {
    expect(middleware).toContain('"/forgot-password"');
    expect(middleware).toContain('"/reset-password"');
    expect(middleware).not.toContain('"/account/security"');
  });
  it("verifies the current password before updating it", () => {
    expect(changeAction).toContain("signInWithPassword");
    expect(changeAction.indexOf("signInWithPassword")).toBeLessThan(changeAction.indexOf("updateUser"));
  });
  it("does not expose account existence during recovery", () => {
    expect(forgotAction).toContain("If an account exists for this email");
    expect(forgotAction).not.toContain("user not found");
  });
  it("does not add password storage to public application tables", () => {
    expect(migration).not.toMatch(/password\s+(text|varchar|character varying)/i);
  });
});
