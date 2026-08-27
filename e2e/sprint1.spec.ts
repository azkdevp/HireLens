import { expect, test } from "@playwright/test";
import path from "node:path";

const hrEmail = process.env.E2E_HR_EMAIL!;
const hrPassword = process.env.E2E_HR_PASSWORD!;

async function signIn(page: import("@playwright/test").Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test.describe("Sprint 1 authentication and route protection", () => {
  test("redirects an unauthenticated protected route to login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("rejects invalid login credentials", async ({ page }) => {
    await signIn(page, "invalid@hirelens.demo", "not-the-password");
    await expect(page.getByText("The email or password is incorrect.", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("logs HR in and out", async ({ page }) => {
    await signIn(page, hrEmail, hrPassword);
    await expect(page.getByRole("heading", { name: "Welcome, Harper Reed" })).toBeVisible();
    await page.goto("/account/security");
    await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe("Sprint 1 role restrictions", () => {
  for (const role of [
    { name: "Interviewer", email: "interviewer@hirelens.demo", password: process.env.SEED_INTERVIEWER_PASSWORD! },
    { name: "Management", email: "management@hirelens.demo", password: process.env.SEED_MANAGEMENT_PASSWORD! }
  ]) {
    test(`${role.name} receives read-only access and cannot open HR routes`, async ({ page }) => {
      await signIn(page, role.email, role.password);
      await expect(page.getByRole("heading", { name: /Welcome/ })).toBeVisible();
      await page.goto("/account/security");
      await expect(page.getByRole("heading", { name: "Security" })).toBeVisible();
      await page.goto("/vacancies/new");
      await expect(page.getByText("ACCESS DENIED")).toBeVisible();
      await page.goto("/candidates");
      await expect(page.getByText("ACCESS DENIED")).toBeVisible();
    });
  }
});

test.describe("Sprint 1 recruitment journey", () => {
  test("HR completes the connected visible recruitment workflow", async ({ page }) => {
    await signIn(page, hrEmail, hrPassword);
    await page.getByRole("link", { name: "Manage vacancies" }).click();
    await page.getByRole("link", { name: "Create vacancy" }).click();
    await page.getByLabel("Title").fill(`Sprint 1 Engineer ${Date.now()}`);
    await page.getByLabel("Department").fill("Engineering");
    await page.getByLabel("Location").fill("Colombo");
    await page.getByLabel("Description").fill("Build secure recruitment workflows for HireLens.");
    await page.getByRole("button", { name: "Create vacancy" }).click();
    await expect(page.getByRole("heading", { name: /Sprint 1 Engineer/ })).toBeVisible();

    await page.getByRole("link", { name: "Candidates" }).click();
    await page.getByRole("link", { name: "Create candidate" }).click();
    await page.getByLabel("Full name").fill("Taylor Morgan");
    await page.getByLabel("Email").fill(`taylor-${Date.now()}@example.com`);
    await page.getByLabel("Phone").fill("+94 77 123 4567");
    await page.getByLabel("Source").fill("Referral");
    await page.getByRole("button", { name: "Create candidate" }).click();
    await expect(page.getByRole("heading", { name: "Taylor Morgan" })).toBeVisible();
    await expect(page.getByText("Candidate record created")).toBeVisible();

    await page.getByLabel(/CV file/).setInputFiles(path.join(process.cwd(), "e2e/fixtures/test-cv.pdf"));
    await page.getByRole("button", { name: "Attach or replace CV" }).click();
    await expect(page.getByText("CV attached.")).toBeVisible();
    await expect(page.getByText("Candidate CV attached")).toBeVisible();

    await page.getByRole("button", { name: /Move to/ }).click();
    await expect(page.getByText("Candidate moved to the next recruitment stage")).toBeVisible();

    await page.getByLabel("Candidate outcome").selectOption("ON_HOLD");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Confirm outcome" }).click();
    await expect(page.getByText("Candidate outcome recorded as ON HOLD")).toBeVisible();
  });
});
