import type{SubmittedEvaluation}from"@/lib/decision-support";

export type AiSummaryState={status:"UNAVAILABLE";message:string;evidenceIds:string[]};

export async function summarizeSubmittedFeedback(evaluations:SubmittedEvaluation[]):Promise<AiSummaryState>{
  // Provider boundary only. No provider or key is configured in this repository,
  // so evidence is never sent externally and no deterministic output is mislabeled as AI.
  return{status:"UNAVAILABLE",message:evaluations.length?"AI summary is temporarily unavailable. Review the submitted feedback below.":"AI summary is unavailable because there is no submitted feedback to summarize.",evidenceIds:evaluations.map(item=>item.id)};
}
