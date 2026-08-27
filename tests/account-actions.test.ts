import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireProfile: vi.fn(),
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  cookieGet: vi.fn(),
  cookieDelete: vi.fn(),
  headersGet: vi.fn()
}));

vi.mock("@/lib/auth", () => ({ requireProfile: mocks.requireProfile }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: {
    getUser: mocks.getUser,
    signInWithPassword: mocks.signInWithPassword,
    updateUser: mocks.updateUser,
    signOut: mocks.signOut,
    resetPasswordForEmail: mocks.resetPasswordForEmail
  } })
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: mocks.cookieGet, delete: mocks.cookieDelete }),
  headers: async () => ({ get: mocks.headersGet })
}));

import { changePassword } from "@/app/(protected)/account/security/actions";
import { requestPasswordReset } from "@/app/forgot-password/actions";
import { resetPassword } from "@/app/reset-password/actions";

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("account security server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireProfile.mockResolvedValue({ id: "profile", role: "INTERVIEWER" });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user", email: "person@example.com" } } });
    mocks.signInWithPassword.mockResolvedValue({ error: null });
    mocks.updateUser.mockResolvedValue({ error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
    mocks.cookieGet.mockReturnValue({ value: "active" });
    mocks.headersGet.mockImplementation((name: string) => name === "host" ? "127.0.0.1:3000" : null);
  });

  it("rejects an incorrect current password", async () => {
    mocks.signInWithPassword.mockResolvedValue({ error: new Error("invalid") });
    const result = await changePassword({}, form({ currentPassword: "Wrong#Pass1", password: "Strong#Pass1", confirmPassword: "Strong#Pass1" }));
    expect(result.error).toBe("The current password is incorrect.");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("accepts a valid authenticated password change", async () => {
    const result = await changePassword({}, form({ currentPassword: "Current#Pass1", password: "Strong#Pass1", confirmPassword: "Strong#Pass1" }));
    expect(result.success).toBe("Your password has been updated.");
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "Strong#Pass1" });
  });

  it("returns identical recovery feedback for known and unknown accounts", async () => {
    const known = await requestPasswordReset({}, form({ email: "known@example.com" }));
    mocks.resetPasswordForEmail.mockResolvedValue({ error: new Error("unknown") });
    const unknown = await requestPasswordReset({}, form({ email: "unknown@example.com" }));
    expect(known).toEqual(unknown);
    expect(known.success).toContain("If an account exists");
  });

  it("rejects invalid recovery state", async () => {
    mocks.cookieGet.mockReturnValue(undefined);
    const result = await resetPassword({}, form({ password: "Strong#Pass1", confirmPassword: "Strong#Pass1" }));
    expect(result.error).toContain("invalid or has expired");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });

  it("updates a password only for a valid recovery session", async () => {
    const result = await resetPassword({}, form({ password: "Recovered#Pass1", confirmPassword: "Recovered#Pass1" }));
    expect(result.success).toContain("password has been reset");
    expect(mocks.updateUser).toHaveBeenCalledWith({ password: "Recovered#Pass1" });
    expect(mocks.cookieDelete).toHaveBeenCalledWith("hirelens-password-recovery");
    expect(mocks.signOut).toHaveBeenCalled();
  });
});
