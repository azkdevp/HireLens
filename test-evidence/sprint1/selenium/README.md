# HireLens Sprint 1 Selenium evidence

Run: 2026-08-27T08-39-48-018Z-6a6f0345

14 passed / 0 failed / 0 not run.

Setup: Ready

| Test Case ID | Description | Result | Screenshot |
| --- | --- | --- | --- |
| TC-S01 | Unauthenticated dashboard redirects to login | PASS | [TC-S01-route-protection.png](2026-08-27T08-39-48-018Z-6a6f0345/TC-S01-route-protection.png) |
| TC-S02 | Invalid login safely rejected | PASS | [TC-S02-invalid-login.png](2026-08-27T08-39-48-018Z-6a6f0345/TC-S02-invalid-login.png) |
| TC-S03 | HR login opens HR dashboard | PASS | [TC-S03-hr-login.png](2026-08-27T08-39-48-018Z-6a6f0345/TC-S03-hr-login.png) |
| TC-S04 | Interviewer read-only access and HR-route denial | PASS | [TC-S04-interviewer-readonly.png](2026-08-27T08-39-48-018Z-6a6f0345/TC-S04-interviewer-readonly.png)<br>[TC-S04-interviewer-access-denied.png](2026-08-27T08-39-48-018Z-6a6f0345/TC-S04-interviewer-access-denied.png) |
| TC-S05 | Management read-only access and HR-route denial | PASS | [TC-S05-management-readonly.png](2026-08-27T08-39-48-018Z-6a6f0345/TC-S05-management-readonly.png)<br>[TC-S05-management-access-denied.png](2026-08-27T08-39-48-018Z-6a6f0345/TC-S05-management-access-denied.png) |
| TC-S06 | Create synthetic vacancy | PASS | [TC-S06-vacancy-created.png](2026-08-27T08-39-48-018Z-6a6f0345/TC-S06-vacancy-created.png) |
| TC-S07 | Vacancy details persist | PASS | [TC-S07-vacancy-details.png](2026-08-27T08-39-48-018Z-6a6f0345/TC-S07-vacancy-details.png) |
| TC-S08 | Configure recruitment stages and persist order | PASS | [TC-S08-stage-configuration.png](2026-08-27T08-39-48-018Z-6a6f0345/TC-S08-stage-configuration.png) |
| TC-S09 | Create candidate associated with the synthetic vacancy | PASS | [TC-S09-candidate-created.png](2026-08-27T08-39-48-018Z-6a6f0345/TC-S09-candidate-created.png) |
| TC-S10 | Upload synthetic PDF CV | PASS | [TC-S10-cv-uploaded.png](2026-08-27T08-39-48-018Z-6a6f0345/TC-S10-cv-uploaded.png) |
| TC-S11 | Candidate appears exactly once in Applied pipeline stage | PASS | [TC-S11-pipeline.png](2026-08-27T08-39-48-018Z-6a6f0345/TC-S11-pipeline.png) |
| TC-S12 | Move Applied to Screening and reload | PASS | [TC-S12-stage-transition.png](2026-08-27T08-39-48-018Z-6a6f0345/TC-S12-stage-transition.png) |
| TC-S13 | Record ON_HOLD and reload | PASS | [TC-S13-outcome.png](2026-08-27T08-39-48-018Z-6a6f0345/TC-S13-outcome.png) |
| TC-S14 | Activity timeline contains journey events | PASS | [TC-S14-activity-timeline.png](2026-08-27T08-39-48-018Z-6a6f0345/TC-S14-activity-timeline.png) |

Cleanup: Removed only this run's synthetic vacancy, candidate, CV, stages and dependent audit records.

Normal screenshots follow successful assertions. FAILED-TC-SXX.png captures the browser at failure and is diagnostic evidence, not a passed assertion. A case with multiple screenshots can still fail a later assertion. No screenshots are fabricated. Each run uses a separate directory to avoid stale evidence.

See [runner instructions](../../../selenium/README.md).
