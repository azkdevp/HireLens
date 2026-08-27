export type Role = "HR_RECRUITER" | "INTERVIEWER" | "MANAGEMENT";
export type Outcome = "HIRED" | "REJECTED" | "ON_HOLD" | null;
export type Profile = { id: string; authentication_user_id: string; full_name: string; role: Role };
export type Stage = { id: string; vacancy_id: string; name: string; stage_order: number };
export type Vacancy = { id: string; title: string; department: string; location: string; employment_type: string; description: string; status: "ACTIVE" | "ARCHIVED"; created_by: string; created_at: string; updated_at: string; archived_at: string | null; vacancy_stages?: Stage[] };
export type Candidate = { id: string; vacancy_id: string; current_stage_id: string; full_name: string; email: string; phone: string; source: string; notes: string; status: "ACTIVE" | "CLOSED"; outcome: Outcome; created_by: string; created_at: string; updated_at: string; vacancy?: Pick<Vacancy, "id" | "title">; current_stage?: Stage };
