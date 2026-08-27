-- Sprint 1 security correction for projects that already applied the initial migration.
-- Candidate profile fields remain editable by HR; workflow-owned fields may only
-- be changed by the audited security-definer functions.
revoke update on public.candidates from authenticated;
grant update (full_name, email, phone, source, notes) on public.candidates to authenticated;

create or replace function public.move_candidate(p_candidate_id uuid, p_target_stage_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.candidates;
  current_order integer;
  target_order integer;
  actor uuid;
begin
  if not public.is_hr() then raise exception 'Access denied'; end if;
  actor := public.current_profile_id();

  select * into c from public.candidates where id = p_candidate_id for update;
  if c.id is null then raise exception 'Candidate not found'; end if;
  if c.status <> 'ACTIVE' then raise exception 'Closed candidates cannot change stage'; end if;

  select stage_order into current_order
  from public.vacancy_stages
  where id = c.current_stage_id and vacancy_id = c.vacancy_id;

  select stage_order into target_order
  from public.vacancy_stages
  where id = p_target_stage_id and vacancy_id = c.vacancy_id;

  if target_order is null or target_order <> current_order + 1 then
    raise exception 'Only the next configured stage is permitted';
  end if;

  update public.candidates set current_stage_id = p_target_stage_id where id = p_candidate_id;
  insert into public.candidate_stage_history(candidate_id, previous_stage_id, new_stage_id, changed_by)
  values(c.id, c.current_stage_id, p_target_stage_id, actor);
  insert into public.activity_logs(candidate_id, actor_id, action, description, metadata)
  values(c.id, actor, 'STAGE_CHANGED', 'Candidate moved to the next recruitment stage', jsonb_build_object('previous_stage_id', c.current_stage_id, 'new_stage_id', p_target_stage_id));
end
$$;

grant execute on function public.move_candidate(uuid, uuid) to authenticated;
