-- HireLens Sprint 2 Phase A foundation
-- Jira: HL-33 through HL-49. This migration adds domain/security foundations only;
-- no Sprint 2 UI is introduced.

create type public.interview_status as enum ('SCHEDULED', 'COMPLETED', 'CANCELLED');
create type public.feedback_status as enum ('DRAFT', 'SUBMITTED');
create type public.notification_type as enum ('INTERVIEW_ASSIGNED', 'INTERVIEW_CHANGED', 'FEEDBACK_REQUIRED');

-- Composite uniqueness supports database-enforced candidate/vacancy/stage consistency.
alter table public.candidates add constraint candidates_id_vacancy_unique unique (id, vacancy_id);
alter table public.vacancy_stages add constraint vacancy_stages_id_vacancy_unique unique (id, vacancy_id);

create table public.interviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null,
  vacancy_id uuid not null,
  stage_id uuid not null,
  scheduled_at timestamptz not null,
  timezone text not null default 'UTC' check (char_length(trim(timezone)) between 1 and 100),
  method text not null check (method in ('IN_PERSON', 'VIDEO', 'PHONE')),
  location text,
  meeting_link text,
  notes text not null default '' check (char_length(notes) <= 5000),
  status public.interview_status not null default 'SCHEDULED',
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  constraint interviews_candidate_vacancy_fk foreign key (candidate_id, vacancy_id)
    references public.candidates(id, vacancy_id) on delete restrict,
  constraint interviews_stage_vacancy_fk foreign key (stage_id, vacancy_id)
    references public.vacancy_stages(id, vacancy_id) on delete restrict,
  constraint interviews_location_check check (
    (method = 'IN_PERSON' and nullif(trim(location), '') is not null)
    or method in ('VIDEO', 'PHONE')
  ),
  constraint interviews_meeting_link_check check (
    meeting_link is null or meeting_link ~ '^https://[^[:space:]]+$'
  ),
  constraint interviews_lifecycle_timestamps_check check (
    (status = 'SCHEDULED' and completed_at is null and cancelled_at is null)
    or (status = 'COMPLETED' and completed_at is not null and cancelled_at is null)
    or (status = 'CANCELLED' and cancelled_at is not null and completed_at is null)
  ),
  unique (id, candidate_id, vacancy_id, stage_id)
);

create table public.interview_assignments (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete restrict,
  interviewer_profile_id uuid not null references public.user_profiles(id) on delete restrict,
  assigned_by uuid not null references public.user_profiles(id) on delete restrict,
  feedback_required boolean not null default true,
  assigned_at timestamptz not null default now(),
  unique (interview_id, interviewer_profile_id),
  unique (id, interview_id)
);

