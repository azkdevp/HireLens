-- HireLens Sprint 2 Phase F: narrow audit presentation and report-export evidence.

create function public.recruitment_audit_feed(
  p_actor_profile_id uuid default null,
  p_action text default null,
  p_candidate_id uuid default null,
  p_vacancy_id uuid default null,
  p_oldest_first boolean default false
)
returns table (
  id uuid,
  created_at timestamptz,
  actor_profile_id uuid,
  actor_name text,
  action text,
  target_type text,
  target_id uuid,
  candidate_id uuid,
  candidate_name text,
  vacancy_id uuid,
  vacancy_title text,
  interview_id uuid,
  metadata jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(public.current_role()::text, '') not in ('HR_RECRUITER', 'MANAGEMENT') then
    raise exception 'Audit access is restricted';
  end if;

  return query
  select e.id, e.created_at, e.actor_profile_id,
    coalesce(p.full_name, 'System'), e.action, e.target_type, e.target_id,
    e.candidate_id, c.full_name, e.vacancy_id, v.title, e.interview_id, e.metadata
  from public.audit_events e
  left join public.user_profiles p on p.id = e.actor_profile_id
  left join public.candidates c on c.id = e.candidate_id
  left join public.vacancies v on v.id = e.vacancy_id
  where (p_actor_profile_id is null or e.actor_profile_id = p_actor_profile_id)
    and (p_action is null or e.action = p_action)
    and (p_candidate_id is null or e.candidate_id = p_candidate_id)
    and (p_vacancy_id is null or e.vacancy_id = p_vacancy_id)
  order by
    case when p_oldest_first then e.created_at end asc,
    case when not p_oldest_first then e.created_at end desc
  limit 500;
end
$$;

create function public.record_recruitment_report_export()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := public.current_profile_id();
  event_id uuid;
begin
  if coalesce(public.current_role()::text, '') not in ('HR_RECRUITER', 'MANAGEMENT') then
    raise exception 'Report export is restricted';
  end if;

  insert into public.audit_events(actor_profile_id, action, target_type, metadata)
  values(actor, 'RECRUITMENT_REPORT_EXPORTED', 'REPORT', jsonb_build_object('format', 'CSV'))
  returning id into event_id;

  return event_id;
end
$$;

revoke all on function public.recruitment_audit_feed(uuid,text,uuid,uuid,boolean) from public, anon;
revoke all on function public.record_recruitment_report_export() from public, anon;
grant execute on function public.recruitment_audit_feed(uuid,text,uuid,uuid,boolean) to authenticated;
grant execute on function public.record_recruitment_report_export() to authenticated;

comment on function public.recruitment_audit_feed(uuid,text,uuid,uuid,boolean) is
  'HL-47 role-checked audit presentation with safe actor and recruitment target labels.';
comment on function public.record_recruitment_report_export() is
  'HL-46 records an authorized CSV recruitment report export without granting audit insert access.';
