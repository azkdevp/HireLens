import { describe,expect,it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { agreementSummary,criterionAverages,DISAGREEMENT_THRESHOLD,evaluationOverall,humanEvaluationAverage,type SubmittedEvaluation } from "@/lib/decision-support";

const decisionRoom=readFileSync(resolve("app/(protected)/candidates/[id]/decision-room/page.tsx"),"utf8");
const comparison=readFileSync(resolve("app/(protected)/vacancies/[id]/compare/page.tsx"),"utf8");
const foundation=readFileSync(resolve("supabase/migrations/202609110001_sprint2_foundation.sql"),"utf8");
const evaluation=(id:string,score:number,criterionId="technical"):SubmittedEvaluation=>({id,candidate_id:"candidate",stage_id:"stage",interview_id:"interview",remarks:"Evidence",strengths:"",concerns:"",submitted_at:new Date().toISOString(),feedback_ratings:[{criterion_id:criterionId,criterion_name:"Technical Skills",criterion_weight:null,rating:score}]});

describe("Phase E decision support",()=>{
  it("uses the approved transparent threshold",()=>expect(DISAGREEMENT_THRESHOLD).toBe(1.5));
  it("keeps a difference below 1.5 in general agreement",()=>expect(agreementSummary([evaluation("a",4),evaluation("b",3)]).status).toBe("AGREEMENT"));
  it("requires human review at exactly 1.5",()=>expect(agreementSummary([evaluation("a",4.5),evaluation("b",3)]).status).toBe("REVIEW"));
  it("requires human review above 1.5",()=>expect(agreementSummary([evaluation("a",5),evaluation("b",2)]).status).toBe("REVIEW"));
  it("does not fabricate agreement from insufficient evidence",()=>expect(agreementSummary([evaluation("a",4)]).status).toBe("INSUFFICIENT"));
  it("calculates weighted and unweighted human evaluations transparently",()=>{expect(evaluationOverall([{criterion_id:"a",criterion_name:"A",criterion_weight:60,rating:5},{criterion_id:"b",criterion_name:"B",criterion_weight:40,rating:3}])).toBe(4.2);expect(humanEvaluationAverage([evaluation("a",5),evaluation("b",3)])).toBe(4)});
  it("aligns comparison ratings by criterion identity rather than position",()=>{const averages=criterionAverages([evaluation("a",4,"criterion-a"),evaluation("b",2,"criterion-b")]);expect(averages.get("criterion-a")?.average).toBe(4);expect(averages.get("criterion-b")?.average).toBe(2)});
  it("uses the existing submitted-only disagreement function",()=>{expect(foundation).toContain("create function public.feedback_disagreement");expect(foundation).toContain("interview_assignment_id is not null and f.status = 'SUBMITTED'");expect(decisionRoom).toContain('s.rpc("feedback_disagreement"')});
  it("excludes drafts, HR remarks and unrelated candidates from Decision Room inputs",()=>{expect(decisionRoom).toContain('.eq("candidate_id",id).eq("stage_id",c.current_stage_id).eq("status","SUBMITTED").eq("author_role","INTERVIEWER").not("interview_id","is",null)')});
  it("restricts Decision Room and comparison to HR and Management",()=>{for(const page of [decisionRoom,comparison])expect(page).toContain('requireProfile(["HR_RECRUITER","MANAGEMENT"])')});
  it("rejects cross-vacancy candidate identifiers",()=>{expect(comparison).toContain("Candidates must belong to the same vacancy");expect(comparison).toContain("requested.some(candidateId=>!allowed.has(candidateId))")});
  it("requires at least two candidates",()=>expect(comparison).toContain("Select at least two candidates to compare"));
  it("shows missing criterion evidence as not assessed",()=>{expect(comparison).toContain("Not assessed");expect(comparison).not.toContain("score??0")});
  it("reuses Phase D readiness and completion",()=>{expect(decisionRoom).toContain('s.rpc("feedback_completion"');expect(comparison).toContain('s.rpc("feedback_completion"')});
  it("reuses source stage evidence and progression overrides",()=>{expect(decisionRoom).toContain('s.rpc("candidate_feedback_evidence"');expect(decisionRoom).toContain('s.from("progression_overrides")')});
  it("contains no automated winner or recommendation language",()=>{for(const forbidden of ["Top Candidate","Recommended Hire","Recommended Reject","Success Probability","AI Recommendation"])expect(decisionRoom+comparison).not.toContain(forbidden)});
  it("states that humans retain the decision",()=>{expect(decisionRoom).toContain("HR and Management remain responsible for the hiring decision");expect(comparison).toContain("Humans make the decision")});
});
