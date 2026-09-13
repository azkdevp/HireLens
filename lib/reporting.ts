export type StageStay={stageId:string;stageName:string;enteredAt:string;leftAt:string|null};
export type HistoryInput={candidate_id:string;previous_stage_id:string|null;new_stage_id:string;changed_at:string};
export type CandidateStageInput={id:string;current_stage_id:string;created_at:string;status:string};

export function stageDurationDays(enteredAt:string,leftAt:string|null,now=new Date()){
  const start=new Date(enteredAt).getTime(),end=leftAt?new Date(leftAt).getTime():now.getTime();
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<start)return null;
  return Math.round(((end-start)/86_400_000)*10)/10;
}

export function average(values:(number|null)[]){const valid=values.filter((value):value is number=>value!==null);return valid.length?Math.round(valid.reduce((sum,value)=>sum+value,0)/valid.length*10)/10:null}

export function deriveStageStays(candidate:CandidateStageInput,history:HistoryInput[],stageNames:Map<string,string>){const ordered=history.filter(item=>item.candidate_id===candidate.id).sort((a,b)=>Date.parse(a.changed_at)-Date.parse(b.changed_at)),result:StageStay[]=[];if(ordered.length&&ordered[0].previous_stage_id)result.push({stageId:ordered[0].previous_stage_id,stageName:stageNames.get(ordered[0].previous_stage_id)??"Unknown stage",enteredAt:candidate.created_at,leftAt:ordered[0].changed_at});for(let index=0;index<ordered.length;index++){const item=ordered[index],next=ordered[index+1];result.push({stageId:item.new_stage_id,stageName:stageNames.get(item.new_stage_id)??"Unknown stage",enteredAt:item.changed_at,leftAt:next?.changed_at??(candidate.status==="ACTIVE"?null:item.changed_at)})}if(!ordered.length)result.push({stageId:candidate.current_stage_id,stageName:stageNames.get(candidate.current_stage_id)??"Unknown stage",enteredAt:candidate.created_at,leftAt:candidate.status==="ACTIVE"?null:candidate.created_at});return result}

export function csvCell(value:unknown){const text=value===null||value===undefined?"":String(value);return /[",\r\n]/.test(text)?`"${text.replaceAll('"','""')}"`:text}
export function csv(rows:unknown[][]){return `\uFEFF${rows.map(row=>row.map(csvCell).join(",")).join("\r\n")}\r\n`}

export function normalized(value:string|undefined){return value?.trim()??""}
export function selected(value:string|undefined,allowed:readonly string[]){const item=normalized(value);return allowed.includes(item)?item:""}
