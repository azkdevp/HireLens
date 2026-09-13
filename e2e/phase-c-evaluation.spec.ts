import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
let vacancyId = "";
let candidateId = "";
let interviewId = "";

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test.describe("Phase C evaluation journey", () => {
  test.setTimeout(120_000);

  test.afterAll(async () => {
    if (candidateId) {
      const { data: feedback } = await service.from("feedback_submissions").select("id").eq("candidate_id", candidateId);
      const feedbackIds = (feedback ?? []).map(row => row.id);
      if (feedbackIds.length) await service.from("feedback_ratings").delete().in("feedback_submission_id", feedbackIds);
      await service.from("feedback_submissions").delete().eq("candidate_id", candidateId);
      for (const table of ["notifications", "audit_events", "activity_logs", "candidate_stage_history"])
        await service.from(table).delete().eq("candidate_id", candidateId);
    }
    if (interviewId) {
      await service.from("interview_assignments").delete().eq("interview_id", interviewId);
      await service.from("interviews").delete().eq("id", interviewId);
    }
    if (vacancyId) {
      await service.from("audit_events").delete().eq("vacancy_id", vacancyId);
      await service.from("evaluation_criteria").delete().eq("vacancy_id", vacancyId);
    }
    if (candidateId) await service.from("candidates").delete().eq("id", candidateId);
    if (vacancyId) {
      await service.from("vacancy_stages").delete().eq("vacancy_id", vacancyId);
      await service.from("vacancies").delete().eq("id", vacancyId);
    }
  });

  test("HR configures criteria; Interviewer drafts and submits; HR and Management see completion evidence", async ({ page }) => {
    const suffix = Date.now();
    await signIn(page, process.env.E2E_HR_EMAIL!, process.env.E2E_HR_PASSWORD!);
    await page.goto("/vacancies/new");
    await page.getByLabel("Title").fill(`Phase C QA ${suffix}`);
    await page.getByLabel("Department").fill("Quality Assurance");
    await page.getByLabel("Location").fill("Colombo");
    await page.getByLabel("Description").fill("Disposable Phase C structured evaluation browser fixture.");
    await page.getByRole("button", { name: "Create vacancy" }).click();
    await expect(page).toHaveURL(/\/vacancies\/[a-f0-9-]+$/);
    vacancyId = new URL(page.url()).pathname.split("/").pop()!;

    await page.getByRole("link", { name: "Configure criteria" }).click();
    await page.getByRole("button", { name: "Add criterion" }).click();
    await page.getByRole("button", { name: "Add criterion" }).click();
    await page.getByLabel("Name").nth(0).fill("Technical Skills");
    await page.getByLabel("Optional weight (%)").nth(0).fill("60");
    await page.getByLabel("Description").nth(0).fill("Technical evidence demonstrated in the interview.");
    await page.getByLabel("Name").nth(1).fill("Communication");
    await page.getByLabel("Optional weight (%)").nth(1).fill("40");
    await page.getByLabel("Description").nth(1).fill("Clear and structured communication.");
    await page.getByRole("button", { name: "Save criteria" }).click();
    await expect(page.getByText("Evaluation criteria saved.")).toBeVisible();
    await page.getByText("← Back to vacancy").click();
    await expect(page.getByText("Technical Skills", { exact: true })).toBeVisible();

    await page.goto("/candidates/new");
    await page.getByLabel("Vacancy").selectOption(vacancyId);
    await page.getByLabel("Full name").fill("Phase C Browser Candidate");
    await page.getByLabel("Email").fill(`phase-c-${suffix}@example.com`);
    await page.getByLabel("Phone").fill("+94 77 456 7890");
    await page.getByLabel("Source").fill("Automated QA");
    await page.getByRole("button", { name: "Create candidate" }).click();
    await expect(page).toHaveURL(/\/candidates\/[a-f0-9-]+$/);
    candidateId = new URL(page.url()).pathname.split("/").pop()!;

    await page.getByRole("link", { name: "Schedule interview" }).click();
    await page.getByLabel("Recruitment stage").selectOption({ label: "Screening" });
    const future = new Date(Date.now() + 172_800_000);
    await page.getByLabel("Date").fill(`${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`);
    await page.getByLabel("Time").fill("11:00");
    await page.getByLabel("Meeting link").fill("https://meet.example.com/phase-c-demo");
    await page.getByRole("button", { name: "Schedule interview" }).click();
    await expect(page).toHaveURL(/\/interviews\/[a-f0-9-]+$/);
    interviewId = new URL(page.url()).pathname.split("/").pop()!;
    await page.getByRole("link", { name: "Assign interviewer" }).click();
    await page.getByLabel("Ira Patel").check();
    await page.getByRole("button", { name: "Save assignments" }).click();
    await expect(page.getByText("Interviewers assigned and notified.")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await signIn(page, "interviewer@hirelens.demo", process.env.SEED_INTERVIEWER_PASSWORD!);
    const card = page.getByRole("article").filter({ hasText: "Phase C Browser Candidate" });
    await card.getByRole("link", { name: "View interview" }).click();
    await page.getByRole("link", { name: "Complete feedback" }).click();
    await expect(page.getByText("Technical Skills", { exact: true })).toBeVisible();
    for (const option of await page.getByText("Strong", { exact: true }).all()) await option.click();
    await page.getByLabel("Remarks").fill("Strong technical evidence with clear explanations and relevant examples.");
    await page.getByLabel("Strengths").fill("Structured reasoning and communication.");
    await page.getByLabel("Concerns").fill("No material concerns identified.");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft feedback saved.")).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await signIn(page, "interviewer@hirelens.demo", process.env.SEED_INTERVIEWER_PASSWORD!);
    await expect(page.getByRole("article").filter({ hasText: "Phase C Browser Candidate" })).toContainText("Feedback: DRAFT");
    await page.getByRole("article").filter({ hasText: "Phase C Browser Candidate" }).getByRole("link", { name: "Continue feedback" }).click();
    await expect(page).toHaveURL(new RegExp(`/interviews/${interviewId}$`));
    await page.getByRole("link", { name: "Continue feedback" }).click();
    await expect(page).toHaveURL(new RegExp(`/interviews/${interviewId}/feedback$`));
    await expect(page.getByLabel("Remarks")).toHaveValue("Strong technical evidence with clear explanations and relevant examples.");
    await page.getByLabel("Concerns").fill("No material concerns; draft reviewed before submission.");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft feedback saved.")).toBeVisible();
    await page.getByRole("button", { name: "Submit feedback" }).click();
    await expect(page).toHaveURL(new RegExp(`/interviews/${interviewId}$`));
    await expect(page.getByText("✓ Submitted")).toBeVisible();
    await page.getByRole("link", { name: "View submitted feedback" }).click();
    await expect(page.getByRole("heading", { name: "Submitted feedback" })).toBeVisible();
    await expect(page.getByText("Submitted evidence is locked and cannot be edited.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit feedback" })).toHaveCount(0);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await signIn(page, process.env.E2E_HR_EMAIL!, process.env.E2E_HR_PASSWORD!);
    await page.goto(`/candidates/${candidateId}`);
    await expect(page.getByRole("heading", { name: "Stage evidence" })).toBeVisible();
    await expect(page.getByText("Strong technical evidence with clear explanations and relevant examples.")).toBeVisible();
    await expect(page.getByText("1 / 1 feedback complete")).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await signIn(page, "management@hirelens.demo", process.env.SEED_MANAGEMENT_PASSWORD!);
    await page.goto(`/candidates/${candidateId}`);
    await expect(page.getByText("Strong technical evidence with clear explanations and relevant examples.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add stage remark" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Configure criteria" })).toHaveCount(0);
  });
});
