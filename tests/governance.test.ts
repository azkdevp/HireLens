import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { progressionOverrideSchema } from "@/lib/validation";

const migration = readFileSync(resolve("supabase/migrations/202609120003_governance.sql"), "utf8");
const candidatePage = readFileSync(resolve("app/(protected)/candidates/[id]/page.tsx"), "utf8");
const governanceComponent = readFileSync(resolve("components/governance-progression.tsx"), "utf8");
const feedbackPage = readFileSync(resolve("app/(protected)/interviews/[id]/feedback/page.tsx"), "utf8");
const action = readFileSync(resolve("app/(protected)/actions.ts"), "utf8");

describe("Phase D governance contracts", () => {
  it("requires a deliberate, bounded override reason and confirmation", () => {
    const base = { candidate_id:crypto.randomUUID(), target_stage_id:crypto.randomUUID(), confirmation:"confirmed" };
    expect(progressionOverrideSchema.safeParse({ ...base, override_reason:"   " }).success).toBe(false);
    expect(progressionOverrideSchema.safeParse({ ...base, override_reason:"Evidence exception approved." }).success).toBe(true);
    expect(progressionOverrideSchema.safeParse({ ...base, override_reason:"Valid reason", confirmation:"" }).success).toBe(false);
    expect(progressionOverrideSchema.safeParse({ ...base, override_reason:"x".repeat(2001) }).success).toBe(false);
  });

  it("uses the authoritative move_candidate RPC for override", () => {
    expect(action).toContain('requireProfile(["HR_RECRUITER"])');
    expect(action).toContain('supabase.rpc("move_candidate"');
    expect(action).toContain("p_override:true");
    expect(action).toContain("p_override_reason:parsed.data.override_reason");
  });

  it("renders explicit readiness and missing-evidence language", () => {
    for (const text of ["Decision readiness", "Progression requirements", "BLOCKED", "Candidate cannot progress yet", "required feedback submission"])
      expect(candidatePage + governanceComponent).toContain(text);
  });

  it("keeps normal and exceptional progression visually distinct", () => {
    expect(candidatePage).toContain("Progress to {next.name}");
    expect(candidatePage).toContain("GovernanceProgression");
    expect(candidatePage).toContain("Progression override history");
  });

  it("renders override reasons distinctly in candidate history", () => {
    expect(candidatePage).toContain('log.action === "PROGRESSION_OVERRIDDEN"');
    expect(candidatePage).toContain("Reason: {log.metadata.reason}");
  });

  it("does not offer governance mutation controls to Management", () => {
    expect(candidatePage).toContain('const hr = profile.role === "HR_RECRUITER"');
    expect(candidatePage).toContain("Recruitment progression is restricted to HR recruiters.");
  });

  it("does not reveal peers before own submission", () => {
    expect(feedbackPage).toContain('if (existing?.status === "SUBMITTED")');
    expect(feedbackPage).toContain("Other interviewer feedback will become available only after you submit your own evaluation");
  });

  it("queries only submitted peer feedback for the same interview", () => {
    expect(feedbackPage).toContain('.eq("interview_id", id).eq("status", "SUBMITTED").neq("author_profile_id", profile.id)');
    expect(feedbackPage).toContain("Draft feedback is never shared");
  });

  it("narrows database peer release to a submitted evaluation on the same interview", () => {
    expect(migration).toContain("has_submitted_own_interview_feedback(interview_id)");
    expect(migration).toContain("and interview_id is not null");
    expect(migration).toContain("and author_role = 'INTERVIEWER'");
    expect(migration).toContain("and status = 'SUBMITTED'");
  });

  it("preserves HR and Management submitted-evidence access", () => {
    expect(migration).toContain("public.current_role() in ('HR_RECRUITER', 'MANAGEMENT') and status = 'SUBMITTED'");
  });

  it("keeps the narrow helper unavailable to anonymous users", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("revoke all on function public.has_submitted_own_interview_feedback(uuid) from public, anon");
  });
});
