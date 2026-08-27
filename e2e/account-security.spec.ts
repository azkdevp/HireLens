import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const email = `account-security-${Date.now()}@hirelens.test`;
const originalPassword = "Original#Pass1";
const changedPassword = "Changed#Pass2";
let userId = "";
let profileId = "";

async function signIn(page: import("@playwright/test").Page, password: string) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Welcome, Account Security QA" })).toBeVisible();
}

test.describe.serial("account security", () => {
  test.beforeAll(async () => {
    const { data, error } = await service.auth.admin.createUser({ email, password: originalPassword, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    const { data: profile, error: profileError } = await service.from("user_profiles").insert({ authentication_user_id: userId, full_name: "Account Security QA", role: "INTERVIEWER" }).select("id").single();
    if (profileError) throw profileError;
    profileId = profile.id;
  });

  test.afterAll(async () => {
    if (userId) await service.auth.admin.deleteUser(userId);
  });

  test("does not expose public registration and safely rejects invalid recovery state", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText("Forgot password?", { exact: true })).toBeVisible();
    await expect(page.getByText("Create Account", { exact: true })).toHaveCount(0);
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/reset-password");
    await expect(page.getByText("This password recovery link is invalid or has expired.", { exact: true })).toBeVisible();
  });

  test("prevents email enumeration and rejects invalid email format", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Work email").fill("invalid@example");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText("Enter a valid email address.", { exact: true })).toBeVisible();

    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    const genericMessage = "If an account exists for this email, a password reset link has been sent.";
    await expect(page.getByText(genericMessage, { exact: true })).toBeVisible();

    await page.getByLabel("Work email").fill(`unknown-${Date.now()}@hirelens.test`);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(genericMessage, { exact: true })).toBeVisible();
  });

  test("verifies current password and changes only the disposable account credential", async ({ page }) => {
    await signIn(page, originalPassword);
    await page.goto("/account/security");
    await expect(page.locator("#account-email")).toHaveValue(email);

    await page.getByLabel("Current password").fill("Incorrect#Pass1");
    await page.getByLabel("New password", { exact: true }).fill(changedPassword);
    await page.getByLabel("Confirm new password").fill(changedPassword);
    await page.getByRole("button", { name: "Update Password" }).click();
    await expect(page.getByText("The current password is incorrect.", { exact: true })).toBeVisible();

    await page.getByLabel("Current password").fill(originalPassword);
    await page.getByLabel("New password", { exact: true }).fill("weak");
    await page.getByLabel("Confirm new password").fill("weak");
    await page.getByRole("button", { name: "Update Password" }).click();
    await expect(page.getByText("Password must be at least 8 characters.", { exact: true })).toBeVisible();

    await page.getByLabel("Current password").fill(originalPassword);
    await page.getByLabel("New password", { exact: true }).fill(changedPassword);
    await page.getByLabel("Confirm new password").fill("Different#Pass3");
    await page.getByRole("button", { name: "Update Password" }).click();
    await expect(page.getByText("Passwords do not match.", { exact: true })).toBeVisible();

    await page.getByLabel("Current password").fill(originalPassword);
    await page.getByLabel("New password", { exact: true }).fill(changedPassword);
    await page.getByLabel("Confirm new password").fill(changedPassword);
    await page.getByRole("button", { name: "Update Password" }).click();
    await expect(page.getByText("Your password has been updated.", { exact: true })).toBeVisible();

    const { data: profile } = await service.from("user_profiles").select("id,role").eq("id", profileId).single();
    expect(profile).toEqual({ id: profileId, role: "INTERVIEWER" });

    await page.getByRole("button", { name: "Sign out" }).click();
    await signIn(page, changedPassword);
  });
});
