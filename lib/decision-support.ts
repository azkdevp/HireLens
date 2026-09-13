export const DISAGREEMENT_THRESHOLD = 1.5;

export type RatingEvidence = { criterion_id:string; criterion_name:string; criterion_weight:number|null; rating:number };
export type SubmittedEvaluation = { id:string; candidate_id:string; stage_id:string; interview_id:string|null; remarks:string; strengths:string; concerns:string; submitted_at:string|null; author?:{full_name:string}|null; feedback_ratings:RatingEvidence[] };

export function evaluationOverall(ratings:RatingEvidence[]) {
  if (!ratings.length) return null;
  const weighted = ratings.filter(rating => rating.criterion_weight !== null);
  if (weighted.length) return Number((weighted.reduce((sum,rating)=>sum+rating.rating*(rating.criterion_weight??0),0)/100).toFixed(2));
  return Number((ratings.reduce((sum,rating)=>sum+rating.rating,0)/ratings.length).toFixed(2));
}

export function agreementSummary(evaluations:SubmittedEvaluation[]) {
  const scores=evaluations.map(item=>evaluationOverall(item.feedback_ratings)).filter((score):score is number=>score!==null);
  if(scores.length<2)return{status:"INSUFFICIENT" as const,highest:null,lowest:null,difference:null};
  const highest=Math.max(...scores),lowest=Math.min(...scores),difference=Number((highest-lowest).toFixed(2));
  return{status:difference>=DISAGREEMENT_THRESHOLD?"REVIEW" as const:"AGREEMENT" as const,highest,lowest,difference};
}

export function criterionAverages(evaluations:SubmittedEvaluation[]) {
  const ratings=new Map<string,{name:string;values:number[]}>();
  for(const evaluation of evaluations)for(const rating of evaluation.feedback_ratings){const item=ratings.get(rating.criterion_id)??{name:rating.criterion_name,values:[]};item.values.push(rating.rating);ratings.set(rating.criterion_id,item)}
  return new Map([...ratings].map(([id,item])=>[id,{name:item.name,average:Number((item.values.reduce((sum,value)=>sum+value,0)/item.values.length).toFixed(2))}]));
}

export function humanEvaluationAverage(evaluations:SubmittedEvaluation[]){const scores=evaluations.map(item=>evaluationOverall(item.feedback_ratings)).filter((score):score is number=>score!==null);return scores.length?Number((scores.reduce((sum,score)=>sum+score,0)/scores.length).toFixed(2)):null}
