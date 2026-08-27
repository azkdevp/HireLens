import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { Builder, By, until, type WebDriver } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome";
import { Select } from "selenium-webdriver/lib/select";
import { createClient } from "@supabase/supabase-js";

const cases = [
  "Unauthenticated dashboard redirects to login", "Invalid login safely rejected",
  "HR login opens HR dashboard", "Interviewer read-only access and HR-route denial",
  "Management read-only access and HR-route denial", "Create synthetic vacancy",
  "Vacancy details persist", "Configure recruitment stages and persist order",
  "Create candidate associated with the synthetic vacancy", "Upload synthetic PDF CV",
  "Candidate appears exactly once in Applied pipeline stage", "Move Applied to Screening and reload",
  "Record ON_HOLD and reload", "Activity timeline contains journey events"
];
type Result = { id: string; description: string; result: "PASS" | "FAIL" | "NOT RUN"; screenshots: string[]; diagnostic?: { errorType: string; message: string; url: string; step: string } };
const results: Result[] = cases.map((description, i) => ({ id: `TC-S${String(i + 1).padStart(2, "0")}`, description, result: "NOT RUN", screenshots: [] }));
const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
const evidence = path.resolve("test-evidence/sprint1/selenium");
const runDirectory = path.join(evidence, runId);
const title = `Selenium QA Vacancy ${runId}`;
const candidateName = `Selenium QA Candidate ${runId}`;
const candidateEmail = `selenium-${randomUUID()}@example.invalid`;
const description = "Synthetic COMP50074 Selenium Sprint 1 assessment vacancy. Safe for this runner to remove.";
let driver: WebDriver | undefined;
let server: ChildProcess | undefined;
let vacancyId = "";
let candidateId = "";
let cleanupStatus = "No QA records created.";
let infrastructure = "Ready";
let active: Result;
let testStep = "";
const sensitiveValues = new Set(Object.entries(process.env)
  .filter(([key, value]) => /password|secret|token|cookie|session|key/i.test(key) && value)
  .map(([, value]) => value!));
