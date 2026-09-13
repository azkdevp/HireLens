"use client";

import { useActionState, useState } from "react";
import { overrideCandidateProgression, type ActionState } from "@/app/(protected)/actions";

type Requirement = { name: string; status: string };

export function GovernanceProgression({
  candidateId,
  targetStageId,
  targetStageName,
  requirements,
}: {
  candidateId: string;
  targetStageId: string;
  targetStageName: string;
  requirements: Requirement[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(overrideCandidateProgression, {});
  const [showOverride, setShowOverride] = useState(false);
  const submitted = requirements.filter((item) => item.status === "SUBMITTED").length;
  const missing = requirements.filter((item) => item.status !== "SUBMITTED");

  return <div className="stack">
    <div className="readiness-summary">
      <div><span className="muted">Required feedback</span><strong>{submitted} / {requirements.length} Complete</strong></div>
      <div><span className="muted">Progression</span><strong className="blocked-state">BLOCKED</strong></div>
    </div>
    <div className="stack requirement-list">
      {requirements.map((item) => <div className="list-row" key={item.name}>
        <span>{item.status === "SUBMITTED" ? "✓" : "○"} {item.name}</span>
        <span className={`badge ${item.status === "DRAFT" ? "draft" : item.status === "SUBMITTED" ? "" : "closed"}`}>{item.status}</span>
      </div>)}
    </div>
    <div className="blocked-message">
      <strong>Candidate cannot progress yet.</strong>
      <p>{missing.length} required feedback submission{missing.length === 1 ? " is" : "s are"} still pending.</p>
    </div>
    {!showOverride ? <button type="button" className="btn secondary override-trigger" onClick={() => setShowOverride(true)}>Override progression</button> :
      <form action={action} className="override-panel stack">
        <input type="hidden" name="candidate_id" value={candidateId}/>
        <input type="hidden" name="target_stage_id" value={targetStageId}/>
        <div><span className="badge draft">Exceptional action</span><h3>Override required evidence</h3></div>
        <p>You are overriding a recruitment evidence requirement to progress this candidate to <strong>{targetStageName}</strong>. This action and your reason will be permanently recorded.</p>
        <div><strong>Missing evidence</strong>{missing.map((item) => <p className="muted" key={item.name}>○ {item.name} — Interview feedback {item.status.toLowerCase()}</p>)}</div>
        <label className="field">Reason for override<textarea name="override_reason" required maxLength={2000} placeholder="Explain why progression is authorised without all required evidence."/></label>
        <label className="check-row"><input type="checkbox" name="confirmation" value="confirmed" required/>I confirm this exceptional progression should be recorded in the audit history.</label>
        {state.error && <p className="error" role="alert">{state.error}</p>}
        {state.success && <p className="badge" role="status">{state.success}</p>}
        <div className="actions"><button type="button" className="btn secondary" onClick={() => setShowOverride(false)}>Cancel</button><button className="btn override-action" disabled={pending}>{pending ? "Recording…" : "Confirm override"}</button></div>
      </form>}
  </div>;
}
