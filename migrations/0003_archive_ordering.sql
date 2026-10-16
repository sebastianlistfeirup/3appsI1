begin;
-- Recheck project archival only after the shared budget lock; avoids queueing behind an archive transaction.
create or replace function app.request_job(p_workspace uuid,p_project uuid,p_app text,p_kind text,p_key text,p_input jsonb,p_hash text,p_maximum bigint)
returns app.jobs language plpgsql security definer set search_path=pg_catalog,app as $$
declare result app.jobs; budget app.workspace_budgets;today date=(now() at time zone 'UTC')::date;held_total bigint;spent_total bigint;held_day bigint;spent_day bigint;begin
 if not app.has_role(p_workspace,array['owner','editor']) then raise exception 'FORBIDDEN';end if;
 if p_maximum<0 then raise exception 'INVALID_BUDGET';end if;
 select * into budget from app.workspace_budgets where workspace_id=p_workspace for update;
 if not found then raise exception 'BUDGET_NOT_CONFIGURED';end if;
 if not exists(select 1 from app.projects where id=p_project and workspace_id=p_workspace and app_key=p_app and archived_at is null) then raise exception 'PROJECT_NOT_FOUND';end if;
 select * into result from app.jobs where workspace_id=p_workspace and idempotency_key=p_key;
 if found then
  if result.input_hash<>p_hash or result.input<>p_input or result.project_id<>p_project or result.kind<>p_kind or result.app_key<>p_app or p_maximum<>(select reserved_minor from app.budget_reservations where job_id=result.id) then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return result;
 end if;
 select coalesce(sum(reserved_minor),0),coalesce(sum(reserved_minor) filter(where day=today),0) into held_total,held_day from app.budget_reservations where workspace_id=p_workspace and state='held';
 select coalesce(sum(amount_minor),0),coalesce(sum(amount_minor) filter(where day=today),0) into spent_total,spent_day from app.usage_events where workspace_id=p_workspace;
 if held_total+spent_total+p_maximum>budget.total_limit_minor or held_day+spent_day+p_maximum>budget.daily_limit_minor then raise exception 'BUDGET_EXCEEDED';end if;
 insert into app.jobs(workspace_id,project_id,app_key,kind,idempotency_key,input,input_hash) values(p_workspace,p_project,p_app,p_kind,p_key,p_input,p_hash) returning * into result;
 insert into app.budget_reservations(workspace_id,job_id,reserved_minor) values(p_workspace,result.id,p_maximum);
 insert into app.job_outbox(workspace_id,job_id) values(p_workspace,result.id);
 insert into app.job_events(workspace_id,job_id,job_revision,type) values(p_workspace,result.id,1,'job.queued');
 return result;
end $$;
create function app.archive_project(p_project uuid,p_app text,p_expected bigint,p_archived boolean)
returns app.projects language plpgsql security definer set search_path=pg_catalog,app as $$
declare result app.projects;target_workspace uuid;pending app.jobs;begin
 select workspace_id into target_workspace from app.projects where id=p_project and app_key=p_app;
 if target_workspace is null or not app.has_role(target_workspace,array['owner','editor']) then raise exception 'PROJECT_NOT_FOUND';end if;
 perform 1 from app.workspace_budgets where workspace_id=target_workspace for update;
 update app.projects set archived_at=case when p_archived then now() else null end,revision=revision+1
 where id=p_project and app_key=p_app and revision=p_expected returning * into result;
 if not found then raise exception 'REVISION_CONFLICT';end if;
 if p_archived then
  for pending in select * from app.jobs where project_id=p_project and state not in ('succeeded','failed','cancelled') order by created_at for update loop
   perform app.cancel_job(pending.id,pending.revision);
  end loop;
 end if;
 return result;
end $$;
revoke all on function app.archive_project(uuid,text,bigint,boolean) from public;
grant execute on function app.archive_project(uuid,text,bigint,boolean) to authenticated;
-- Archival must go through the narrow function so cancellation and reservation rules remain atomic.
revoke update(archived_at) on app.projects from authenticated;
create function app.guard_archived_project() returns trigger language plpgsql set search_path=pg_catalog,app as $$
begin
 if old.archived_at is not null and (new.document is distinct from old.document or new.name is distinct from old.name) then raise exception 'PROJECT_ARCHIVED';end if;
 return new;
end $$;
create trigger archived_project before update on app.projects for each row execute function app.guard_archived_project();
commit;
