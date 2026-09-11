import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sql = readFileSync(resolve("supabase/migrations/202609110001_sprint2_foundation.sql"), "utf8");
const fixSql = readFileSync(resolve("supabase/migrations/202609110002_sprint2_foundation_fix.sql"), "utf8");

describe("Sprint 2 Phase A database contract", () => {
  it("creates the approved foundation tables without a duplicate stage remarks table", () => {
    for (const table of ["interviews", "interview_assignments", "evaluation_criteria", "feedback_submissions", "feedback_ratings", "notifications", "progression_overrides", "audit_events"])
      expect(sql).toContain(`create table public.${table}`);
    expect(sql).not.toContain("create table public.stage_remarks");
  });

  it("supports vacancy-wide and stage-specific criteria with explicit precedence", () => {
    expect(sql).toContain("stage_id uuid,");
    expect(sql).toContain("then p_stage_id else null end");
    expect(sql).toContain("Active criterion weights must all be set and total 100 percent");
  });

  it("uses the locked interview lifecycle", () => {
    expect(sql).toContain("('SCHEDULED', 'COMPLETED', 'CANCELLED')");
    expect(sql).not.toContain("RESCHEDULED");
  });

  it("enforces candidate, vacancy and stage consistency through composite foreign keys", () => {
    expect(sql).toContain("interviews_candidate_vacancy_fk");
    expect(sql).toContain("interviews_stage_vacancy_fk");
    expect(sql).toContain("feedback_interview_context_fk");
  });

  it("validates that only Interviewer profiles are assigned by HR", () => {
    expect(sql).toContain("Only INTERVIEWER profiles may be assigned");
    expect(sql).toContain("Only HR recruiters may assign interviewers");
  });

  it("locks submitted feedback and ratings", () => {
    expect(sql).toContain("Submitted feedback is locked");
    expect(sql).toContain("Submitted feedback ratings are locked");
    expect(sql).toContain("All required evaluation ratings must be completed before submission");
  });

  it("keeps non-interview stage remarks narrative-only", () => {
    expect(sql).toContain("Non-interview stage remarks do not accept numerical ratings");
    expect(sql).toContain("if new.interview_assignment_id is not null then");
  });

  it("enforces independent feedback in the database policy", () => {
    expect(sql).toContain("create policy feedback_independent_read");
    expect(sql).toContain("public.has_submitted_own_feedback(candidate_id, stage_id)");
  });

  it("uses a narrow RLS-safe helper for assigned-interview visibility", () => {
    expect(fixSql).toContain("create function public.is_assigned_to_interview(p_interview_id uuid)");
    expect(fixSql).toContain("assignment.interviewer_profile_id = public.current_profile_id()");
    expect(fixSql).toContain("or public.is_assigned_to_interview(id)");
    expect(fixSql).toContain("revoke all on function public.is_assigned_to_interview(uuid) from public, anon");
    expect(fixSql).toContain("grant execute on function public.is_assigned_to_interview(uuid) to authenticated");
  });

  it("limits notification reads to the recipient and writes to read_at", () => {
    expect(sql).toContain("recipient_profile_id = public.current_profile_id()");
    expect(sql).toContain("grant update (read_at) on public.notifications to authenticated");
  });

  it("keeps audit and override evidence append-only", () => {
    expect(sql).toContain("revoke insert, update, delete on public.progression_overrides from authenticated");
    expect(sql).toContain("revoke insert, update, delete on public.audit_events from authenticated");
  });

  it("replaces rather than leaves the old transition RPC", () => {
    expect(sql).toContain("drop function public.move_candidate(uuid, uuid)");
    expect(sql).toContain("p_override boolean default false");
    expect(sql).toContain("p_override_reason text default null");
  });

  it("retains every Sprint 1 transition protection", () => {
    for (const protection of ["if not public.is_hr()", "for update", "Closed candidates cannot change stage", "vacancy_id = c.vacancy_id", "target_order <> current_order + 1", "candidate_stage_history", "STAGE_CHANGED"])
      expect(sql).toContain(protection);
  });

  it("uses the exact required-feedback gate and ignores cancelled interviews", () => {
    expect(sql).toContain("a.feedback_required");
    expect(sql).toContain("f.status = 'SUBMITTED'");
    expect(sql).toContain("i.status <> 'CANCELLED'");
    expect(sql).toContain("Candidate cannot progress");
  });

  it("requires an accountable override reason and records evidence atomically", () => {
    expect(sql).toContain("Override reason is required");
    expect(sql).toContain("insert into public.progression_overrides");
    expect(sql).toContain("PROGRESSION_OVERRIDDEN");
  });

  it("documents the transparent disagreement threshold without deciding an outcome", () => {
    expect(sql).toContain("when this 1-5 score range is >= 1.5");
    expect(sql).toContain("Never changes candidate outcome");
  });

  it("preserves the three-role model", () => {
    expect(sql).not.toContain("HIRING_MANAGER");
    expect(sql).toContain("'MANAGEMENT'");
  });

  it("enables RLS for every new data table", () => {
    for (const table of ["interviews", "interview_assignments", "evaluation_criteria", "feedback_submissions", "feedback_ratings", "notifications", "progression_overrides", "audit_events"])
      expect(sql).toContain(`alter table public.${table} enable row level security`);
  });
});
