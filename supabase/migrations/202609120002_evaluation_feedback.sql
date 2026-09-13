-- HireLens Sprint 2 Phase C: HL-36, HL-49 and HL-37 secure evaluation workflow.

create function public.can_read_evaluation_criterion(p_vacancy_id uuid,p_stage_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.current_role() in ('HR_RECRUITER','MANAGEMENT') or exists(
    select 1 from public.interviews i join public.interview_assignments a on a.interview_id=i.id
    where a.interviewer_profile_id=public.current_profile_id() and i.vacancy_id=p_vacancy_id
      and ((p_stage_id=i.stage_id) or (p_stage_id is null and not exists(
        select 1 from public.evaluation_criteria c where c.vacancy_id=i.vacancy_id
          and c.stage_id=i.stage_id and c.active)))
  )
$$;
revoke all on function public.can_read_evaluation_criterion(uuid,uuid) from public,anon;
grant execute on function public.can_read_evaluation_criterion(uuid,uuid) to authenticated;
drop policy criteria_authenticated_read on public.evaluation_criteria;
create policy criteria_authorized_read on public.evaluation_criteria for select to authenticated
using(public.can_read_evaluation_criterion(vacancy_id,stage_id));

create function public.save_evaluation_criteria(p_vacancy_id uuid,p_stage_id uuid,p_criteria jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare actor uuid; item record; configured bigint; unweighted bigint; total numeric; saved integer:=0;
begin
  if not public.is_hr() then raise exception 'Access denied'; end if;
  actor:=public.current_profile_id();
  if not exists(select 1 from public.vacancies where id=p_vacancy_id) then raise exception 'Vacancy not found'; end if;
  if p_stage_id is not null and not exists(select 1 from public.vacancy_stages where id=p_stage_id and vacancy_id=p_vacancy_id)
    then raise exception 'Criterion stage does not belong to vacancy'; end if;
  if jsonb_typeof(p_criteria)<>'array' or jsonb_array_length(p_criteria)=0 then raise exception 'Add at least one criterion'; end if;
  if exists(select 1 from jsonb_to_recordset(p_criteria) as x(id uuid,name text,description text,weight numeric,rating_required boolean,display_order integer)
    where nullif(trim(name),'') is null or char_length(trim(name))>100 or char_length(coalesce(description,''))>1000
      or display_order<0 or weight<=0 or weight>100) then raise exception 'Criterion data is invalid'; end if;
  if (select count(*) from jsonb_to_recordset(p_criteria) as x(name text)) <>
     (select count(distinct lower(trim(name))) from jsonb_to_recordset(p_criteria) as x(name text))
    then raise exception 'Criterion names must be unique'; end if;
  if (select count(*) from jsonb_to_recordset(p_criteria) as x(display_order integer)) <>
     (select count(distinct display_order) from jsonb_to_recordset(p_criteria) as x(display_order integer))
    then raise exception 'Criterion order must be unique'; end if;
  select count(*) filter(where weight is not null),count(*) filter(where weight is null),coalesce(sum(weight),0)
    into configured,unweighted,total from jsonb_to_recordset(p_criteria) as x(weight numeric);
  if configured>0 and (unweighted>0 or total<>100) then
    raise exception using message = 'Active weighted criteria must total 100%';
  end if;
  if exists(select 1 from jsonb_to_recordset(p_criteria) as x(id uuid) join public.evaluation_criteria c on c.id=x.id
    where c.vacancy_id<>p_vacancy_id or c.stage_id is distinct from p_stage_id) then raise exception 'Criterion does not belong to this scope'; end if;
  if exists(select 1 from public.evaluation_criteria c where c.vacancy_id=p_vacancy_id and c.stage_id is not distinct from p_stage_id and c.active
    and not exists(select 1 from jsonb_to_recordset(p_criteria) as x(id uuid) where x.id=c.id))
    then raise exception 'Existing active criteria must be retained'; end if;
  update public.evaluation_criteria set display_order=display_order+10000
    where vacancy_id=p_vacancy_id and stage_id is not distinct from p_stage_id and active;
  for item in select * from jsonb_to_recordset(p_criteria) as x(id uuid,name text,description text,weight numeric,rating_required boolean,display_order integer) loop
    if item.id is null then
      insert into public.evaluation_criteria(vacancy_id,stage_id,name,description,weight,rating_required,display_order,active,created_by)
      values(p_vacancy_id,p_stage_id,trim(item.name),coalesce(trim(item.description),''),item.weight,coalesce(item.rating_required,true),item.display_order,true,actor);
    else
      update public.evaluation_criteria set name=trim(item.name),description=coalesce(trim(item.description),''),weight=item.weight,
        rating_required=coalesce(item.rating_required,true),display_order=item.display_order,active=true where id=item.id;
      if not found then raise exception 'Criterion not found'; end if;
    end if;
    saved:=saved+1;
  end loop;
  insert into public.audit_events(actor_profile_id,action,target_type,target_id,vacancy_id,metadata)
  values(actor,'CRITERIA_CONFIGURED','vacancy',p_vacancy_id,p_vacancy_id,jsonb_build_object('stage_id',p_stage_id,'criterion_count',saved,'weighted',configured>0));
  return saved;
end $$;

create function public.save_feedback_draft(p_interview_id uuid,p_remarks text,p_strengths text,p_concerns text,p_ratings jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid; i public.interviews; assignment_id uuid; feedback_id uuid; rating_item record;
begin
  if public.current_role()<>'INTERVIEWER' then raise exception 'Access denied'; end if;
  actor:=public.current_profile_id();
  select * into i from public.interviews where id=p_interview_id;
  if i.id is null then raise exception 'Interview not found or not assigned'; end if;
  if i.status='CANCELLED' then raise exception 'Cancelled interviews do not accept feedback'; end if;
  select id into assignment_id from public.interview_assignments where interview_id=i.id and interviewer_profile_id=actor;
  if assignment_id is null then raise exception 'Interview not assigned to current user'; end if;
  if nullif(trim(p_remarks),'') is null or char_length(p_remarks)>5000 then raise exception 'Remarks are required'; end if;
  if char_length(coalesce(p_strengths,''))>5000 or char_length(coalesce(p_concerns,''))>5000 then raise exception 'Feedback text is too long'; end if;
  if jsonb_typeof(p_ratings)<>'array' then raise exception 'Rating data is invalid'; end if;
  if (select count(*) from jsonb_to_recordset(p_ratings) as x(criterion_id uuid,rating numeric)) <>
     (select count(distinct criterion_id) from jsonb_to_recordset(p_ratings) as x(criterion_id uuid,rating numeric))
    then raise exception 'Duplicate criterion rating'; end if;
  select id into feedback_id from public.feedback_submissions where interview_assignment_id=assignment_id;
  if feedback_id is null then
    insert into public.feedback_submissions(candidate_id,vacancy_id,stage_id,interview_id,interview_assignment_id,
      author_profile_id,author_role,remarks,strengths,concerns,status)
    values(i.candidate_id,i.vacancy_id,i.stage_id,i.id,assignment_id,actor,'INTERVIEWER',trim(p_remarks),
      coalesce(trim(p_strengths),''),coalesce(trim(p_concerns),''),'DRAFT') returning id into feedback_id;
  else
    if exists(select 1 from public.feedback_submissions where id=feedback_id and status='SUBMITTED')
      then raise exception 'Submitted feedback is locked'; end if;
    update public.feedback_submissions set remarks=trim(p_remarks),strengths=coalesce(trim(p_strengths),''),
      concerns=coalesce(trim(p_concerns),'') where id=feedback_id;
    delete from public.feedback_ratings where feedback_submission_id=feedback_id;
  end if;
  for rating_item in select * from jsonb_to_recordset(p_ratings) as x(criterion_id uuid,rating numeric) loop
    insert into public.feedback_ratings(feedback_submission_id,criterion_id,rating,criterion_name)
    values(feedback_id,rating_item.criterion_id,rating_item.rating,'Validated by trigger');
  end loop;
  return feedback_id;
end $$;

create function public.submit_interview_feedback(p_interview_id uuid,p_remarks text,p_strengths text,p_concerns text,p_ratings jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare feedback_id uuid;
begin
  feedback_id:=public.save_feedback_draft(p_interview_id,p_remarks,p_strengths,p_concerns,p_ratings);
  update public.feedback_submissions set status='SUBMITTED' where id=feedback_id;
  return feedback_id;
end $$;

create function public.add_stage_remark(p_candidate_id uuid,p_stage_id uuid,p_remarks text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid;c public.candidates;feedback_id uuid;
begin
  if not public.is_hr() then raise exception 'Access denied'; end if;
  actor:=public.current_profile_id();select * into c from public.candidates where id=p_candidate_id;
  if c.id is null then raise exception 'Candidate not found'; end if;
  if not exists(select 1 from public.vacancy_stages where id=p_stage_id and vacancy_id=c.vacancy_id)
    then raise exception 'Stage does not belong to candidate vacancy'; end if;
  if nullif(trim(p_remarks),'') is null or char_length(p_remarks)>5000 then raise exception 'Remarks are required'; end if;
  insert into public.feedback_submissions(candidate_id,vacancy_id,stage_id,author_profile_id,author_role,remarks,status)
  values(c.id,c.vacancy_id,p_stage_id,actor,'HR_RECRUITER',trim(p_remarks),'DRAFT') returning id into feedback_id;
  update public.feedback_submissions set status='SUBMITTED' where id=feedback_id;
  return feedback_id;
end $$;

create function public.log_feedback_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare event_action text;event_description text;
begin
  if old.status='DRAFT' and new.status='SUBMITTED' then
    event_action:=case when new.interview_id is null then 'STAGE_REMARK_ADDED' else 'INTERVIEW_FEEDBACK_SUBMITTED' end;
    event_description:=case when new.interview_id is null then 'Stage remark added' else 'Interview feedback submitted' end;
    insert into public.activity_logs(candidate_id,actor_id,action,description,metadata)
    values(new.candidate_id,new.author_profile_id,event_action,event_description,jsonb_build_object(
      'feedback_submission_id',new.id,'stage_id',new.stage_id,'interview_id',new.interview_id));
    insert into public.audit_events(actor_profile_id,action,target_type,target_id,candidate_id,vacancy_id,interview_id,metadata)
    values(new.author_profile_id,event_action,'feedback_submission',new.id,new.candidate_id,new.vacancy_id,new.interview_id,
      jsonb_build_object('stage_id',new.stage_id,'submitted_at',new.submitted_at));
  end if;
  return new;
end $$;
create trigger feedback_log_submission after update on public.feedback_submissions
for each row execute function public.log_feedback_submission();

create function public.interview_feedback_status(p_interview_id uuid)
returns table(assignment_id uuid,interviewer_profile_id uuid,full_name text,feedback_required boolean,feedback_status text,submitted_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.current_role() not in ('HR_RECRUITER','MANAGEMENT') and not public.is_assigned_to_interview(p_interview_id)
    then raise exception 'Access denied'; end if;
  return query select a.id,a.interviewer_profile_id,p.full_name,a.feedback_required,
    coalesce(f.status::text,'PENDING'),f.submitted_at
  from public.interview_assignments a join public.user_profiles p on p.id=a.interviewer_profile_id
  left join public.feedback_submissions f on f.interview_assignment_id=a.id
  where a.interview_id=p_interview_id order by p.full_name;
end $$;

create function public.candidate_feedback_evidence(p_candidate_id uuid)
returns table(id uuid,stage_id uuid,stage_name text,interview_id uuid,author_name text,remarks text,
  strengths text,concerns text,submitted_at timestamptz,overall_score numeric,ratings jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if public.current_role() not in ('HR_RECRUITER','MANAGEMENT') then raise exception 'Access denied'; end if;
  return query select f.id,f.stage_id,s.name,f.interview_id,p.full_name,f.remarks,f.strengths,f.concerns,
    f.submitted_at,public.feedback_overall_score(f.id),coalesce((select jsonb_agg(jsonb_build_object(
      'criterion_name',r.criterion_name,'criterion_weight',r.criterion_weight,'rating',r.rating) order by r.created_at)
      from public.feedback_ratings r where r.feedback_submission_id=f.id),'[]'::jsonb)
  from public.feedback_submissions f join public.vacancy_stages s on s.id=f.stage_id
  join public.user_profiles p on p.id=f.author_profile_id
  where f.candidate_id=p_candidate_id and f.status='SUBMITTED' order by f.submitted_at;
end $$;

revoke all on function public.save_evaluation_criteria(uuid,uuid,jsonb) from public,anon;
revoke all on function public.save_feedback_draft(uuid,text,text,text,jsonb) from public,anon;
revoke all on function public.submit_interview_feedback(uuid,text,text,text,jsonb) from public,anon;
revoke all on function public.add_stage_remark(uuid,uuid,text) from public,anon;
revoke all on function public.interview_feedback_status(uuid) from public,anon;
revoke all on function public.candidate_feedback_evidence(uuid) from public,anon;
grant execute on function public.save_evaluation_criteria(uuid,uuid,jsonb) to authenticated;
grant execute on function public.save_feedback_draft(uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.submit_interview_feedback(uuid,text,text,text,jsonb) to authenticated;
grant execute on function public.add_stage_remark(uuid,uuid,text) to authenticated;
grant execute on function public.interview_feedback_status(uuid) to authenticated;
grant execute on function public.candidate_feedback_evidence(uuid) to authenticated;

-- Criteria configuration must pass through the atomic, audited set RPC.
revoke insert,update,delete on public.evaluation_criteria from authenticated;

comment on function public.save_evaluation_criteria(uuid,uuid,jsonb) is 'HL-49 atomic HR criteria-set configuration with optional exact-100 weights.';
comment on function public.submit_interview_feedback(uuid,text,text,text,jsonb) is 'HL-36 assignment-derived structured feedback submission; Phase A locks final evidence.';