function safeUrl(value: string) {
  try {
    const url = new URL(value);
    // Never expose query strings, fragments or embedded URL credentials.
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch { return "URL unavailable"; }
}
function sanitize(value: string) {
  let output = value;
  for (const secret of [...sensitiveValues].sort((a, b) => b.length - a.length)) {
    for (const variant of [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)]) {
      output = output.split(variant).join("[REDACTED]");
    }
  }
  return output
    .replace(/https?:\/\/[^\s<>"']+/gi, match => safeUrl(match))
    .replace(/\beyJ[\w-]+\.[\w-]+(?:\.[\w-]+)?\b/g, "[REDACTED]")
    .replace(/\b(?:sb_secret_|sb_publishable_)[\w-]+/g, "[REDACTED]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/\b(password|cookie|authorization|access_token|refresh_token|session(?:id|_id)?|api[_-]?key)\b["']?\s*[:=][^\r\n]*/gi, "$1=[REDACTED]")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .slice(0, 2000);
}
async function diagnoseFailure(error: unknown) {
  let url = "URL unavailable";
  try { url = safeUrl(await browser().getCurrentUrl()); } catch { /* Browser may have disconnected. */ }
  const source = error instanceof Error ? error.stack?.match(/selenium\/sprint1\.ts:\d+:\d+/)?.[0] : undefined;
  active.diagnostic = {
    errorType: sanitize(error instanceof Error ? error.name : "UnknownError"),
    message: sanitize(error instanceof Error ? error.message : "Non-Error exception (payload withheld)"),
    url: sanitize(url),
    step: sanitize(`${testStep}${source ? ` (${source})` : ""}`)
  };
  console.error(`${active.id}: FAIL\n${JSON.stringify(active.diagnostic, null, 2)}`);
  try {
    // Redact password controls without inspecting cookies, tokens or browser storage.
    await browser().executeScript(() => {
      document.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach(field => {
        field.value = "";
        field.removeAttribute("value");
        field.style.visibility = "hidden";
      });
    });
    const name = `FAILED-${active.id}.png`;
    await writeFile(path.join(runDirectory, name), await browser().takeScreenshot(), "base64");
    active.screenshots.push(`${runId}/${name}`);
    console.error(`Failure screenshot: ${path.join(runDirectory, name)}`);
  } catch (captureError) {
    console.error(`${active.id}: failure screenshot unavailable: ${sanitize(captureError instanceof Error ? captureError.name : "UnknownError")}`);
  }
}
const base = process.env.SELENIUM_BASE_URL || "http://127.0.0.1:3000";
const browser = () => { assert(driver, "Browser unavailable"); return driver; };
const go = (route: string) => browser().get(new URL(route, base).href);
const visible = async (locator: By) => {
  const element = await browser().wait(until.elementLocated(locator), 20_000);
  await browser().wait(until.elementIsVisible(element), 20_000);
  return element;
};
const text = (value: string) => visible(By.xpath(`//*[normalize-space(text())='${value}']`));
const button = async (name: string) => (await visible(By.xpath(`//button[normalize-space(.)='${name}']`))).click();
const fill = async (name: string, value: string) => {
  if (/password|secret|token/i.test(name)) sensitiveValues.add(value);
  const element = await visible(By.css(`[name="${name}"]`));
  await element.clear();
  await element.sendKeys(value);
};
const route = async (pattern: RegExp) => browser().wait(async () => pattern.test(new URL(await browser().getCurrentUrl()).pathname), 20_000);
async function screenshot(name: string) {
  // Never capture populated password fields, including masked ones.
  for (const field of await browser().findElements(By.css('input[type="password"]'))) {
    await field.clear();
    assert.equal(await field.getAttribute("value"), "");
  }
  await writeFile(path.join(runDirectory, name), await browser().takeScreenshot(), "base64");
  active.screenshots.push(`${runId}/${name}`);
}
async function login(role: "HR" | "INTERVIEWER" | "MANAGEMENT") {
  await browser().manage().deleteAllCookies();
  await go("/login");
  await fill("email", process.env[`SELENIUM_${role}_EMAIL`]!);
  await fill("password", process.env[`SELENIUM_${role}_PASSWORD`]!);
  await button("Sign in");
  await route(/^\/dashboard$/);
  await visible(By.css("h1"));
}
async function readOnly(role: "INTERVIEWER" | "MANAGEMENT", number: string) {
  await login(role);
  await text("Read-only access");
  assert.equal((await browser().findElements(By.linkText("Manage vacancies"))).length, 0);
  await screenshot(`TC-S${number}-${role.toLowerCase()}-readonly.png`);
  await go("/vacancies");
  assert.equal((await browser().findElements(By.linkText("Create vacancy"))).length, 0);
  for (const restricted of ["/vacancies/new", "/candidates/new", "/candidates"]) {
    await go(restricted);
    await text("ACCESS DENIED");
  }
  await screenshot(`TC-S${number}-${role.toLowerCase()}-access-denied.png`);
}
async function ensureServer() {
  const ready = async () => { try { return (await fetch(new URL("/login", base), { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; } };
  if (await ready()) return;
  const url = new URL(base);
  assert(["127.0.0.1", "localhost"].includes(url.hostname), "Remote server must already be running");
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", url.hostname, "--port", url.port || "3000"], { stdio: "ignore" });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await ready()) return;
    if (server.exitCode !== null) throw new Error("Local server failed");
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("Local server timed out");
}
async function cleanup() {
  if (!vacancyId && !candidateId && results[5].result === "NOT RUN") return;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!key || !url) { cleanupStatus = `Manual cleanup required: only vacancy '${title}' and candidate '${candidateEmail}'.`; return; }
  const service = createClient(url, key, { auth: { persistSession: false } });
  const check = <T extends { error: unknown }>(response: T) => { assert(!response.error, "Cleanup operation failed"); return response; };
  // Resolve exact per-run ownership markers; never delete by a broad QA prefix.
  const { data: vacancy } = check(await service.from("vacancies").select("id").eq("title", title).maybeSingle());
  if (!vacancy) { cleanupStatus = "No matching run vacancy remained."; return; }
  const { data: candidates } = check(await service.from("candidates").select("id,email").eq("vacancy_id", vacancy.id));
  assert(candidates?.every(c => c.email === candidateEmail), "Unowned candidate: cleanup stopped");
  for (const candidate of candidates ?? []) {
    const { data: documents } = check(await service.from("candidate_documents").select("storage_path").eq("candidate_id", candidate.id));
    for (const document of documents ?? []) {
      assert(document.storage_path.startsWith(`${candidate.id}/`));
      check(await service.storage.from("candidate-cvs").remove([document.storage_path]));
    }
    for (const table of ["candidate_documents", "activity_logs", "candidate_stage_history"]) check(await service.from(table).delete().eq("candidate_id", candidate.id));
    check(await service.from("candidates").delete().eq("id", candidate.id).eq("email", candidateEmail));
  }
  check(await service.from("vacancy_stages").delete().eq("vacancy_id", vacancy.id));
  check(await service.from("vacancies").delete().eq("id", vacancy.id).eq("title", title));
  cleanupStatus = "Removed only this run's synthetic vacancy, candidate, CV, stages and dependent audit records.";
}
const steps: (() => Promise<void>)[] = [
  async () => {
    testStep = "Verify unauthenticated dashboard redirects to login";
    await go("/dashboard");
    await route(/^\/login$/);
    testStep = "Verify visible Work email and Password login inputs";
    await visible(By.css('form input[name="email"][type="email"]'));
    await visible(By.css('form input[name="password"][type="password"]'));
    await text("Work email");
    await text("Password");
    testStep = "Verify protected dashboard content is absent";
    assert.equal((await browser().findElements(By.xpath("//main//h1[starts-with(normalize-space(.),'Welcome,')] | //main//h2[normalize-space(.)='Active vacancies']"))).length, 0);
    assert.equal((await browser().findElements(By.linkText("Manage vacancies"))).length, 0);
    await screenshot("TC-S01-route-protection.png");
  },
  async () => {
    await fill("email", `invalid-${randomUUID()}@example.invalid`);
    await fill("password", randomUUID());
    await button("Sign in"); await text("The email or password is incorrect."); await route(/^\/login$/);
    await screenshot("TC-S02-invalid-login.png");
  },
  async () => { await login("HR"); await text("HR RECRUITER"); await visible(By.linkText("Manage vacancies")); await screenshot("TC-S03-hr-login.png"); },
  () => readOnly("INTERVIEWER", "04"),
  () => readOnly("MANAGEMENT", "05"),
  async () => {
    testStep = "Sign in as HR before creating the synthetic vacancy";
    await login("HR");
    testStep = "Open /vacancies/new";
    await go("/vacancies/new");
    for (const [name, value] of Object.entries({ title, department: "Selenium QA", location: "Synthetic test location" })) {
      testStep = `Fill vacancy field: ${name}`;
      await fill(name, value);
    }
    testStep = "Fill vacancy field: description";
    const descriptionField = await visible(By.css('textarea[name="description"]'));
    await descriptionField.clear();
    await descriptionField.sendKeys(description);
    testStep = "Click Create vacancy";
    await button("Create vacancy");
    testStep = "Wait for redirect to /vacancies/[UUID] after submission";
    await route(/^\/vacancies\/[0-9a-f-]{36}$/);
    testStep = "Read created vacancy ID from browser URL";
    vacancyId = new URL(await browser().getCurrentUrl()).pathname.split("/").pop()!;
    testStep = "Assert vacancy detail heading equals the synthetic vacancy title";
    assert.equal(await (await visible(By.css("h1"))).getText(), title);
    testStep = "Capture successful vacancy creation screenshot";
    await screenshot("TC-S06-vacancy-created.png");
  },
  async () => {
    testStep = "Reload the persisted vacancy detail page";
    await browser().navigate().refresh();
    assert.equal(new URL(await browser().getCurrentUrl()).pathname, `/vacancies/${vacancyId}`);
    testStep = "Assert persisted vacancy title";
    assert.equal(await (await visible(By.css("main h1"))).getText(), title);
    // Read rendered text, not XPath text(), which only considers the first text node.
    const details = await visible(By.xpath("//main//h1/following-sibling::p[1]"));
    const fields = (await details.getText()).split("·").map(value => value.trim());
    assert.equal(fields.length, 3, "Expected department, location and employment type");
    testStep = "Assert persisted vacancy department";
    assert.equal(fields[0], "Selenium QA");
    testStep = "Assert persisted vacancy location";
    assert.equal(fields[1], "Synthetic test location");
    testStep = "Assert persisted vacancy employment type";
    assert.equal(fields[2], "FULL TIME");
    testStep = "Assert persisted vacancy description";
    const savedDescription = await visible(By.xpath("//main//h2[normalize-space(.)='Description']/following-sibling::p[1]"));
    assert.equal(await savedDescription.getText(), description);
    await text("ACTIVE");
    await screenshot("TC-S07-vacancy-details.png");
  },
  async () => {
    await button("Add stage");
    const stage = await visible(By.css('[aria-label="Stage 4"]')); await stage.sendKeys("QA Review");
    await browser().findElement(By.xpath('//input[@aria-label="Stage 4"]/following-sibling::button[1]')).click();
    await button("Save stage order"); await text("Recruitment stages saved."); await browser().navigate().refresh();
    for (const [index, name] of ["Applied", "Screening", "QA Review", "Offer"].entries()) assert.equal(await (await visible(By.css(`[aria-label="Stage ${index + 1}"]`))).getAttribute("value"), name);
    await screenshot("TC-S08-stage-configuration.png");
  },
  async () => {
    await go("/candidates/new");
    await (await visible(By.css(`select[name="vacancy_id"] option[value="${vacancyId}"]`))).click();
    for (const [name, value] of Object.entries({ full_name: candidateName, email: candidateEmail, phone: "+1 202 555 0100", source: "Synthetic Selenium QA", notes: "COMP50074 automated evidence only" })) await fill(name, value);
    await button("Create candidate"); await route(/^\/candidates\/[0-9a-f-]{36}$/);
    candidateId = new URL(await browser().getCurrentUrl()).pathname.split("/").pop()!;
    assert.equal(await (await visible(By.css("h1"))).getText(), candidateName);
    await text(title); await text("Applied"); await text("Candidate record created");
    await screenshot("TC-S09-candidate-created.png");
  },
  async () => {
    await browser().findElement(By.css('input[type="file"]')).sendKeys(path.resolve("e2e/fixtures/test-cv.pdf"));
    await button("Attach or replace CV"); await text("CV attached."); await text("Candidate CV attached");
    await browser().navigate().refresh(); await visible(By.linkText("Download test-cv.pdf"));
    await screenshot("TC-S10-cv-uploaded.png");
  },
  async () => {
    await go(`/pipeline/${vacancyId}`); await visible(By.css("h1"));
    assert.equal((await browser().findElements(By.css(`a[href="/candidates/${candidateId}"]`))).length, 1);
    await visible(By.xpath(`//section[h2[starts-with(normalize-space(.),'Applied')]]//a[@href='/candidates/${candidateId}']`));
    await screenshot("TC-S11-pipeline.png");
  },
  async () => {
    await go(`/candidates/${candidateId}`); await button("Move to Screening"); await text("Candidate moved to the next recruitment stage");
    await browser().navigate().refresh(); await visible(By.xpath("//h3[.='Current stage']/following-sibling::p[.='Screening']"));
    await screenshot("TC-S12-stage-transition.png");
  },
  async () => {
    testStep = "Inspect the visible candidate outcome select and rendered option values";
    const outcomeControl = await visible(By.css('select[name="outcome"][aria-label="Candidate outcome"]'));
    const options = await outcomeControl.findElements(By.css("option"));
    const renderedOptions = await Promise.all(options.map(async option => ({
      text: await option.getText(),
      value: await option.getAttribute("value"),
      valueAttribute: await browser().executeScript("return arguments[0].getAttribute('value')", option)
    })));
    console.log(`TC-S13 outcome DOM: ${sanitize(JSON.stringify({ tag: await outcomeControl.getTagName(), name: await outcomeControl.getAttribute("name"), id: await outcomeControl.getAttribute("id"), options: renderedOptions }))}`);
    assert.deepEqual(renderedOptions.map(option => option.text), ["ON_HOLD", "HIRED", "REJECTED"]);
    assert.deepEqual(renderedOptions.map(option => option.value), ["ON_HOLD", "HIRED", "REJECTED"]);
    testStep = "Select ON_HOLD by visible option text";
    await new Select(outcomeControl).selectByVisibleText("ON_HOLD");
    assert.equal(await outcomeControl.getAttribute("value"), "ON_HOLD");
    testStep = "Submit and accept outcome confirmation";
    await button("Confirm outcome"); await browser().wait(until.alertIsPresent(), 5000); await browser().switchTo().alert().accept();
    await text("Candidate outcome recorded as ON HOLD");
    testStep = "Reload candidate and verify persisted ON_HOLD outcome and activity";
    await browser().navigate().refresh();
    assert.equal(new URL(await browser().getCurrentUrl()).pathname, `/candidates/${candidateId}`);
    const outcomeBadge = await visible(By.xpath("//main//h1/preceding-sibling::span[contains(@class,'badge')]"));
    assert.equal(await outcomeBadge.getText(), "ON_HOLD");
    assert.equal(await (await visible(By.css('select[name="outcome"][aria-label="Candidate outcome"]'))).getAttribute("value"), "ON_HOLD");
    await visible(By.xpath("//section[h2[.='Activity timeline']]//li/strong[normalize-space(.)='Candidate outcome recorded as ON HOLD']"));
    await screenshot("TC-S13-outcome.png");
  },
  async () => {
    const timeline = await visible(By.xpath("//section[h2[.='Activity timeline']]"));
    const events = await timeline.findElements(By.css("li strong"));
    assert.deepEqual(await Promise.all(events.map(e => e.getText())), ["Candidate outcome recorded as ON HOLD", "Candidate moved to the next recruitment stage", "Candidate CV attached", "Candidate record created"]);
    for (const row of await timeline.findElements(By.css("li .muted"))) assert.match(await row.getText(), /\S.+ · \S/);
    await browser().executeScript("arguments[0].scrollIntoView({block:'center'})", timeline);
    await screenshot("TC-S14-activity-timeline.png");
  }
];
async function main() {
  await mkdir(runDirectory, { recursive: true });
  try {
    const missing = ["HR", "INTERVIEWER", "MANAGEMENT"].flatMap(role => ["EMAIL", "PASSWORD"].map(field => `SELENIUM_${role}_${field}`)).filter(key => !process.env[key]);
    await ensureServer();
    const options = new chrome.Options();
    options.addArguments("--headless=new", "--window-size=1600,1200");
    driver = await new Builder().forBrowser("chrome").setChromeOptions(options).build();
    await browser().manage().setTimeouts({ pageLoad: 60_000, script: 20_000 });
    for (const [index, step] of steps.entries()) {
      if (index === 2 && missing.length) {
        infrastructure = `Authenticated cases blocked by missing .env.local variables: ${missing.join(", ")}`;
        break;
      }
      active = results[index];
      testStep = active.description;
      try { await step(); active.result = "PASS"; console.log(`${active.id}: PASS`); }
      catch (error) { active.result = "FAIL"; await diagnoseFailure(error); break; }
    }
  } catch { if (infrastructure === "Ready") infrastructure = "Browser/server setup failed; check Chrome and local server availability."; }
  finally {
    try { await cleanup(); } catch { cleanupStatus = `Cleanup failed; inspect only '${title}' / '${candidateEmail}'.`; process.exitCode = 1; }
    try { await driver?.quit(); } catch { process.exitCode = 1; }
    server?.kill("SIGTERM");
    const passed = results.filter(r => r.result === "PASS").length;
    const failed = results.filter(r => r.result === "FAIL").length;
    const notRun = results.filter(r => r.result === "NOT RUN").length;
    const report = `# HireLens Sprint 1 Selenium evidence\n\nRun: ${runId}\n\n${passed} passed / ${failed} failed / ${notRun} not run.\n\nSetup: ${infrastructure}\n\n| Test Case ID | Description | Result | Screenshot |\n| --- | --- | --- | --- |\n${results.map(r => `| ${r.id} | ${r.description} | ${r.result} | ${r.screenshots.map(s => `[${path.basename(s)}](${s})`).join("<br>") || "None — not captured"} |`).join("\n")}\n\nCleanup: ${cleanupStatus}\n\nScreenshots follow successful assertions only; a case with multiple screenshots can still fail a later assertion. No screenshots are fabricated. Each run uses a separate directory to avoid stale evidence.\n\nSee [runner instructions](../../../selenium/README.md).\n`;
    await writeFile(path.join(evidence, "README.md"), report.replace(
      "Screenshots follow successful assertions only; a case with multiple screenshots can still fail a later assertion.",
      "Normal screenshots follow successful assertions. FAILED-TC-SXX.png captures the browser at failure and is diagnostic evidence, not a passed assertion. A case with multiple screenshots can still fail a later assertion."
    ));
    await writeFile(path.join(runDirectory, "results.json"), JSON.stringify({ runId, infrastructure, cleanupStatus, results }, null, 2));
    console.log(`${passed} PASS / ${failed} FAIL / ${notRun} NOT RUN\n${infrastructure}\n${cleanupStatus}`);
    if (failed || notRun) process.exitCode = 1;
  }
}
main().catch(() => { console.error("Selenium runner failed; no sensitive error details emitted."); process.exitCode = 1; });
