# Sprint 1 Selenium assessment tests

This independent Selenium WebDriver suite supplements (does not replace) Vitest and Playwright. It covers TC-S01–TC-S14 using Chrome in headless mode and TypeScript via the existing `tsx` runtime.

## Setup and execution

1. Install declared dependencies with `npm install` and install Google Chrome/Chromium. Selenium Manager resolves the matching driver automatically; its first run may need network access.
2. Copy the seven `SELENIUM_*` entries from `.env.example` into the ignored `.env.local`. Supply existing HR, Interviewer and Management login credentials locally. Do not commit them. There are no credential fallbacks.
3. Run `npm run test:selenium:sprint1`. The runner reuses a reachable configured application or starts a local Next development server for a localhost URL. It shuts down only the server it started. Remote URLs must already be running.

Missing credentials or browser setup failure produces a nonzero exit with NOT RUN results, never false passes. The two unauthenticated cases can still execute without credentials; authenticated cases require all six credential values. Dependent tests stop after the first failure. Error output deliberately omits raw WebDriver payloads, which can contain credentials.

## Evidence and cleanup

The generated `test-evidence/sprint1/selenium/README.md` contains actual results and screenshot links. Each execution has a unique timestamp/UUID directory with its own screenshots and `results.json`. Screenshots are taken only after assertions succeed, and password fields are cleared before capturing. Review evidence before sharing because dashboard counts/account names may be visible.

The suite creates a uniquely named synthetic vacancy and candidate, explicitly selects that vacancy, and uploads the existing synthetic `e2e/fixtures/test-cv.pdf`. It never changes seeded passwords, real vacancies or manual candidates. The existing service-role environment key is used only by the Node runner for exact per-run cleanup; it is never passed into browser JavaScript. All tested recruitment actions use normal UI permissions. If cleanup credentials are absent or cleanup fails, the report identifies the precise synthetic records requiring manual removal. No reset, truncation or broad prefix deletion is used.

These browser checks demonstrate UI behavior; the existing connected Vitest security suite remains responsible for direct RLS/RPC bypass testing. No application code, RLS policy or migration is changed by adding Selenium.
