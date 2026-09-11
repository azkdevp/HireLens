import { z } from "zod";

export const vacancySchema = z.object({
  title: z.string().trim().min(2, "Title is required"), department: z.string().trim().min(2, "Department is required"),
  location: z.string().trim().min(2, "Location is required"), employment_type: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "TEMPORARY", "INTERNSHIP"]),
  description: z.string().trim().min(20, "Description must be at least 20 characters")
});
export const candidateSchema = z.object({
  vacancy_id: z.string().uuid("Choose a vacancy"), full_name: z.string().trim().min(2, "Full name is required"),
  email: z.string().trim().email("Enter a valid email"), phone: z.string().trim().min(7, "Enter a valid phone number").max(30),
  source: z.string().trim().min(2, "Source is required"), notes: z.string().trim().max(5000).default("")
});
export const stageNamesSchema = z.array(z.string().trim().min(1, "Stage names cannot be empty").max(80)).min(1).superRefine((names, ctx) => {
  const normalised = names.map((name) => name.toLowerCase());
  if (new Set(normalised).size !== normalised.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Stage names must be unique" });
});
export const outcomeSchema = z.enum(["HIRED", "REJECTED", "ON_HOLD"]);
export const cvSchema = z.object({ size: z.number().max(5 * 1024 * 1024, "CV must be 5 MB or smaller"), type: z.enum(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]) });
const optionalText=(max:number)=>z.string().trim().max(max).transform(value=>value||null);
export const interviewSchema=z.object({
  candidate_id:z.string().uuid("Invalid candidate"),stage_id:z.string().uuid("Choose a recruitment stage"),
  scheduled_at:z.string().datetime({offset:true}).refine(value=>new Date(value).getTime()>Date.now(),"Choose a future interview time"),
  timezone:z.string().trim().min(1).max(100),method:z.enum(["IN_PERSON","VIDEO","PHONE"]),
  location:optionalText(300),meeting_link:optionalText(500),notes:z.string().trim().max(5000)
}).superRefine((value,ctx)=>{
  if(value.method==="IN_PERSON"&&!value.location)ctx.addIssue({code:z.ZodIssueCode.custom,path:["location"],message:"Location is required for an in-person interview"});
  if(value.method==="VIDEO"&&!value.meeting_link)ctx.addIssue({code:z.ZodIssueCode.custom,path:["meeting_link"],message:"A meeting link is required for a video interview"});
  if(value.meeting_link&&!/^https:\/\/\S+$/.test(value.meeting_link))ctx.addIssue({code:z.ZodIssueCode.custom,path:["meeting_link"],message:"Meeting link must use HTTPS"});
});
export const interviewIdSchema=z.string().uuid("Invalid interview");
export const interviewerAssignmentSchema=z.object({interview_id:interviewIdSchema,interviewer_ids:z.array(z.string().uuid()).min(1,"Choose at least one interviewer").max(20)}).superRefine((value,ctx)=>{if(new Set(value.interviewer_ids).size!==value.interviewer_ids.length)ctx.addIssue({code:z.ZodIssueCode.custom,message:"Duplicate interviewer selection is not permitted"})});
export const notificationIdSchema=z.string().uuid("Invalid notification");

export function isValidTransition(stages: { id: string; stage_order: number }[], currentId: string, targetId: string) {
  const sorted = [...stages].sort((a, b) => a.stage_order - b.stage_order);
  return sorted.findIndex((stage) => stage.id === targetId) === sorted.findIndex((stage) => stage.id === currentId) + 1;
}
