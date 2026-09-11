-- HireLens Sprint 2 Phase B: secure interview management write paths.

create function public.list_assignable_interviewers()
returns table(id uuid, full_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_hr() then raise exception 'Access denied'; end if;
  return query select p.id, p.full_name from public.user_profiles p
    where p.role = 'INTERVIEWER' order by p.full_name;
end $$;

create function public.interview_assignment_details(p_interview_id uuid)
returns table(id uuid, interviewer_profile_id uuid, full_name text, feedback_required boolean, assigned_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.current_role() not in ('HR_RECRUITER','MANAGEMENT')
     and not public.is_assigned_to_interview(p_interview_id) then raise exception 'Access denied'; end if;
  return query select a.id,a.interviewer_profile_id,p.full_name,a.feedback_required,a.assigned_at
    from public.interview_assignments a join public.user_profiles p on p.id=a.interviewer_profile_id
    where a.interview_id=p_interview_id order by p.full_name;
end $$;

create function public.schedule_interview(
  p_candidate_id uuid, p_stage_id uuid, p_scheduled_at timestamptz,
  p_timezone text, p_method text, p_location text default null,
  p_meeting_link text default null, p_notes text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare c public.candidates; actor uuid; created_id uuid;
begin
  if not public.is_hr() then raise exception 'Access denied'; end if;
  actor := public.current_profile_id();
  select * into c from public.candidates where id = p_candidate_id for update;
  if c.id is null then raise exception 'Candidate not found'; end if;
  if c.status <> 'ACTIVE' then raise exception 'Closed candidates cannot receive new interviews'; end if;
  if p_scheduled_at <= now() then raise exception 'Interview must be scheduled in the future'; end if;
  if not exists(select 1 from public.vacancy_stages where id = p_stage_id and vacancy_id = c.vacancy_id)
    then raise exception 'Interview stage does not belong to the candidate vacancy'; end if;
  insert into public.interviews(candidate_id,vacancy_id,stage_id,scheduled_at,timezone,method,
    location,meeting_link,notes,status,created_by)
  values(c.id,c.vacancy_id,p_stage_id,p_scheduled_at,trim(p_timezone),p_method,
    nullif(trim(p_location),''),nullif(trim(p_meeting_link),''),coalesce(trim(p_notes),''),'SCHEDULED',actor)
  returning id into created_id;
  insert into public.activity_logs(candidate_id,actor_id,action,description,metadata)
  values(c.id,actor,'INTERVIEW_SCHEDULED','Interview scheduled',jsonb_build_object(
    'interview_id',created_id,'stage_id',p_stage_id,'scheduled_at',p_scheduled_at,'method',p_method));
  insert into public.audit_events(actor_profile_id,action,target_type,target_id,candidate_id,vacancy_id,interview_id,metadata)
  values(actor,'INTERVIEW_CREATED','interview',created_id,c.id,c.vacancy_id,created_id,jsonb_build_object(
    'stage_id',p_stage_id,'scheduled_at',p_scheduled_at,'method',p_method));
  return created_id;
end $$;

create function public.update_interview(
  p_interview_id uuid, p_stage_id uuid, p_scheduled_at timestamptz,
  p_timezone text, p_method text, p_location text default null,
  p_meeting_link text default null, p_notes text default ''
) returns void language plpgsql security definer set search_path = '' as $$
declare i public.interviews; actor uuid; schedule_changed boolean; candidate_name text; stage_name text; a record;
begin
  if not public.is_hr() then raise exception 'Access denied'; end if;
  actor := public.current_profile_id();
  select * into i from public.interviews where id = p_interview_id for update;
  if i.id is null then raise exception 'Interview not found'; end if;
  if i.status <> 'SCHEDULED' then raise exception 'Only scheduled interviews may be edited'; end if;
  if p_scheduled_at <= now() then raise exception 'Interview must be scheduled in the future'; end if;
  if not exists(select 1 from public.vacancy_stages where id = p_stage_id and vacancy_id = i.vacancy_id)
    then raise exception 'Interview stage does not belong to the candidate vacancy'; end if;
  schedule_changed := i.scheduled_at is distinct from p_scheduled_at;
  update public.interviews set stage_id=p_stage_id,scheduled_at=p_scheduled_at,timezone=trim(p_timezone),
    method=p_method,location=nullif(trim(p_location),''),meeting_link=nullif(trim(p_meeting_link),''),
    notes=coalesce(trim(p_notes),'') where id=i.id;
  insert into public.activity_logs(candidate_id,actor_id,action,description,metadata)
  values(i.candidate_id,actor,'INTERVIEW_UPDATED','Interview details updated',jsonb_build_object(
    'interview_id',i.id,'previous_scheduled_at',i.scheduled_at,'scheduled_at',p_scheduled_at,'schedule_changed',schedule_changed));
  insert into public.audit_events(actor_profile_id,action,target_type,target_id,candidate_id,vacancy_id,interview_id,metadata)
  values(actor,'INTERVIEW_UPDATED','interview',i.id,i.candidate_id,i.vacancy_id,i.id,jsonb_build_object(
    'previous_scheduled_at',i.scheduled_at,'scheduled_at',p_scheduled_at,'schedule_changed',schedule_changed));
  if schedule_changed then
    select full_name into candidate_name from public.candidates where id=i.candidate_id;
    select name into stage_name from public.vacancy_stages where id=p_stage_id;
    for a in select interviewer_profile_id from public.interview_assignments where interview_id=i.id loop
      perform public.create_notification(a.interviewer_profile_id,'INTERVIEW_CHANGED','Interview Updated',
        candidate_name||' · '||stage_name||' · New time: '||p_scheduled_at::text,
        i.candidate_id,i.id,'/interviews/'||i.id);
    end loop;
  end if;
end $$;

create function public.cancel_interview(p_interview_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare i public.interviews; actor uuid; candidate_name text; a record;
begin
  if not public.is_hr() then raise exception 'Access denied'; end if;
  actor := public.current_profile_id();
  select * into i from public.interviews where id=p_interview_id for update;
  if i.id is null then raise exception 'Interview not found'; end if;
  if i.status <> 'SCHEDULED' then raise exception 'Only scheduled interviews may be cancelled'; end if;
  update public.interviews set status='CANCELLED',cancelled_at=now() where id=i.id;
  insert into public.activity_logs(candidate_id,actor_id,action,description,metadata)
  values(i.candidate_id,actor,'INTERVIEW_CANCELLED','Interview cancelled',jsonb_build_object('interview_id',i.id));
  insert into public.audit_events(actor_profile_id,action,target_type,target_id,candidate_id,vacancy_id,interview_id)
  values(actor,'INTERVIEW_CANCELLED','interview',i.id,i.candidate_id,i.vacancy_id,i.id);
  select full_name into candidate_name from public.candidates where id=i.candidate_id;
  for a in select interviewer_profile_id from public.interview_assignments where interview_id=i.id loop
    perform public.create_notification(a.interviewer_profile_id,'INTERVIEW_CHANGED','Interview Cancelled',
      candidate_name||' · This interview has been cancelled.',i.candidate_id,i.id,'/interviews/'||i.id);
  end loop;
end $$;

create function public.assign_interviewers(
  p_interview_id uuid, p_interviewer_profile_ids uuid[], p_feedback_required boolean default true
) returns integer language plpgsql security definer set search_path = '' as $$
declare i public.interviews; actor uuid; interviewer_id uuid; assignment_id uuid;
  candidate_name text; stage_name text; created_count integer := 0;
begin
  if not public.is_hr() then raise exception 'Access denied'; end if;
  actor := public.current_profile_id();
  select * into i from public.interviews where id=p_interview_id for update;
  if i.id is null then raise exception 'Interview not found'; end if;
  if i.status <> 'SCHEDULED' then raise exception 'Interviewers may only be assigned to scheduled interviews'; end if;
  if coalesce(cardinality(p_interviewer_profile_ids),0)=0 then raise exception 'Choose at least one interviewer'; end if;
  if cardinality(p_interviewer_profile_ids)<>(select count(distinct value) from unnest(p_interviewer_profile_ids) value)
    then raise exception 'Duplicate interviewer selection is not permitted'; end if;
  select full_name into candidate_name from public.candidates where id=i.candidate_id;
  select name into stage_name from public.vacancy_stages where id=i.stage_id;
  foreach interviewer_id in array p_interviewer_profile_ids loop
    if not exists(select 1 from public.user_profiles where id=interviewer_id and role='INTERVIEWER')
      then raise exception 'Only INTERVIEWER profiles may be assigned'; end if;
    insert into public.interview_assignments(interview_id,interviewer_profile_id,assigned_by,feedback_required)
    values(i.id,interviewer_id,actor,p_feedback_required) returning id into assignment_id;
    created_count := created_count+1;
    perform public.create_notification(interviewer_id,'INTERVIEW_ASSIGNED','Interview Assigned',
      candidate_name||' · '||stage_name||' · '||i.scheduled_at::text,i.candidate_id,i.id,'/interviews/'||i.id);
    if p_feedback_required then
      perform public.create_notification(interviewer_id,'FEEDBACK_REQUIRED','Feedback Required',
        candidate_name||' · '||stage_name,i.candidate_id,i.id,'/interviews/'||i.id);
    end if;
    insert into public.activity_logs(candidate_id,actor_id,action,description,metadata)
    values(i.candidate_id,actor,'INTERVIEWER_ASSIGNED','Interviewer assigned',jsonb_build_object(
      'interview_id',i.id,'assignment_id',assignment_id,'interviewer_profile_id',interviewer_id,
      'feedback_required',p_feedback_required));
    insert into public.audit_events(actor_profile_id,action,target_type,target_id,candidate_id,vacancy_id,interview_id,metadata)
    values(actor,'INTERVIEWER_ASSIGNED','interview_assignment',assignment_id,i.candidate_id,i.vacancy_id,i.id,
      jsonb_build_object('interviewer_profile_id',interviewer_id,'feedback_required',p_feedback_required));
  end loop;
  return created_count;
end $$;

revoke all on function public.list_assignable_interviewers() from public,anon;
revoke all on function public.interview_assignment_details(uuid) from public,anon;
revoke all on function public.schedule_interview(uuid,uuid,timestamptz,text,text,text,text,text) from public,anon;
revoke all on function public.update_interview(uuid,uuid,timestamptz,text,text,text,text,text) from public,anon;
revoke all on function public.cancel_interview(uuid) from public,anon;
revoke all on function public.assign_interviewers(uuid,uuid[],boolean) from public,anon;
grant execute on function public.list_assignable_interviewers() to authenticated;
grant execute on function public.interview_assignment_details(uuid) to authenticated;
grant execute on function public.schedule_interview(uuid,uuid,timestamptz,text,text,text,text,text) to authenticated;
grant execute on function public.update_interview(uuid,uuid,timestamptz,text,text,text,text,text) to authenticated;
grant execute on function public.cancel_interview(uuid) to authenticated;
grant execute on function public.assign_interviewers(uuid,uuid[],boolean) to authenticated;

comment on function public.schedule_interview(uuid,uuid,timestamptz,text,text,text,text,text) is
  'HL-33 authoritative HR scheduling boundary with trusted candidate and vacancy context.';
comment on function public.assign_interviewers(uuid,uuid[],boolean) is
  'HL-34 authoritative HR assignment boundary with atomic activity, audit and notifications.';

-- Phase B mutations must use the audited RPC boundaries, not direct table writes.
revoke insert,update,delete on public.interviews from authenticated;
revoke insert,update,delete on public.interview_assignments from authenticated;
