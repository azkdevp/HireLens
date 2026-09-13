-- HireLens Sprint 2 Phase D: narrow independent-feedback release to the same interview.

create function public.has_submitted_own_interview_feedback(p_interview_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.feedback_submissions own_feedback
    where own_feedback.interview_id = p_interview_id
      and own_feedback.author_profile_id = public.current_profile_id()
      and own_feedback.author_role = 'INTERVIEWER'
      and own_feedback.status = 'SUBMITTED'
  )
$$;

revoke all on function public.has_submitted_own_interview_feedback(uuid) from public, anon;
grant execute on function public.has_submitted_own_interview_feedback(uuid) to authenticated;

drop policy feedback_independent_read on public.feedback_submissions;
create policy feedback_independent_read
on public.feedback_submissions
for select
to authenticated
using (
  author_profile_id = public.current_profile_id()
  or (public.current_role() in ('HR_RECRUITER', 'MANAGEMENT') and status = 'SUBMITTED')
  or (
    public.current_role() = 'INTERVIEWER'
    and author_role = 'INTERVIEWER'
    and status = 'SUBMITTED'
    and interview_id is not null
    and public.has_submitted_own_interview_feedback(interview_id)
  )
);

comment on function public.has_submitted_own_interview_feedback(uuid) is
  'HL-40 release gate: peer submitted feedback is visible only after the viewer submits for that same interview.';
