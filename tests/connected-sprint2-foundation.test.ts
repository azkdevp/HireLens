// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const service = createClient(url, serviceKey, { auth: { persistSession: false } });

let hr: SupabaseClient;
let interviewerA: SupabaseClient;
let interviewerB: SupabaseClient;
let management: SupabaseClient;
let hrProfileId = "";
let interviewerAProfileId = "";
let interviewerBProfileId = "";
let managementProfileId = "";
let interviewerBUserId = "";
let vacancyId = "";
let stageIds: string[] = [];
let candidateIds: string[] = [];
let interviewIds: string[] = [];
let assignmentIds: string[] = [];
let overrideAssignmentId = "";
let criterionIds: string[] = [];
const feedbackIds: string[] = [];

async function authenticated(email: string, password: string) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

async function profileId(client: SupabaseClient) {
  const { data: auth } = await client.auth.getUser();
  const { data, error } = await service.from("user_profiles").select("id").eq("authentication_user_id", auth.user!.id).single();
  if (error) throw error;
  return data.id as string;
}

describe.sequential("connected Supabase Sprint 2 Phase A security", () => {
  beforeAll(async () => {
    const schemaProbe = await service.from("interviews").select("id").limit(1);
    if (schemaProbe.error) throw new Error("Apply supabase/migrations/202609110001_sprint2_foundation.sql before running connected Phase A tests.");

    [hr, interviewerA, management] = await Promise.all([
      authenticated(process.env.E2E_HR_EMAIL!, process.env.E2E_HR_PASSWORD!),
      authenticated("interviewer@hirelens.demo", process.env.SEED_INTERVIEWER_PASSWORD!),
      authenticated("management@hirelens.demo", process.env.SEED_MANAGEMENT_PASSWORD!)
    ]);
    [hrProfileId, interviewerAProfileId, managementProfileId] = await Promise.all([
      profileId(hr), profileId(interviewerA), profileId(management)
    ]);

    const suffix = crypto.randomUUID();
    const password = `PhaseA#${crypto.randomUUID()}aA1`;
    const email = `phase-a-interviewer-${suffix}@hirelens.test`;
    const { data: createdUser, error: userError } = await service.auth.admin.createUser({ email, password, email_confirm: true });
    if (userError) throw userError;
    interviewerBUserId = createdUser.user.id;
    const { data: createdProfile, error: profileError } = await service.from("user_profiles")
      .insert({ authentication_user_id: interviewerBUserId, full_name: "Phase A Interviewer", role: "INTERVIEWER" }).select("id").single();
    if (profileError) throw profileError;
    interviewerBProfileId = createdProfile.id;
    interviewerB = await authenticated(email, password);

    const { data: vacancy, error: vacancyError } = await service.from("vacancies").insert({
      title: `Phase A Foundation ${suffix}`, department: "Quality Assurance", location: "Colombo",
      employment_type: "FULL_TIME", description: "Disposable Sprint 2 Phase A connected security fixture.", created_by: hrProfileId
    }).select("id").single();
    if (vacancyError) throw vacancyError;
    vacancyId = vacancy.id;

    const { data: stages, error: stagesError } = await service.from("vacancy_stages")
      .insert(["Applied", "Technical Interview", "Offer"].map((name, stage_order) => ({ vacancy_id: vacancyId, name, stage_order })))
      .select("id,stage_order").order("stage_order");
    if (stagesError) throw stagesError;
    stageIds = stages.map(stage => stage.id);

    const { data: candidates, error: candidatesError } = await service.from("candidates").insert(
      ["gated", "cancelled", "override"].map(label => ({
        vacancy_id: vacancyId, current_stage_id: stageIds[0], full_name: `Phase A ${label}`,
        email: `${label}-${suffix}@example.com`, phone: "+94 77 000 0000", source: "QA", notes: "Disposable fixture", created_by: hrProfileId
      }))
    ).select("id,email");
    if (candidatesError) throw candidatesError;
    candidateIds = ["gated", "cancelled", "override"].map(label => candidates.find(candidate => candidate.email.startsWith(`${label}-`))!.id);

    const scheduled = new Date(Date.now() + 86_400_000).toISOString();
    const { data: interviews, error: interviewsError } = await service.from("interviews").insert([
      { candidate_id: candidateIds[0], vacancy_id: vacancyId, stage_id: stageIds[0], scheduled_at: scheduled, timezone: "Asia/Colombo", method: "VIDEO", meeting_link: "https://example.com/phase-a", status: "SCHEDULED", created_by: hrProfileId },
      { candidate_id: candidateIds[1], vacancy_id: vacancyId, stage_id: stageIds[0], scheduled_at: scheduled, timezone: "Asia/Colombo", method: "PHONE", status: "CANCELLED", cancelled_at: new Date().toISOString(), created_by: hrProfileId },
      { candidate_id: candidateIds[2], vacancy_id: vacancyId, stage_id: stageIds[0], scheduled_at: scheduled, timezone: "Asia/Colombo", method: "VIDEO", status: "SCHEDULED", created_by: hrProfileId }
    ]).select("id,candidate_id");
    if (interviewsError) throw interviewsError;
    interviewIds = candidateIds.map(id => interviews.find(interview => interview.candidate_id === id)!.id);

    const { data: assignments, error: assignmentsError } = await service.from("interview_assignments").insert([
      { interview_id: interviewIds[0], interviewer_profile_id: interviewerAProfileId, assigned_by: hrProfileId, feedback_required: true },
      { interview_id: interviewIds[0], interviewer_profile_id: interviewerBProfileId, assigned_by: hrProfileId, feedback_required: true },
      { interview_id: interviewIds[1], interviewer_profile_id: interviewerAProfileId, assigned_by: hrProfileId, feedback_required: true },
      { interview_id: interviewIds[2], interviewer_profile_id: interviewerAProfileId, assigned_by: hrProfileId, feedback_required: true }
    ]).select("id,interview_id,interviewer_profile_id");
    if (assignmentsError) throw assignmentsError;
    assignmentIds = assignments.map(assignment => assignment.id);
    overrideAssignmentId = assignments.find(assignment => assignment.interview_id === interviewIds[2])!.id;

    const { error: vacancyCriterionError } = await service.from("evaluation_criteria").insert({
      vacancy_id: vacancyId, stage_id: null, name: "Role Fit", display_order: 0, rating_required: true, active: true, created_by: hrProfileId
    });
    if (vacancyCriterionError) throw vacancyCriterionError;
    const { data: criteria, error: criteriaError } = await service.from("evaluation_criteria").insert([
      { vacancy_id: vacancyId, stage_id: stageIds[0], name: "Technical Skills", weight: 50, display_order: 0, rating_required: true, active: true, created_by: hrProfileId },
      { vacancy_id: vacancyId, stage_id: stageIds[0], name: "Communication", weight: 50, display_order: 1, rating_required: true, active: true, created_by: hrProfileId }
    ]).select("id,display_order").order("display_order");
    if (criteriaError) throw criteriaError;
    criterionIds = criteria.map(criterion => criterion.id);

    const feedbackRows = [
      { client: interviewerA, author: interviewerAProfileId, assignment: assignments.find(a => a.interview_id === interviewIds[0] && a.interviewer_profile_id === interviewerAProfileId)!.id, remarks: "Strong evidence from interviewer A." },
      { client: interviewerB, author: interviewerBProfileId, assignment: assignments.find(a => a.interview_id === interviewIds[0] && a.interviewer_profile_id === interviewerBProfileId)!.id, remarks: "Different evidence from interviewer B." }
    ];
    for (const row of feedbackRows) {
      const { data: feedback, error } = await row.client.from("feedback_submissions").insert({
        candidate_id: candidateIds[0], vacancy_id: vacancyId, stage_id: stageIds[0], interview_id: interviewIds[0],
        interview_assignment_id: row.assignment, author_profile_id: row.author, author_role: "INTERVIEWER", remarks: row.remarks
      }).select("id").single();
      if (error) throw error;
      feedbackIds.push(feedback.id);
    }
  }, 60_000);

  afterAll(async () => {
    if (feedbackIds.length) {
      await service.from("feedback_ratings").delete().in("feedback_submission_id", feedbackIds);
      await service.from("feedback_submissions").delete().in("id", feedbackIds);
    }
    for (const table of ["notifications", "progression_overrides", "audit_events", "activity_logs", "candidate_stage_history"])
      if (candidateIds.length) await service.from(table).delete().in("candidate_id", candidateIds);
    if (assignmentIds.length) await service.from("interview_assignments").delete().in("id", assignmentIds);
    if (interviewIds.length) await service.from("interviews").delete().in("id", interviewIds);
    if (criterionIds.length || vacancyId) await service.from("evaluation_criteria").delete().eq("vacancy_id", vacancyId);
    if (candidateIds.length) await service.from("candidates").delete().in("id", candidateIds);
    if (stageIds.length) await service.from("vacancy_stages").delete().in("id", stageIds);
    if (vacancyId) await service.from("vacancies").delete().eq("id", vacancyId);
    if (interviewerBProfileId) await service.from("user_profiles").delete().eq("id", interviewerBProfileId);
    if (interviewerBUserId) await service.auth.admin.deleteUser(interviewerBUserId);
    await Promise.all([hr?.auth.signOut(), interviewerA?.auth.signOut(), interviewerB?.auth.signOut(), management?.auth.signOut()]);
  }, 60_000);

  it("enforces legitimate interviewer assignment and assignment-scoped reads", async () => {
    const invalid = await service.from("interview_assignments").insert({
      interview_id: interviewIds[0], interviewer_profile_id: managementProfileId, assigned_by: hrProfileId, feedback_required: true
    });
    expect(invalid.error?.message).toContain("Only INTERVIEWER profiles may be assigned");

    const { data: fixtureAssignment, error: fixtureError } = await service.from("interview_assignments")
      .select("interviewer_profile_id")
      .eq("interview_id", interviewIds[0])
      .eq("interviewer_profile_id", interviewerAProfileId)
      .single();
    expect(fixtureError).toBeNull();
    expect(fixtureAssignment?.interviewer_profile_id).toBe(interviewerAProfileId);

    const { data: ownAssignment, error: ownAssignmentError } = await interviewerA.from("interview_assignments")
      .select("interviewer_profile_id")
      .eq("interview_id", interviewIds[0]);
    expect(ownAssignmentError).toBeNull();
    expect(ownAssignment).toEqual([{ interviewer_profile_id: interviewerAProfileId }]);

    const { data: assigned } = await interviewerA.from("interviews").select("id").eq("id", interviewIds[0]);
    expect(assigned).toHaveLength(1);
    const { data: unassigned } = await interviewerB.from("interviews").select("id").eq("id", interviewIds[2]);
    expect(unassigned).toEqual([]);
  });

  it("uses stage-specific criteria before vacancy-wide criteria and rejects invalid active weights", async () => {
    const { data: effective, error } = await hr.rpc("effective_evaluation_criteria", { p_vacancy_id: vacancyId, p_stage_id: stageIds[0] });
    expect(error).toBeNull();
    expect(effective.map((criterion: { name: string }) => criterion.name)).toEqual(["Technical Skills", "Communication"]);

    const invalid = await service.from("evaluation_criteria").insert({
      vacancy_id: vacancyId, stage_id: stageIds[2], name: "Invalid Partial Weight", weight: 40,
      display_order: 0, rating_required: true, active: true, created_by: hrProfileId
    });
    expect(invalid.error?.message).toContain("total 100 percent");
  });

  it("rejects unassigned feedback and keeps peer drafts independent", async () => {
    const unassigned = await interviewerB.from("feedback_submissions").insert({
      candidate_id: candidateIds[2], vacancy_id: vacancyId, stage_id: stageIds[0], interview_id: interviewIds[2],
      interview_assignment_id: overrideAssignmentId, author_profile_id: interviewerBProfileId,
      author_role: "INTERVIEWER", remarks: "This must not be accepted."
    });
    expect(unassigned.error).toBeTruthy();

    const { data: aView } = await interviewerA.from("feedback_submissions").select("id").eq("candidate_id", candidateIds[0]);
    const { data: bView } = await interviewerB.from("feedback_submissions").select("id").eq("candidate_id", candidateIds[0]);
    expect(aView?.map(row => row.id)).toEqual([feedbackIds[0]]);
    expect(bView?.map(row => row.id)).toEqual([feedbackIds[1]]);
  });

  it("blocks progression until every required active-interview assignment is submitted", async () => {
    const blocked = await hr.rpc("move_candidate", { p_candidate_id: candidateIds[0], p_target_stage_id: stageIds[1] });
    expect(blocked.error?.message).toContain("2 required feedback submission(s) pending");

    for (const [index, client] of [interviewerA, interviewerB].entries()) {
      const ratings = criterionIds.map(criterion_id => ({
        feedback_submission_id: feedbackIds[index], criterion_id, rating: index === 0 ? 5 : 3,
        criterion_name: "ignored snapshot", criterion_weight: null
      }));
      expect((await client.from("feedback_ratings").insert(ratings)).error).toBeNull();
    }
    expect((await interviewerA.from("feedback_submissions").update({ status: "SUBMITTED", submitted_at: new Date(0).toISOString() }).eq("id", feedbackIds[0])).error).toBeNull();
    const stillBlocked = await hr.rpc("move_candidate", { p_candidate_id: candidateIds[0], p_target_stage_id: stageIds[1] });
    expect(stillBlocked.error?.message).toContain("1 required feedback submission(s) pending");
    const { data: hiddenFromB } = await interviewerB.from("feedback_submissions").select("id").eq("candidate_id", candidateIds[0]);
    expect(hiddenFromB?.map(row => row.id)).toEqual([feedbackIds[1]]);

    expect((await interviewerB.from("feedback_submissions").update({ status: "SUBMITTED" }).eq("id", feedbackIds[1])).error).toBeNull();
    const { data: releasedToB } = await interviewerB.from("feedback_submissions").select("id").eq("candidate_id", candidateIds[0]);
    expect(new Set(releasedToB?.map(row => row.id))).toEqual(new Set(feedbackIds));
    expect((await hr.rpc("move_candidate", { p_candidate_id: candidateIds[0], p_target_stage_id: stageIds[1] })).error).toBeNull();

    const [{ data: history }, { data: activity }, { data: audit }] = await Promise.all([
      service.from("candidate_stage_history").select("changed_by,changed_at").eq("candidate_id", candidateIds[0]).single(),
      service.from("activity_logs").select("actor_id,created_at").eq("candidate_id", candidateIds[0]).eq("action", "STAGE_CHANGED").single(),
      service.from("audit_events").select("actor_profile_id,action,created_at").eq("candidate_id", candidateIds[0]).eq("action", "CANDIDATE_PROGRESSED").single()
    ]);
    expect(history?.changed_by).toBe(hrProfileId);
    expect(activity?.actor_id).toBe(hrProfileId);
    expect(audit?.actor_profile_id).toBe(hrProfileId);
    for (const value of [history?.changed_at, activity?.created_at, audit?.created_at]) expect(Number.isNaN(new Date(value).getTime())).toBe(false);
  });

  it("locks submitted feedback and exposes a transparent disagreement range", async () => {
    const { data: originalFeedback, error: originalFeedbackError } = await service.from("feedback_submissions")
      .select("remarks")
      .eq("id", feedbackIds[0])
      .single();
    expect(originalFeedbackError).toBeNull();

    const feedbackAttempt = await interviewerA.from("feedback_submissions")
      .update({ remarks: "Silent edit" })
      .eq("id", feedbackIds[0])
      .select("id");
    expect(feedbackAttempt.error !== null || feedbackAttempt.data?.length === 0).toBe(true);

    const { data: unchangedFeedback, error: unchangedFeedbackError } = await service.from("feedback_submissions")
      .select("remarks")
      .eq("id", feedbackIds[0])
      .single();
    expect(unchangedFeedbackError).toBeNull();
    expect(unchangedFeedback?.remarks).toBe(originalFeedback?.remarks);

    const { data: originalRatings, error: originalRatingsError } = await service.from("feedback_ratings")
      .select("id,rating")
      .eq("feedback_submission_id", feedbackIds[0])
      .order("id");
    expect(originalRatingsError).toBeNull();
    expect(originalRatings).toHaveLength(criterionIds.length);

    const ratingAttempt = await interviewerA.from("feedback_ratings")
      .update({ rating: 1 })
      .eq("feedback_submission_id", feedbackIds[0])
      .select("id");
    expect(ratingAttempt.error !== null || ratingAttempt.data?.length === 0).toBe(true);

    const { data: unchangedRatings, error: unchangedRatingsError } = await service.from("feedback_ratings")
      .select("id,rating")
      .eq("feedback_submission_id", feedbackIds[0])
      .order("id");
    expect(unchangedRatingsError).toBeNull();
    expect(unchangedRatings).toEqual(originalRatings);

    const { data: difference, error } = await hr.rpc("feedback_disagreement", { p_candidate_id: candidateIds[0], p_stage_id: stageIds[0] });
    expect(error).toBeNull();
    expect(Number(difference)).toBe(2);
    expect(Number(difference)).toBeGreaterThanOrEqual(1.5);
  });

  it("does not let cancelled interview assignments block progression", async () => {
    expect((await hr.rpc("move_candidate", { p_candidate_id: candidateIds[1], p_target_stage_id: stageIds[1] })).error).toBeNull();
  });

  it("requires an HR override reason and atomically records override evidence", async () => {
    const noReason = await hr.rpc("move_candidate", {
      p_candidate_id: candidateIds[2], p_target_stage_id: stageIds[1], p_override: true, p_override_reason: ""
    });
    expect(noReason.error?.message).toContain("Override reason is required");
    expect((await interviewerA.rpc("move_candidate", {
      p_candidate_id: candidateIds[2], p_target_stage_id: stageIds[1], p_override: true, p_override_reason: "Not permitted"
    })).error).toBeTruthy();
    expect((await hr.rpc("move_candidate", {
      p_candidate_id: candidateIds[2], p_target_stage_id: stageIds[1], p_override: true,
      p_override_reason: "Client-approved exceptional progression for Phase A security verification."
    })).error).toBeNull();

    const [{ data: override }, { data: audit }, { data: activity }] = await Promise.all([
      service.from("progression_overrides").select("actor_profile_id,reason,created_at").eq("candidate_id", candidateIds[2]).single(),
      service.from("audit_events").select("actor_profile_id,action,created_at").eq("candidate_id", candidateIds[2]).eq("action", "PROGRESSION_OVERRIDDEN").single(),
      service.from("activity_logs").select("actor_id,action,created_at").eq("candidate_id", candidateIds[2]).eq("action", "PROGRESSION_OVERRIDDEN").single()
    ]);
    expect(override?.actor_profile_id).toBe(hrProfileId);
    expect(override?.reason).toContain("Client-approved");
    expect(audit).toMatchObject({ actor_profile_id: hrProfileId, action: "PROGRESSION_OVERRIDDEN" });
    expect(activity).toMatchObject({ actor_id: hrProfileId, action: "PROGRESSION_OVERRIDDEN" });
  });

  it("keeps management read-only and notifications recipient-scoped", async () => {
    const criteriaWrite = await management.from("evaluation_criteria").update({ name: "UNAUTHORISED" }).eq("id", criterionIds[0]).select("id");
    expect(criteriaWrite.data).toEqual([]);
    const { data: notification, error } = await service.from("notifications").insert({
      recipient_profile_id: interviewerAProfileId, type: "FEEDBACK_REQUIRED", title: "Feedback required",
      message: "Complete assigned interview feedback.", candidate_id: candidateIds[0], interview_id: interviewIds[0],
      link_path: `/candidates/${candidateIds[0]}`
    }).select("id").single();
    expect(error).toBeNull();
    const { data: recipientRows } = await interviewerA.from("notifications").select("id,read_at").eq("id", notification!.id);
    const { data: otherRows } = await interviewerB.from("notifications").select("id").eq("id", notification!.id);
    expect(recipientRows).toHaveLength(1);
    expect(otherRows).toEqual([]);
    expect((await interviewerA.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", notification!.id)).error).toBeNull();
    expect((await interviewerA.from("notifications").update({ title: "Tampered" }).eq("id", notification!.id)).error).toBeTruthy();
  });
});
