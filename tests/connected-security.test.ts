// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const service = createClient(url, serviceKey, { auth: { persistSession: false } });
const anonymous = createClient(url, anonKey, { auth: { persistSession: false } });

let hr: SupabaseClient;
let interviewer: SupabaseClient;
let management: SupabaseClient;
let hrProfileId = "";
let vacancyId = "";
let candidateId = "";
let stageIds: string[] = [];
let storagePath = "";

async function authenticated(email: string, password: string) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return client;
}

describe.sequential("connected Supabase Sprint 1 security", () => {
  beforeAll(async () => {
    expect(url).toMatch(/^https:\/\//);
    expect(anonKey).toBeTruthy();
    expect(serviceKey).toBeTruthy();

    [hr, interviewer, management] = await Promise.all([
      authenticated(process.env.E2E_HR_EMAIL!, process.env.E2E_HR_PASSWORD!),
      authenticated("interviewer@hirelens.demo", process.env.SEED_INTERVIEWER_PASSWORD!),
      authenticated("management@hirelens.demo", process.env.SEED_MANAGEMENT_PASSWORD!)
    ]);

    const { data: hrUser } = await hr.auth.getUser();
    const { data: profile, error: profileError } = await service
      .from("user_profiles")
      .select("id")
      .eq("authentication_user_id", hrUser.user!.id)
      .single();
    if (profileError) throw profileError;
    hrProfileId = profile.id;

    const suffix = crypto.randomUUID();
    const { data: vacancy, error: vacancyError } = await service
      .from("vacancies")
      .insert({
        title: `QA Security ${suffix}`,
        department: "Quality Assurance",
        location: "Colombo",
        employment_type: "FULL_TIME",
        description: "Disposable connected security regression fixture.",
        created_by: hrProfileId
      })
      .select("id")
      .single();
    if (vacancyError) throw vacancyError;
    vacancyId = vacancy.id;

    const { data: stages, error: stagesError } = await service
      .from("vacancy_stages")
      .insert(["Applied", "Screening", "Offer"].map((name, stage_order) => ({ vacancy_id: vacancyId, name, stage_order })))
      .select("id,stage_order")
      .order("stage_order");
    if (stagesError) throw stagesError;
    stageIds = stages.map((stage) => stage.id);

    const { data: candidate, error: candidateError } = await service
      .from("candidates")
      .insert({
        vacancy_id: vacancyId,
        current_stage_id: stageIds[0],
        full_name: "QA Security Candidate",
        email: `qa-${suffix}@example.com`,
        phone: "+94 77 000 0000",
        source: "QA",
        notes: "Disposable connected security regression fixture.",
        created_by: hrProfileId
      })
      .select("id")
      .single();
    if (candidateError) throw candidateError;
    candidateId = candidate.id;

    storagePath = `${candidateId}/qa-security.pdf`;
    const { error: uploadError } = await service.storage
      .from("candidate-cvs")
      .upload(storagePath, new Blob(["%PDF-1.4\n% QA fixture"], { type: "application/pdf" }), { contentType: "application/pdf" });
    if (uploadError) throw uploadError;
  }, 60_000);

  afterAll(async () => {
    if (storagePath) await service.storage.from("candidate-cvs").remove([storagePath]);
    if (candidateId) {
      await service.from("candidate_documents").delete().eq("candidate_id", candidateId);
      await service.from("activity_logs").delete().eq("candidate_id", candidateId);
      await service.from("candidate_stage_history").delete().eq("candidate_id", candidateId);
      await service.from("candidates").delete().eq("id", candidateId);
    }
    if (vacancyId) {
      await service.from("vacancy_stages").delete().eq("vacancy_id", vacancyId);
      await service.from("vacancies").delete().eq("id", vacancyId);
    }
    await Promise.all([hr?.auth.signOut(), interviewer?.auth.signOut(), management?.auth.signOut()]);
  }, 60_000);

  it("keeps the CV bucket private and denies anonymous downloads", async () => {
    const { data: bucket, error: bucketError } = await service.storage.getBucket("candidate-cvs");
    expect(bucketError).toBeNull();
    expect(bucket?.public).toBe(false);

    const { error: anonymousError } = await anonymous.storage.from("candidate-cvs").download(storagePath);
    expect(anonymousError).toBeTruthy();

    const { data: authorisedFile, error: authorisedError } = await hr.storage.from("candidate-cvs").download(storagePath);
    expect(authorisedError).toBeNull();
    expect(authorisedFile?.size).toBeGreaterThan(0);
  });

  it.each([
    ["Interviewer", () => interviewer],
    ["Management", () => management]
  ])("prevents %s from direct writes and HR workflow RPCs", async (_role, clientFactory) => {
    const client = clientFactory();
    const { data: vacancyWriteRows, error: vacancyWriteError } = await client.from("vacancies").update({ title: "UNAUTHORISED" }).eq("id", vacancyId).select("id");
    expect(vacancyWriteError).toBeNull();
    expect(vacancyWriteRows).toEqual([]);

    const { data: candidateWriteRows, error: candidateWriteError } = await client.from("candidates").update({ notes: "UNAUTHORISED" }).eq("id", candidateId).select("id");
    expect(candidateWriteError).toBeNull();
    expect(candidateWriteRows).toEqual([]);

    const [{ data: vacancy }, { data: candidate }] = await Promise.all([
      service.from("vacancies").select("title").eq("id", vacancyId).single(),
      service.from("candidates").select("notes").eq("id", candidateId).single()
    ]);
    expect(vacancy?.title).not.toBe("UNAUTHORISED");
    expect(candidate?.notes).not.toBe("UNAUTHORISED");

    const { error: moveError } = await client.rpc("move_candidate", { p_candidate_id: candidateId, p_target_stage_id: stageIds[1] });
    expect(moveError).toBeTruthy();

    const { error: outcomeError } = await client.rpc("record_candidate_outcome", { p_candidate_id: candidateId, p_outcome: "ON_HOLD" });
    expect(outcomeError).toBeTruthy();
  });

  it("prevents HR from bypassing the stage and outcome workflows with direct table updates", async () => {
    const directStage = await hr.from("candidates").update({ current_stage_id: stageIds[1] }).eq("id", candidateId);
    if (!directStage.error) await service.from("candidates").update({ current_stage_id: stageIds[0] }).eq("id", candidateId);
    expect(directStage.error).toBeTruthy();

    const directOutcome = await hr.from("candidates").update({ outcome: "HIRED", status: "CLOSED" }).eq("id", candidateId);
    if (!directOutcome.error) await service.from("candidates").update({ outcome: null, status: "ACTIVE" }).eq("id", candidateId);
    expect(directOutcome.error).toBeTruthy();

    const { data: candidate } = await service.from("candidates").select("current_stage_id,outcome,status").eq("id", candidateId).single();
    expect(candidate).toMatchObject({ current_stage_id: stageIds[0], outcome: null, status: "ACTIVE" });
  });

  it("rejects invalid stage movement and atomically audits a valid transition", async () => {
    const { error: skipError } = await hr.rpc("move_candidate", { p_candidate_id: candidateId, p_target_stage_id: stageIds[2] });
    expect(skipError).toBeTruthy();

    const { error: moveError } = await hr.rpc("move_candidate", { p_candidate_id: candidateId, p_target_stage_id: stageIds[1] });
    expect(moveError).toBeNull();

    const [{ data: candidate }, { data: history }, { data: activity }] = await Promise.all([
      service.from("candidates").select("current_stage_id").eq("id", candidateId).single(),
      service.from("candidate_stage_history").select("previous_stage_id,new_stage_id,changed_by,changed_at").eq("candidate_id", candidateId).single(),
      service.from("activity_logs").select("actor_id,action,created_at").eq("candidate_id", candidateId).eq("action", "STAGE_CHANGED").single()
    ]);
    expect(candidate?.current_stage_id).toBe(stageIds[1]);
    expect(history).toMatchObject({ previous_stage_id: stageIds[0], new_stage_id: stageIds[1], changed_by: hrProfileId });
    expect(Math.abs(Date.now() - new Date(history!.changed_at).getTime())).toBeLessThan(10_000);
    expect(activity).toMatchObject({ actor_id: hrProfileId, action: "STAGE_CHANGED" });
    expect(Math.abs(Date.now() - new Date(activity!.created_at).getTime())).toBeLessThan(10_000);

    const { error: reverseError } = await hr.rpc("move_candidate", { p_candidate_id: candidateId, p_target_stage_id: stageIds[0] });
    expect(reverseError).toBeTruthy();
  });

  it("persists every valid outcome with actor, timestamp, and chronological activity", async () => {
    const outcomes = ["ON_HOLD", "HIRED", "REJECTED"] as const;
    for (const outcome of outcomes) {
      const { error } = await hr.rpc("record_candidate_outcome", { p_candidate_id: candidateId, p_outcome: outcome });
      expect(error).toBeNull();
    }

    const [{ data: candidate }, { data: logs }] = await Promise.all([
      service.from("candidates").select("outcome,status").eq("id", candidateId).single(),
      service.from("activity_logs").select("actor_id,action,metadata,created_at").eq("candidate_id", candidateId).eq("action", "OUTCOME_RECORDED").order("created_at")
    ]);
    expect(candidate).toMatchObject({ outcome: "REJECTED", status: "CLOSED" });
    expect(logs?.map((log) => log.metadata.outcome)).toEqual(outcomes);
    expect(logs?.every((log) => log.actor_id === hrProfileId && !Number.isNaN(new Date(log.created_at).getTime()))).toBe(true);
    expect(logs?.map((log) => new Date(log.created_at).getTime())).toEqual(
      [...(logs ?? [])].map((log) => new Date(log.created_at).getTime()).sort((a, b) => a - b)
    );

    const { error: closedMoveError } = await hr.rpc("move_candidate", { p_candidate_id: candidateId, p_target_stage_id: stageIds[2] });
    expect(closedMoveError).toBeTruthy();
  });

  it("keeps activity and stage history immutable to authenticated users", async () => {
    const { error: activityError } = await hr.from("activity_logs").update({ description: "TAMPERED" }).eq("candidate_id", candidateId);
    const { error: historyError } = await hr.from("candidate_stage_history").delete().eq("candidate_id", candidateId);
    expect(activityError).toBeTruthy();
    expect(historyError).toBeTruthy();
  });
});