create table public.evaluation_criteria (
  id uuid primary key default gen_random_uuid(),
  vacancy_id uuid not null references public.vacancies(id) on delete restrict,
  stage_id uuid,
  name text not null check (char_length(trim(name)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  weight numeric(5,2) check (weight is null or weight > 0 and weight <= 100),
  rating_required boolean not null default true,
  display_order integer not null check (display_order >= 0),
  active boolean not null default true,
  created_by uuid not null references public.user_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint criteria_stage_vacancy_fk foreign key (stage_id, vacancy_id)
    references public.vacancy_stages(id, vacancy_id) on delete restrict,
  unique nulls not distinct (vacancy_id, stage_id, name),
  unique nulls not distinct (vacancy_id, stage_id, display_order)
);

create table public.feedback_submissions (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null,
  vacancy_id uuid not null,
  stage_id uuid not null,
  interview_id uuid,
  interview_assignment_id uuid,
  author_profile_id uuid not null references public.user_profiles(id) on delete restrict,
  author_role public.user_role not null,
  remarks text not null check (char_length(trim(remarks)) between 1 and 5000),
  strengths text not null default '' check (char_length(strengths) <= 5000),
  concerns text not null default '' check (char_length(concerns) <= 5000),
  status public.feedback_status not null default 'DRAFT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  constraint feedback_candidate_vacancy_fk foreign key (candidate_id, vacancy_id)
    references public.candidates(id, vacancy_id) on delete restrict,
  constraint feedback_stage_vacancy_fk foreign key (stage_id, vacancy_id)
    references public.vacancy_stages(id, vacancy_id) on delete restrict,
  constraint feedback_interview_context_fk foreign key (interview_id, candidate_id, vacancy_id, stage_id)
    references public.interviews(id, candidate_id, vacancy_id, stage_id) on delete restrict,
  constraint feedback_assignment_context_fk foreign key (interview_assignment_id, interview_id)
    references public.interview_assignments(id, interview_id) on delete restrict,
  constraint feedback_interview_assignment_check check (
    (interview_id is null and interview_assignment_id is null)
    or (interview_id is not null and interview_assignment_id is not null)
  ),
  constraint feedback_submission_timestamp_check check (
    (status = 'DRAFT' and submitted_at is null)
    or (status = 'SUBMITTED' and submitted_at is not null)
  )
);

create unique index feedback_one_per_assignment_idx
  on public.feedback_submissions(interview_assignment_id)
  where interview_assignment_id is not null;
create unique index feedback_one_stage_remark_per_author_idx
  on public.feedback_submissions(candidate_id, stage_id, author_profile_id)
  where interview_id is null;

create table public.feedback_ratings (
  id uuid primary key default gen_random_uuid(),
  feedback_submission_id uuid not null references public.feedback_submissions(id) on delete restrict,
  criterion_id uuid not null references public.evaluation_criteria(id) on delete restrict,
  rating numeric(3,2) not null check (rating >= 1 and rating <= 5),
  criterion_name text not null check (char_length(trim(criterion_name)) between 1 and 100),
  criterion_weight numeric(5,2) check (criterion_weight is null or criterion_weight > 0 and criterion_weight <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (feedback_submission_id, criterion_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid not null references public.user_profiles(id) on delete cascade,
  type public.notification_type not null,
  title text not null check (char_length(trim(title)) between 1 and 120),
  message text not null check (char_length(trim(message)) between 1 and 500),
  candidate_id uuid references public.candidates(id) on delete cascade,
  interview_id uuid references public.interviews(id) on delete cascade,
  link_path text not null check (link_path ~ '^/[A-Za-z0-9/_?=&.-]*$' and link_path !~ '//'),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create table public.progression_overrides (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.candidates(id) on delete restrict,
  from_stage_id uuid not null references public.vacancy_stages(id) on delete restrict,
  to_stage_id uuid not null references public.vacancy_stages(id) on delete restrict,
  actor_profile_id uuid not null references public.user_profiles(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) > 0 and char_length(reason) <= 2000),
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.user_profiles(id) on delete restrict,
  action text not null check (char_length(trim(action)) between 1 and 100),
  target_type text not null check (char_length(trim(target_type)) between 1 and 60),
  target_id uuid,
  candidate_id uuid references public.candidates(id) on delete restrict,
  vacancy_id uuid references public.vacancies(id) on delete restrict,
  interview_id uuid references public.interviews(id) on delete restrict,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index interviews_candidate_stage_idx on public.interviews(candidate_id, stage_id, scheduled_at desc);
create index interviews_status_scheduled_idx on public.interviews(status, scheduled_at);
create index assignments_interviewer_idx on public.interview_assignments(interviewer_profile_id, assigned_at desc);
create index criteria_vacancy_stage_order_idx on public.evaluation_criteria(vacancy_id, stage_id, active, display_order);
create index feedback_candidate_stage_idx on public.feedback_submissions(candidate_id, stage_id, status, submitted_at desc);
create index feedback_author_idx on public.feedback_submissions(author_profile_id, status);
create index notifications_recipient_idx on public.notifications(recipient_profile_id, read_at, created_at desc);
create index overrides_candidate_idx on public.progression_overrides(candidate_id, created_at desc);
create index audit_created_idx on public.audit_events(created_at desc);
create index audit_candidate_idx on public.audit_events(candidate_id, created_at desc);
create index vacancies_department_status_idx on public.vacancies(department, status);
create index candidates_filter_idx on public.candidates(vacancy_id, current_stage_id, outcome, status);
create index candidates_name_search_idx on public.candidates(lower(full_name));

create trigger interviews_touch before update on public.interviews for each row execute function public.touch_updated_at();
create trigger criteria_touch before update on public.evaluation_criteria for each row execute function public.touch_updated_at();
create trigger feedback_touch before update on public.feedback_submissions for each row execute function public.touch_updated_at();
create trigger ratings_touch before update on public.feedback_ratings for each row execute function public.touch_updated_at();

create function public.validate_interviewer_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare assigned_role public.user_role; assigning_role public.user_role;
begin
  select role into assigned_role from public.user_profiles where id = new.interviewer_profile_id;
  select role into assigning_role from public.user_profiles where id = new.assigned_by;
  if assigned_role is distinct from 'INTERVIEWER'::public.user_role then
    raise exception 'Only INTERVIEWER profiles may be assigned';
  end if;
  if assigning_role is distinct from 'HR_RECRUITER'::public.user_role then
    raise exception 'Only HR recruiters may assign interviewers';
  end if;
  return new;
end $$;
create trigger assignments_validate_roles before insert or update on public.interview_assignments
for each row execute function public.validate_interviewer_assignment();

create function public.validate_feedback_context()
returns trigger language plpgsql security definer set search_path = '' as $$
declare assignment_interviewer uuid; profile_role public.user_role;
begin
  select role into profile_role from public.user_profiles where id = new.author_profile_id;
  if profile_role is null or new.author_role is distinct from profile_role then
    raise exception 'Feedback author role is invalid';
  end if;
  if new.interview_assignment_id is not null then
    select interviewer_profile_id into assignment_interviewer
    from public.interview_assignments where id = new.interview_assignment_id and interview_id = new.interview_id;
    if assignment_interviewer is distinct from new.author_profile_id then
      raise exception 'Feedback author is not assigned to this interview';
    end if;
  elsif profile_role is distinct from 'HR_RECRUITER'::public.user_role then
    raise exception 'Only HR may add non-interview stage remarks';
  end if;
  return new;
end $$;
create trigger feedback_validate_context before insert or update on public.feedback_submissions
for each row execute function public.validate_feedback_context();

create function public.prevent_submitted_feedback_changes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'SUBMITTED' and auth.role() <> 'service_role' then raise exception 'Submitted feedback is locked'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger feedback_lock_submitted before update or delete on public.feedback_submissions
for each row execute function public.prevent_submitted_feedback_changes();

create function public.prevent_submitted_rating_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare parent_status public.feedback_status;
begin
  select status into parent_status from public.feedback_submissions
  where id = coalesce(new.feedback_submission_id, old.feedback_submission_id);
  if parent_status = 'SUBMITTED' and auth.role() <> 'service_role' then raise exception 'Submitted feedback ratings are locked'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger ratings_lock_submitted before insert or update or delete on public.feedback_ratings
for each row execute function public.prevent_submitted_rating_changes();

create function public.validate_feedback_rating()
returns trigger language plpgsql security definer set search_path = '' as $$
declare f public.feedback_submissions; criterion public.evaluation_criteria; stage_specific boolean;
begin
  select * into f from public.feedback_submissions where id = new.feedback_submission_id;
  select * into criterion from public.evaluation_criteria where id = new.criterion_id and active;
  if f.interview_assignment_id is null then
    raise exception 'Non-interview stage remarks do not accept numerical ratings';
  end if;
  if f.id is null or criterion.id is null or criterion.vacancy_id <> f.vacancy_id then
    raise exception 'Rating criterion is invalid for this feedback';
  end if;
  select exists(select 1 from public.evaluation_criteria e
    where e.vacancy_id = f.vacancy_id and e.stage_id = f.stage_id and e.active) into stage_specific;
  if (stage_specific and criterion.stage_id is distinct from f.stage_id)
     or (not stage_specific and criterion.stage_id is not null) then
    raise exception 'Rating does not use the effective criterion set';
  end if;
  new.criterion_name := criterion.name;
  new.criterion_weight := criterion.weight;
  return new;
end $$;
create trigger ratings_validate_context before insert or update on public.feedback_ratings
for each row execute function public.validate_feedback_rating();

create function public.validate_feedback_submission()
returns trigger language plpgsql security definer set search_path = '' as $$
declare required_ratings bigint; supplied_ratings bigint; stage_specific boolean;
begin
  if tg_op = 'INSERT' and (new.status <> 'DRAFT' or new.submitted_at is not null) then
    raise exception 'Feedback must be created as a draft before submission';
  end if;
  if old.status = 'DRAFT' and new.status = 'SUBMITTED' then
    new.submitted_at := now();
    if new.interview_assignment_id is not null then
      select exists(select 1 from public.evaluation_criteria c
        where c.vacancy_id = new.vacancy_id and c.stage_id = new.stage_id and c.active)
        into stage_specific;
      select count(*) into required_ratings
      from public.evaluation_criteria c where c.vacancy_id = new.vacancy_id and c.active and c.rating_required
        and ((stage_specific and c.stage_id = new.stage_id) or (not stage_specific and c.stage_id is null));
      select count(*) into supplied_ratings from public.feedback_ratings r
      join public.evaluation_criteria c on c.id = r.criterion_id
      where r.feedback_submission_id = new.id and c.active and c.rating_required
        and ((stage_specific and c.stage_id = new.stage_id) or (not stage_specific and c.stage_id is null));
      if supplied_ratings <> required_ratings then
        raise exception 'All required evaluation ratings must be completed before submission';
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger feedback_validate_submission before insert or update on public.feedback_submissions
for each row execute function public.validate_feedback_submission();

create function public.validate_criteria_weight_set()
returns trigger language plpgsql security definer set search_path = '' as $$
declare checked_vacancy uuid := coalesce(new.vacancy_id, old.vacancy_id);
        checked_stage uuid := coalesce(new.stage_id, old.stage_id);
        configured bigint; unweighted bigint; total numeric;
begin
  if tg_op = 'UPDATE' and
     (new.vacancy_id is distinct from old.vacancy_id or new.stage_id is distinct from old.stage_id) then
    raise exception 'Criterion scope cannot be changed';
  end if;
  select count(*) filter (where weight is not null), count(*) filter (where weight is null), coalesce(sum(weight), 0)
  into configured, unweighted, total from public.evaluation_criteria
  where vacancy_id = checked_vacancy and stage_id is not distinct from checked_stage and active;
  if configured > 0 and (unweighted > 0 or total <> 100) then
    raise exception 'Active criterion weights must all be set and total 100 percent';
  end if;
  return null;
end $$;
create constraint trigger criteria_weights_total
after insert or update or delete on public.evaluation_criteria deferrable initially deferred
for each row execute function public.validate_criteria_weight_set();

create function public.effective_evaluation_criteria(p_vacancy_id uuid, p_stage_id uuid)
returns setof public.evaluation_criteria language sql stable security invoker set search_path = '' as $$
  select e.* from public.evaluation_criteria e
  where e.vacancy_id = p_vacancy_id and e.active
    and e.stage_id is not distinct from (
      case when exists(select 1 from public.evaluation_criteria s
        where s.vacancy_id = p_vacancy_id and s.stage_id = p_stage_id and s.active)
      then p_stage_id else null end)
  order by e.display_order
$$;

create function public.feedback_overall_score(p_feedback_id uuid)
returns numeric language sql stable security invoker set search_path = '' as $$
  select case when count(*) = 0 then null
    when count(criterion_weight) > 0 then round(sum(rating * criterion_weight) / 100, 2)
    else round(avg(rating), 2) end
  from public.feedback_ratings where feedback_submission_id = p_feedback_id
$$;

create function public.feedback_completion(p_candidate_id uuid, p_stage_id uuid)
returns table(required_count bigint, submitted_count bigint, complete boolean)
language sql stable security definer set search_path = '' as $$
  with required as (
    select a.id from public.interview_assignments a join public.interviews i on i.id = a.interview_id
    where i.candidate_id = p_candidate_id and i.stage_id = p_stage_id
      and i.status <> 'CANCELLED' and a.feedback_required
  ), submitted as (
    select distinct r.id from required r join public.feedback_submissions f
      on f.interview_assignment_id = r.id and f.status = 'SUBMITTED'
  )
  select count(r.id), count(s.id), count(r.id) = count(s.id)
  from required r left join submitted s on s.id = r.id
$$;

create function public.feedback_disagreement(p_candidate_id uuid, p_stage_id uuid)
returns numeric language sql stable security invoker set search_path = '' as $$
  with scores as (
    select public.feedback_overall_score(f.id) score from public.feedback_submissions f
    where f.candidate_id = p_candidate_id and f.stage_id = p_stage_id
      and f.interview_assignment_id is not null and f.status = 'SUBMITTED'
  ) select case when count(score) < 2 then null else round(max(score) - min(score), 2) end from scores
$$;
comment on function public.feedback_disagreement(uuid, uuid) is
  'HL-41: UI displays HUMAN REVIEW REQUIRED when this 1-5 score range is >= 1.5. Never changes candidate outcome.';

create function public.create_notification(
  p_recipient_profile_id uuid, p_type public.notification_type, p_title text, p_message text,
  p_candidate_id uuid, p_interview_id uuid, p_link_path text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare created_id uuid;
begin
  insert into public.notifications(recipient_profile_id,type,title,message,candidate_id,interview_id,link_path)
  values(p_recipient_profile_id,p_type,p_title,p_message,p_candidate_id,p_interview_id,p_link_path)
  returning id into created_id;
  return created_id;
end $$;
revoke all on function public.create_notification(uuid,public.notification_type,text,text,uuid,uuid,text) from public, anon, authenticated;

create function public.has_submitted_own_feedback(p_candidate_id uuid, p_stage_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.feedback_submissions f
    where f.candidate_id = p_candidate_id and f.stage_id = p_stage_id
      and f.author_profile_id = public.current_profile_id() and f.status = 'SUBMITTED')
$$;
revoke all on function public.has_submitted_own_feedback(uuid,uuid) from public, anon;
grant execute on function public.has_submitted_own_feedback(uuid,uuid) to authenticated;

alter table public.interviews enable row level security;
alter table public.interview_assignments enable row level security;
alter table public.evaluation_criteria enable row level security;
alter table public.feedback_submissions enable row level security;
alter table public.feedback_ratings enable row level security;
alter table public.notifications enable row level security;
alter table public.progression_overrides enable row level security;
alter table public.audit_events enable row level security;

create policy interviews_authorized_read on public.interviews for select to authenticated using (
  public.current_role() in ('HR_RECRUITER','MANAGEMENT')
  or exists(select 1 from public.interview_assignments a where a.interview_id = id and a.interviewer_profile_id = public.current_profile_id())
);
create policy interviews_hr_insert on public.interviews for insert to authenticated
  with check (public.is_hr() and created_by = public.current_profile_id());
create policy interviews_hr_update on public.interviews for update to authenticated using (public.is_hr()) with check (public.is_hr());

create policy assignments_authorized_read on public.interview_assignments for select to authenticated using (
  public.current_role() in ('HR_RECRUITER','MANAGEMENT') or interviewer_profile_id = public.current_profile_id()
);
create policy assignments_hr_insert on public.interview_assignments for insert to authenticated
  with check (public.is_hr() and assigned_by = public.current_profile_id());
create policy assignments_hr_update on public.interview_assignments for update to authenticated using (public.is_hr()) with check (public.is_hr());

create policy criteria_authenticated_read on public.evaluation_criteria for select to authenticated using (true);
create policy criteria_hr_insert on public.evaluation_criteria for insert to authenticated
  with check (public.is_hr() and created_by = public.current_profile_id());
create policy criteria_hr_update on public.evaluation_criteria for update to authenticated
  using (public.is_hr()) with check (public.is_hr());

create policy feedback_independent_read on public.feedback_submissions for select to authenticated using (
  author_profile_id = public.current_profile_id()
  or (public.current_role() in ('HR_RECRUITER','MANAGEMENT') and status = 'SUBMITTED')
  or (public.current_role() = 'INTERVIEWER' and status = 'SUBMITTED'
    and public.has_submitted_own_feedback(candidate_id, stage_id))
);
create policy feedback_author_insert on public.feedback_submissions for insert to authenticated with check (
  author_profile_id = public.current_profile_id() and author_role = public.current_role()
  and (public.is_hr() or (public.current_role() = 'INTERVIEWER' and interview_assignment_id is not null))
);
create policy feedback_author_draft_update on public.feedback_submissions for update to authenticated
  using (author_profile_id = public.current_profile_id() and status = 'DRAFT')
  with check (author_profile_id = public.current_profile_id());

create policy ratings_feedback_read on public.feedback_ratings for select to authenticated using (
  exists(select 1 from public.feedback_submissions f where f.id = feedback_submission_id)
);
create policy ratings_author_draft_write on public.feedback_ratings for all to authenticated using (
  exists(select 1 from public.feedback_submissions f where f.id = feedback_submission_id
    and f.author_profile_id = public.current_profile_id() and f.status = 'DRAFT')
) with check (
  exists(select 1 from public.feedback_submissions f where f.id = feedback_submission_id
    and f.author_profile_id = public.current_profile_id() and f.status = 'DRAFT')
);

create policy notifications_self_read on public.notifications for select to authenticated
  using (recipient_profile_id = public.current_profile_id());
create policy notifications_self_mark_read on public.notifications for update to authenticated
  using (recipient_profile_id = public.current_profile_id())
  with check (recipient_profile_id = public.current_profile_id());

create policy overrides_hr_management_read on public.progression_overrides for select to authenticated
  using (public.current_role() in ('HR_RECRUITER','MANAGEMENT'));
create policy audit_hr_management_read on public.audit_events for select to authenticated
  using (public.current_role() in ('HR_RECRUITER','MANAGEMENT'));

revoke insert, update, delete on public.progression_overrides from authenticated;
revoke insert, update, delete on public.audit_events from authenticated;
revoke insert, update, delete on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke delete on public.interviews, public.interview_assignments, public.evaluation_criteria,
  public.feedback_submissions, public.feedback_ratings from authenticated;

-- Replace the two-argument function so no older callable path can bypass the gate.
drop function public.move_candidate(uuid, uuid);
create function public.move_candidate(
  p_candidate_id uuid,
  p_target_stage_id uuid,
  p_override boolean default false,
  p_override_reason text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  c public.candidates;
  current_order integer;
  target_order integer;
  actor uuid;
  required_feedback bigint;
  submitted_feedback bigint;
  missing_feedback bigint;
  override_id uuid;
begin
  if not public.is_hr() then raise exception 'Access denied'; end if;
  actor := public.current_profile_id();
  select * into c from public.candidates where id = p_candidate_id for update;
  if c.id is null then raise exception 'Candidate not found'; end if;
  if c.status <> 'ACTIVE' then raise exception 'Closed candidates cannot change stage'; end if;

  select stage_order into current_order from public.vacancy_stages
    where id = c.current_stage_id and vacancy_id = c.vacancy_id;
  select stage_order into target_order from public.vacancy_stages
    where id = p_target_stage_id and vacancy_id = c.vacancy_id;
  if target_order is null or target_order <> current_order + 1 then
    raise exception 'Only the next configured stage is permitted';
  end if;

  select fc.required_count, fc.submitted_count into required_feedback, submitted_feedback
  from public.feedback_completion(c.id, c.current_stage_id) fc;
  missing_feedback := required_feedback - submitted_feedback;

  if missing_feedback > 0 and not p_override then
    raise exception 'Candidate cannot progress: % required feedback submission(s) pending', missing_feedback;
  end if;
  if p_override and missing_feedback = 0 then raise exception 'Override is not required'; end if;
  if p_override and nullif(trim(p_override_reason), '') is null then raise exception 'Override reason is required'; end if;
  if p_override and char_length(p_override_reason) > 2000 then raise exception 'Override reason is too long'; end if;

  update public.candidates set current_stage_id = p_target_stage_id where id = p_candidate_id;
  insert into public.candidate_stage_history(candidate_id, previous_stage_id, new_stage_id, changed_by)
  values(c.id, c.current_stage_id, p_target_stage_id, actor);
  insert into public.activity_logs(candidate_id, actor_id, action, description, metadata)
  values(c.id, actor, 'STAGE_CHANGED', 'Candidate moved to the next recruitment stage',
    jsonb_build_object('previous_stage_id', c.current_stage_id, 'new_stage_id', p_target_stage_id,
      'feedback_required', required_feedback, 'feedback_submitted', submitted_feedback, 'override', p_override));

  if p_override then
    insert into public.progression_overrides(candidate_id,from_stage_id,to_stage_id,actor_profile_id,reason)
    values(c.id,c.current_stage_id,p_target_stage_id,actor,trim(p_override_reason)) returning id into override_id;
    insert into public.audit_events(actor_profile_id,action,target_type,target_id,candidate_id,vacancy_id,metadata)
    values(actor,'PROGRESSION_OVERRIDDEN','candidate',c.id,c.id,c.vacancy_id,
      jsonb_build_object('from_stage_id',c.current_stage_id,'to_stage_id',p_target_stage_id,
        'override_id',override_id,'reason',trim(p_override_reason),'pending_feedback',missing_feedback));
    insert into public.activity_logs(candidate_id,actor_id,action,description,metadata)
    values(c.id,actor,'PROGRESSION_OVERRIDDEN','Candidate progression gate overridden by HR',
      jsonb_build_object('from_stage_id',c.current_stage_id,'to_stage_id',p_target_stage_id,
        'override_id',override_id,'reason',trim(p_override_reason)));
  else
    insert into public.audit_events(actor_profile_id,action,target_type,target_id,candidate_id,vacancy_id,metadata)
    values(actor,'CANDIDATE_PROGRESSED','candidate',c.id,c.id,c.vacancy_id,
      jsonb_build_object('from_stage_id',c.current_stage_id,'to_stage_id',p_target_stage_id,
        'feedback_required',required_feedback,'feedback_submitted',submitted_feedback));
  end if;
end $$;

revoke all on function public.move_candidate(uuid,uuid,boolean,text) from public, anon;
grant execute on function public.move_candidate(uuid,uuid,boolean,text) to authenticated;
grant execute on function public.feedback_completion(uuid,uuid) to authenticated;
grant execute on function public.feedback_disagreement(uuid,uuid) to authenticated;
grant execute on function public.feedback_overall_score(uuid) to authenticated;
grant execute on function public.effective_evaluation_criteria(uuid,uuid) to authenticated;
revoke all on function public.feedback_completion(uuid,uuid) from public, anon;
revoke all on function public.feedback_disagreement(uuid,uuid) from public, anon;
revoke all on function public.feedback_overall_score(uuid) from public, anon;
revoke all on function public.effective_evaluation_criteria(uuid,uuid) from public, anon;

comment on function public.move_candidate(uuid,uuid,boolean,text) is
  'Authoritative Sprint 1/2 transition boundary: sequential HR movement, feedback gate, reasoned override and atomic evidence.';
comment on table public.feedback_submissions is
  'Unified HL-36 model for non-interview stage remarks and assigned structured interview feedback.';
comment on table public.evaluation_criteria is
  'HL-49 criteria: stage_id NULL is vacancy-wide; active stage-specific rows take precedence for that stage.';
