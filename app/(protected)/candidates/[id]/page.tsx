import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { moveCandidate } from "@/app/(protected)/actions";
import { CandidateOutcomeForm, CvForm } from "@/components/forms";
import { StageRemarkForm } from "@/components/evaluation-forms";
import { GovernanceProgression } from "@/components/governance-progression";
import { formatInterviewDate } from "@/lib/interviews";
import type { Candidate, Interview, Stage } from "@/lib/types";

type Log = { id:string; action:string; description:string; created_at:string; metadata:Record<string,unknown>|null; actor:{full_name:string}|null };
type Status = { assignment_id:string; interviewer_profile_id:string; full_name:string; feedback_required:boolean; feedback_status:string };
type Evidence = { id:string; stage_id:string; stage_name:string; interview_id:string|null; author_name:string; remarks:string; strengths:string; concerns:string; submitted_at:string; overall_score:number|null; ratings:{criterion_name:string;criterion_weight:number|null;rating:number}[] };
type Override = { id:string; reason:string; created_at:string; from_stage:{name:string}|null; to_stage:{name:string}|null; actor:{full_name:string}|null };

export default async function CandidateDetail({ params }: { params:Promise<{id:string}> }) {
  const profile = await requireProfile();
  const { id } = await params;
  const s = await createClient();
  const { data } = await s.from("candidates").select("*,vacancy:vacancies(id,title),current_stage:vacancy_stages(*)").eq("id", id).single();
  if (!data) notFound();
  const c = data as Candidate;
  const canReview = profile.role !== "INTERVIEWER";
  const [{ data:stages }, { data:logs }, { data:doc }, { data:interviews }, { data:evidence }, { data:overrides }, { data:completion }] = await Promise.all([
    s.from("vacancy_stages").select("*").eq("vacancy_id", c.vacancy_id).order("stage_order"),
    s.from("activity_logs").select("id,action,description,created_at,metadata,actor:user_profiles!activity_logs_actor_id_fkey(full_name)").eq("candidate_id", id).order("created_at", { ascending:false }),
    s.from("candidate_documents").select("id,file_name").eq("candidate_id", id).maybeSingle(),
    s.from("interviews").select("*,stage:vacancy_stages(id,name)").eq("candidate_id", id).order("scheduled_at", { ascending:false }),
    canReview ? s.rpc("candidate_feedback_evidence", { p_candidate_id:id }) : Promise.resolve({ data:null }),
    canReview ? s.from("progression_overrides").select("id,reason,created_at,from_stage:vacancy_stages!progression_overrides_from_stage_id_fkey(name),to_stage:vacancy_stages!progression_overrides_to_stage_id_fkey(name),actor:user_profiles!progression_overrides_actor_profile_id_fkey(full_name)").eq("candidate_id", id).order("created_at", { ascending:false }) : Promise.resolve({ data:null }),
    s.rpc("feedback_completion", { p_candidate_id:id, p_stage_id:c.current_stage_id }),
  ]);
  const interviewRows = (interviews ?? []) as unknown as Interview[];
  const statusPairs = await Promise.all(interviewRows.map(async interview => {
    const [{ data:statuses }, { data:interviewCompletion }] = await Promise.all([
      s.rpc("interview_feedback_status", { p_interview_id:interview.id }),
      s.rpc("feedback_completion", { p_candidate_id:id, p_stage_id:interview.stage_id }),
    ]);
    return [interview.id, { statuses:(statuses ?? []) as Status[], completion:interviewCompletion?.[0] }] as const;
  }));
  const feedback = new Map(statusPairs);
  const ordered = (stages ?? []) as Stage[];
  const index = ordered.findIndex(stage => stage.id === c.current_stage_id);
  const next = ordered[index + 1];
  const hr = profile.role === "HR_RECRUITER";
  const evidenceRows = (evidence ?? []) as Evidence[];
  const overrideRows = (overrides ?? []) as unknown as Override[];
  const currentRequirements = interviewRows.filter(interview => interview.stage_id === c.current_stage_id && interview.status !== "CANCELLED").flatMap(interview => feedback.get(interview.id)?.statuses ?? []).filter(item => item.feedback_required);
  const readiness = completion?.[0] as { required_count:number;submitted_count:number;complete:boolean }|undefined;
  const blocked = Boolean(next && c.status === "ACTIVE" && readiness && !readiness.complete);

  return <div className="stack">
    <section className="card"><div style={{ display:"flex", alignItems:"start", gap:10 }}><div style={{ marginRight:"auto" }}><span className={`badge ${c.status === "CLOSED" ? "closed" : ""}`}>{c.outcome ?? c.status}</span><h1>{c.full_name}</h1><p className="muted">{c.email} · {c.phone}</p></div>{hr && <Link className="btn secondary" href={`/candidates/${id}/edit`}>Edit</Link>}</div><div className="grid2"><div><h3>Vacancy</h3><p>{c.vacancy?.title}</p></div><div><h3>Current stage</h3><p>{c.current_stage?.name}</p></div><div><h3>Source</h3><p>{c.source}</p></div><div><h3>Notes</h3><p style={{ whiteSpace:"pre-wrap" }}>{c.notes || "No notes"}</p></div></div></section>

    {canReview && <section className="card governance-card"><div className="section-heading"><div><p className="eyebrow">Decision readiness</p><h2>Progression requirements</h2><p className="muted">Required evaluation evidence controls movement from {c.current_stage?.name}.</p></div><span className={`badge ${blocked ? "closed" : ""}`}>{blocked ? "BLOCKED" : c.status === "ACTIVE" ? "READY" : "CLOSED"}</span></div>{next && c.status === "ACTIVE" ? blocked ? hr ? <GovernanceProgression candidateId={id} targetStageId={next.id} targetStageName={next.name} requirements={currentRequirements.map(item => ({ name:item.full_name, status:item.feedback_status }))}/> : <div className="stack"><div className="readiness-summary"><div><span className="muted">Required feedback</span><strong>{readiness?.submitted_count ?? 0} / {readiness?.required_count ?? 0} Complete</strong></div><div><span className="muted">Progression</span><strong className="blocked-state">BLOCKED</strong></div></div>{currentRequirements.map(item => <div className="list-row" key={item.assignment_id}><span>{item.feedback_status === "SUBMITTED" ? "✓" : "○"} {item.full_name}</span><span className={`badge ${item.feedback_status === "SUBMITTED" ? "" : "closed"}`}>{item.feedback_status}</span></div>)}<p className="muted">Candidate progression is blocked and recruitment changes remain restricted to HR recruiters.</p></div> : <div className="stack"><div className="readiness-summary"><div><span className="muted">Required feedback</span><strong>{readiness?.submitted_count ?? 0} / {readiness?.required_count ?? 0} Complete</strong></div><div><span className="muted">Next stage</span><strong>{next.name}</strong></div></div>{currentRequirements.map(item => <div className="list-row" key={item.assignment_id}><span>✓ {item.full_name}</span><span className="badge">SUBMITTED</span></div>)}{hr && <form action={moveCandidate}><input type="hidden" name="candidate_id" value={id}/><input type="hidden" name="target_stage_id" value={next.id}/><button className="btn">Progress to {next.name}</button></form>}{!hr && <p className="muted">Recruitment progression is restricted to HR recruiters.</p>}</div> : <p className="muted">{c.status === "ACTIVE" ? "No next-stage transition is available." : "Closed candidates cannot change recruitment stage."}</p>}{overrideRows.length > 0 && <div className="override-history stack"><h3>Progression override history</h3>{overrideRows.map(item => <article className="evidence-card" key={item.id}><span className="badge draft">Progression override</span><h4>{item.from_stage?.name} → {item.to_stage?.name}</h4><p>{item.reason}</p><p className="muted">— {item.actor?.full_name ?? "HR recruiter"} · {formatInterviewDate(item.created_at)}</p></article>)}</div>}</section>}

    {hr && <section className="card"><h2>Record outcome</h2><CandidateOutcomeForm candidateId={id} outcome={c.outcome}/></section>}

    <section className="card"><div className="section-heading"><div><h2>Interviews</h2><p className="muted">Scheduled interviews and feedback completion.</p></div>{hr && c.status === "ACTIVE" && <Link className="btn" href={`/candidates/${id}/interviews/new`}>Schedule interview</Link>}</div>{interviewRows.length ? <div className="stack">{interviewRows.map(interview => { const state=feedback.get(interview.id); return <article className="interview-card" key={interview.id}><div><span className={`badge ${interview.status === "CANCELLED" ? "closed" : ""}`}>{interview.status}</span><h3>{interview.stage?.name}</h3><p>{formatInterviewDate(interview.scheduled_at)} · {interview.method.replaceAll("_", " ")}</p><p className="muted">Assigned: {state?.statuses.map(item => `${item.full_name} — ${item.feedback_status}`).join(", ") || "None"}</p><strong>{state?.completion?.required_count ? `${state.completion.submitted_count} / ${state.completion.required_count} feedback complete` : "Feedback not required"}</strong></div><Link className="btn secondary" href={`/interviews/${interview.id}`}>View interview</Link></article>})}</div> : <div className="empty-state"><strong>No interviews scheduled</strong><p className="muted">Interview history will appear here.</p></div>}</section>

    {canReview && <section className="card"><div className="section-heading"><div><h2>Stage evidence</h2><p className="muted">Submitted remarks and human evaluation evidence remain historically visible.</p></div></div>{evidenceRows.length ? <div className="stack">{evidenceRows.map(item => <article className="evidence-card" key={item.id}><div className="section-heading"><div><span className="badge">{item.interview_id ? "Interview feedback" : "Stage remark"}</span><h3>{item.stage_name}</h3></div>{item.overall_score !== null && <div className="overall-score"><strong>{item.overall_score}</strong><small>/ 5 overall evaluation</small></div>}</div>{item.ratings.length > 0 && <div className="stack">{item.ratings.map(rating => <div className="score-row" key={rating.criterion_name}><strong>{rating.criterion_name}</strong><span>{rating.rating} / 5{rating.criterion_weight !== null ? ` · ${rating.criterion_weight}%` : ""}</span></div>)}</div>}<h4>Remarks</h4><p style={{ whiteSpace:"pre-wrap" }}>{item.remarks}</p>{item.interview_id && <div className="grid2"><div><h4>Strengths</h4><p>{item.strengths || "None recorded."}</p></div><div><h4>Concerns</h4><p>{item.concerns || "None recorded."}</p></div></div>}<p className="muted">— {item.author_name} · {formatInterviewDate(item.submitted_at)}</p></article>)}</div> : <div className="empty-state"><strong>No stage evidence recorded</strong><p className="muted">Submitted remarks and interview feedback will appear here.</p></div>}{hr && <details className="remark-panel"><summary>Add stage remark</summary><StageRemarkForm candidateId={id} stages={ordered}/></details>}</section>}

    <section className="card"><h2>Candidate CV</h2>{doc ? <p><Link className="btn secondary" href={`/api/candidates/${id}/cv`}>Download {doc.file_name}</Link></p> : <p className="muted">No CV is attached.</p>}{hr && <CvForm candidateId={id}/>}</section>
    <section className="card"><h2>Activity timeline</h2>{logs?.length ? <ol className="stack timeline" style={{ listStyle:"none", padding:0 }}>{(logs as unknown as Log[]).map(log => <li key={log.id} className={log.action === "PROGRESSION_OVERRIDDEN" ? "override-event" : ""}><strong>{log.action === "PROGRESSION_OVERRIDDEN" ? "Progression overridden" : log.description}</strong>{log.action === "PROGRESSION_OVERRIDDEN" && typeof log.metadata?.reason === "string" && <p>Reason: {log.metadata.reason}</p>}<div className="muted">{new Date(log.created_at).toLocaleString()} · {log.actor?.full_name ?? "System"}</div></li>)}</ol> : <p className="muted">No activity has been recorded.</p>}</section>
  </div>;
}
