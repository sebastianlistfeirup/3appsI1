begin;
do $$ begin
 if not exists(select 1 from pg_roles where rolname='tre_queue') then create role tre_queue nologin noinherit nosuperuser nobypassrls;end if;
 if not exists(select 1 from pg_roles where rolname='tre_dispatcher') then create role tre_dispatcher nologin noinherit nosuperuser nobypassrls;end if;
end $$;
create schema if not exists queue authorization tre_queue;
revoke all on schema queue from public;
grant usage on schema app to tre_dispatcher;
alter table app.jobs add column deadline_at timestamptz not null default now()+interval '20 minutes';
alter table app.jobs add column next_attempt_at timestamptz;
alter table app.job_outbox add column dispatch_token uuid;
alter table app.job_outbox add column dispatch_until timestamptz;
alter table app.job_outbox add column dispatch_attempt integer not null default 0;

-- The queue dispatcher sees only routing identifiers, never project input or documents.
create function app.claim_outbox(p_limit integer default 25)
returns table(job_id uuid,workspace_id uuid,dispatch_token uuid)
language plpgsql security definer set search_path=pg_catalog,app as $$
begin
 if p_limit<1 or p_limit>100 then raise exception 'INVALID_BATCH';end if;
 return query with candidates as (
  select o.job_id from app.job_outbox o where o.dispatched_at is null
  and (o.dispatch_until is null or o.dispatch_until<now())
  order by o.created_at limit p_limit for update skip locked
 ) update app.job_outbox o set dispatch_token=gen_random_uuid(),dispatch_until=now()+interval '30 seconds',dispatch_attempt=o.dispatch_attempt+1
 from candidates c where o.job_id=c.job_id returning o.job_id,o.workspace_id,o.dispatch_token;
end $$;
create function app.ack_outbox(p_job uuid,p_token uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog,app as $$
declare affected integer;begin
 update app.job_outbox set dispatched_at=now(),dispatch_until=null where job_id=p_job and dispatch_token=p_token and dispatched_at is null;
 get diagnostics affected=row_count;return affected=1;
end $$;
revoke all on function app.claim_outbox(integer),app.ack_outbox(uuid,uuid) from public;
grant execute on function app.claim_outbox(integer),app.ack_outbox(uuid,uuid) to tre_dispatcher;

create function app.cancel_job(p_job uuid,p_expected bigint) returns app.jobs
language plpgsql security definer set search_path=pg_catalog,app as $$
declare result app.jobs;target_workspace uuid;begin
 select workspace_id into target_workspace from app.jobs where id=p_job;
 if target_workspace is null or not app.has_role(target_workspace,array['owner','editor']) then raise exception 'FORBIDDEN';end if;
 perform 1 from app.workspace_budgets where workspace_id=target_workspace for update;
 select * into result from app.jobs where id=p_job for update;
 if result.revision<>p_expected then raise exception 'REVISION_CONFLICT';end if;
 if result.state in ('succeeded','failed','cancelled') or result.cancel_requested then return result;end if;
 if result.state in ('queued','retry_wait','blocked_budget','blocked_credentials') and result.provider_ref is null then
  update app.jobs set state='cancelled',cancel_requested=true,revision=revision+1,lease_until=null,updated_at=now() where id=p_job returning * into result;
  update app.budget_reservations set state='released',actual_minor=0,updated_at=now() where job_id=p_job and state='held';
 else
  -- An active/uncertain provider operation is not evidence of zero cost.
  update app.jobs set cancel_requested=true,revision=revision+1,updated_at=now() where id=p_job returning * into result;
 end if;
 insert into app.job_events(workspace_id,job_id,job_revision,type) values(result.workspace_id,result.id,result.revision,case when result.state='cancelled' then 'job.cancelled' else 'job.cancel_requested' end);
 return result;
end $$;
revoke all on function app.cancel_job(uuid,bigint) from public;
grant execute on function app.cancel_job(uuid,bigint) to authenticated;
commit;
