create extension if not exists pgcrypto;

create type public.user_role as enum ('HR_RECRUITER','INTERVIEWER','MANAGEMENT');
create type public.vacancy_status as enum ('ACTIVE','ARCHIVED');
create type public.candidate_status as enum ('ACTIVE','CLOSED');
create type public.candidate_outcome as enum ('HIRED','REJECTED','ON_HOLD');

create table public.user_profiles (
  id uuid primary key default gen_random_uuid(), authentication_user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) >= 2), role public.user_role not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.vacancies (
  id uuid primary key default gen_random_uuid(), title text not null, department text not null, location text not null,
  employment_type text not null check (employment_type in ('FULL_TIME','PART_TIME','CONTRACT','TEMPORARY','INTERNSHIP')),
  description text not null check (char_length(trim(description)) >= 20), status public.vacancy_status not null default 'ACTIVE',
  created_by uuid not null references public.user_profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), archived_at timestamptz,
  check ((status = 'ACTIVE' and archived_at is null) or (status = 'ARCHIVED' and archived_at is not null))
);
create table public.vacancy_stages (
  id uuid primary key default gen_random_uuid(), vacancy_id uuid not null references public.vacancies(id) on delete restrict,
  name text not null check (char_length(trim(name)) > 0), stage_order integer not null check (stage_order >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(vacancy_id, stage_order), unique(vacancy_id, name)
);
create table public.candidates (
  id uuid primary key default gen_random_uuid(), vacancy_id uuid not null references public.vacancies(id) on delete restrict,
  current_stage_id uuid not null references public.vacancy_stages(id) on delete restrict, full_name text not null, email text not null,
  phone text not null, source text not null, notes text not null default '', status public.candidate_status not null default 'ACTIVE',
  outcome public.candidate_outcome, created_by uuid not null references public.user_profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(vacancy_id, email)
);
create table public.candidate_documents (
  id uuid primary key default gen_random_uuid(), candidate_id uuid not null references public.candidates(id) on delete restrict,
  file_name text not null, storage_path text not null unique, file_type text not null check (file_type in ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  uploaded_by uuid not null references public.user_profiles(id), uploaded_at timestamptz not null default now()
);
create unique index one_cv_per_candidate on public.candidate_documents(candidate_id);
create table public.candidate_stage_history (
  id uuid primary key default gen_random_uuid(), candidate_id uuid not null references public.candidates(id) on delete restrict,
  previous_stage_id uuid references public.vacancy_stages(id) on delete restrict, new_stage_id uuid not null references public.vacancy_stages(id) on delete restrict,
  changed_by uuid not null references public.user_profiles(id), changed_at timestamptz not null default now()
);
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(), candidate_id uuid not null references public.candidates(id) on delete restrict,
  actor_id uuid not null references public.user_profiles(id), action text not null, description text not null,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create index candidates_vacancy_idx on public.candidates(vacancy_id);
create index candidates_stage_idx on public.candidates(current_stage_id);
create index stage_history_candidate_idx on public.candidate_stage_history(candidate_id, changed_at desc);
create index activity_candidate_idx on public.activity_logs(candidate_id, created_at desc);

create function public.touch_updated_at() returns trigger language plpgsql security invoker set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.user_profiles for each row execute function public.touch_updated_at();
create trigger vacancies_touch before update on public.vacancies for each row execute function public.touch_updated_at();
create trigger stages_touch before update on public.vacancy_stages for each row execute function public.touch_updated_at();
create trigger candidates_touch before update on public.candidates for each row execute function public.touch_updated_at();

create function public.current_profile_id() returns uuid language sql stable security definer set search_path = '' as $$ select id from public.user_profiles where authentication_user_id = auth.uid() $$;
create function public.current_role() returns public.user_role language sql stable security definer set search_path = '' as $$ select role from public.user_profiles where authentication_user_id = auth.uid() $$;
create function public.is_hr() returns boolean language sql stable security definer set search_path = '' as $$ select coalesce(public.current_role() = 'HR_RECRUITER', false) $$;

alter table public.user_profiles enable row level security; alter table public.vacancies enable row level security;
alter table public.vacancy_stages enable row level security; alter table public.candidates enable row level security;
alter table public.candidate_documents enable row level security; alter table public.candidate_stage_history enable row level security; alter table public.activity_logs enable row level security;
create policy profiles_self_select on public.user_profiles for select to authenticated using (authentication_user_id = auth.uid());
create policy vacancies_read on public.vacancies for select to authenticated using (true);
create policy vacancies_hr_insert on public.vacancies for insert to authenticated with check (public.is_hr() and created_by = public.current_profile_id());
create policy vacancies_hr_update on public.vacancies for update to authenticated using (public.is_hr()) with check (public.is_hr());
create policy stages_read on public.vacancy_stages for select to authenticated using (true);
create policy stages_hr_write on public.vacancy_stages for all to authenticated using (public.is_hr()) with check (public.is_hr());
create policy candidates_read on public.candidates for select to authenticated using (true);
create policy candidates_hr_write on public.candidates for all to authenticated using (public.is_hr()) with check (public.is_hr());
revoke update on public.candidates from authenticated;
grant update (full_name, email, phone, source, notes) on public.candidates to authenticated;
create policy documents_read on public.candidate_documents for select to authenticated using (true);
create policy documents_hr_write on public.candidate_documents for all to authenticated using (public.is_hr()) with check (public.is_hr());
create policy history_read on public.candidate_stage_history for select to authenticated using (true);
create policy history_hr_insert on public.candidate_stage_history for insert to authenticated with check (public.is_hr() and changed_by = public.current_profile_id());
create policy logs_read on public.activity_logs for select to authenticated using (true);
create policy logs_hr_insert on public.activity_logs for insert to authenticated with check (public.is_hr() and actor_id = public.current_profile_id());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('candidate-cvs','candidate-cvs',false,5242880,array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);
create policy cv_authenticated_read on storage.objects for select to authenticated using (bucket_id = 'candidate-cvs');
create policy cv_hr_insert on storage.objects for insert to authenticated with check (bucket_id = 'candidate-cvs' and public.is_hr());
create policy cv_hr_update on storage.objects for update to authenticated using (bucket_id = 'candidate-cvs' and public.is_hr());
create policy cv_hr_delete on storage.objects for delete to authenticated using (bucket_id = 'candidate-cvs' and public.is_hr());

revoke update, delete on public.activity_logs from authenticated;
revoke update, delete on public.candidate_stage_history from authenticated;

create function public.move_candidate(p_candidate_id uuid, p_target_stage_id uuid) returns void language plpgsql security definer set search_path = '' as $$
declare c public.candidates; current_order integer; target_order integer; actor uuid;
begin
  if not public.is_hr() then raise exception 'Access denied'; end if; actor := public.current_profile_id();
  select * into c from public.candidates where id=p_candidate_id for update; if c.id is null then raise exception 'Candidate not found'; end if;
  if c.status <> 'ACTIVE' then raise exception 'Closed candidates cannot change stage'; end if;
  select stage_order into current_order from public.vacancy_stages where id=c.current_stage_id and vacancy_id=c.vacancy_id;
  select stage_order into target_order from public.vacancy_stages where id=p_target_stage_id and vacancy_id=c.vacancy_id;
  if target_order is null or target_order <> current_order + 1 then raise exception 'Only the next configured stage is permitted'; end if;
  update public.candidates set current_stage_id=p_target_stage_id where id=p_candidate_id;
  insert into public.candidate_stage_history(candidate_id,previous_stage_id,new_stage_id,changed_by) values(c.id,c.current_stage_id,p_target_stage_id,actor);
  insert into public.activity_logs(candidate_id,actor_id,action,description,metadata) values(c.id,actor,'STAGE_CHANGED','Candidate moved to the next recruitment stage',jsonb_build_object('previous_stage_id',c.current_stage_id,'new_stage_id',p_target_stage_id));
end $$;
grant execute on function public.move_candidate(uuid,uuid) to authenticated;

create function public.record_candidate_outcome(p_candidate_id uuid, p_outcome public.candidate_outcome) returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid;
begin
  if not public.is_hr() then raise exception 'Access denied'; end if; actor := public.current_profile_id();
  update public.candidates set outcome=p_outcome,status=case when p_outcome in ('HIRED','REJECTED') then 'CLOSED'::public.candidate_status else 'ACTIVE'::public.candidate_status end where id=p_candidate_id;
  if not found then raise exception 'Candidate not found'; end if;
  insert into public.activity_logs(candidate_id,actor_id,action,description,metadata) values(p_candidate_id,actor,'OUTCOME_RECORDED','Candidate outcome recorded as '||replace(p_outcome::text,'_',' '),jsonb_build_object('outcome',p_outcome));
end $$;
grant execute on function public.record_candidate_outcome(uuid,public.candidate_outcome) to authenticated;
