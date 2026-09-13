import Link from "next/link";
import { notFound } from "next/navigation";
import { FeedbackForm } from "@/components/evaluation-forms";
import { requireProfile } from "@/lib/auth";
import { formatInterviewDate } from "@/lib/interviews";
import { createClient } from "@/lib/supabase/server";
import type { EvaluationCriterion, FeedbackRating, FeedbackSubmission, Interview } from "@/lib/types";

type PeerFeedback = FeedbackSubmission & { author:{full_name:string}|null; feedback_ratings:FeedbackRating[] };

function Evidence({ feedback, heading }: { feedback:FeedbackSubmission; heading:string }) {
  return <section className="card"><div className="section-heading"><h2>{heading}</h2><span className="badge">SUBMITTED ✓</span></div><p className="muted">Submitted evidence is locked and cannot be edited.</p><div className="stack">{feedback.feedback_ratings?.map(rating => <div className="score-row" key={rating.criterion_id}><strong>{rating.criterion_name}</strong><span>{rating.rating} / 5{rating.criterion_weight !== null ? ` · ${rating.criterion_weight}%` : ""}</span></div>)}</div><h3>Remarks</h3><p>{feedback.remarks}</p><div className="grid2"><div><h3>Strengths</h3><p>{feedback.strengths || "None recorded."}</p></div><div><h3>Concerns</h3><p>{feedback.concerns || "None recorded."}</p></div></div><p className="muted">Submitted {feedback.submitted_at ? formatInterviewDate(feedback.submitted_at) : ""}</p></section>;
}

export default async function FeedbackPage({ params }: { params:Promise<{id:string}> }) {
  const profile = await requireProfile(["INTERVIEWER"]);
  const { id } = await params;
  const s = await createClient();
  const { data } = await s.from("interviews").select("*,candidate:candidates(id,full_name,vacancy:vacancies(id,title)),stage:vacancy_stages(id,name)").eq("id", id).single();
  if (!data) notFound();
  const interview = data as unknown as Interview;
  const [{ data:criteria }, { data:feedback }] = await Promise.all([
    s.rpc("effective_evaluation_criteria", { p_vacancy_id:interview.vacancy_id, p_stage_id:interview.stage_id }),
    s.from("feedback_submissions").select("id,interview_id,stage_id,remarks,strengths,concerns,status,submitted_at,feedback_ratings(criterion_id,criterion_name,criterion_weight,rating)").eq("interview_id", id).eq("author_profile_id", profile.id).maybeSingle(),
  ]);
  const existing = feedback as unknown as FeedbackSubmission|undefined;
  let peers:PeerFeedback[] = [];
  if (existing?.status === "SUBMITTED") {
    const { data:peerRows } = await s.from("feedback_submissions").select("id,interview_id,stage_id,remarks,strengths,concerns,status,submitted_at,author:user_profiles!feedback_submissions_author_profile_id_fkey(full_name),feedback_ratings(criterion_id,criterion_name,criterion_weight,rating)").eq("interview_id", id).eq("status", "SUBMITTED").neq("author_profile_id", profile.id).order("submitted_at");
    peers = (peerRows ?? []) as unknown as PeerFeedback[];
  }
  return <div className="stack"><div><Link className="muted" href={`/interviews/${id}`}>← Back to interview</Link><p><span className={`badge ${existing?.status === "SUBMITTED" ? "" : "draft"}`}>{existing?.status ?? "NEW"}</span></p><h1>{existing?.status === "SUBMITTED" ? "Your feedback" : "Your evaluation"}</h1><p className="muted">{interview.candidate?.full_name} · {interview.candidate?.vacancy?.title} · {interview.stage?.name} · {formatInterviewDate(interview.scheduled_at)}</p></div>{existing?.status === "SUBMITTED" ? <><Evidence feedback={existing} heading="Your submitted feedback"/><section className="card"><h2>Other submitted feedback</h2>{peers.length ? <div className="stack">{peers.map(peer => <article className="peer-evidence" key={peer.id}><h3>{peer.author?.full_name ?? "Assigned interviewer"}</h3><div className="stack">{peer.feedback_ratings.map(rating => <div className="score-row" key={rating.criterion_id}><strong>{rating.criterion_name}</strong><span>{rating.rating} / 5</span></div>)}</div><h4>Remarks</h4><p>{peer.remarks}</p><p className="muted">Submitted {peer.submitted_at ? formatInterviewDate(peer.submitted_at) : ""}</p></article>)}</div> : <p className="muted">No other interviewer has submitted feedback yet. Draft feedback is never shared.</p>}</section></> : <section className="card">{criteria?.length ? <><FeedbackForm interviewId={id} criteria={criteria as EvaluationCriterion[]} feedback={existing}/><p className="independence-note">Other interviewer feedback will become available only after you submit your own evaluation. Peer drafts are never shown.</p></> : <div className="empty-state"><strong>No evaluation criteria configured</strong><p className="muted">HR must configure effective criteria before structured feedback can be completed.</p></div>}</section>}</div>;
}
