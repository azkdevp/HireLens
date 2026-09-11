-- HireLens Sprint 2 Phase A corrective migration.
-- Makes the interview assignment authorization check independent of nested RLS.

create function public.is_assigned_to_interview(p_interview_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.interview_assignments assignment
    where assignment.interview_id = p_interview_id
      and assignment.interviewer_profile_id = public.current_profile_id()
  )
$$;

revoke all on function public.is_assigned_to_interview(uuid) from public, anon;
grant execute on function public.is_assigned_to_interview(uuid) to authenticated;

drop policy interviews_authorized_read on public.interviews;
create policy interviews_authorized_read
on public.interviews
for select
to authenticated
using (
  public.current_role() in ('HR_RECRUITER', 'MANAGEMENT')
  or public.is_assigned_to_interview(id)
);

comment on function public.is_assigned_to_interview(uuid) is
  'RLS-safe, current-user-derived authorization check for one assigned interview; returns only a boolean.';
