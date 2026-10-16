-- Three independent products, one tenant boundary. PostgreSQL 17 / Supabase-compatible.
-- Run with a migration administrator. Runtime roles never own tables or bypass RLS.
begin;
create schema if not exists app;
revoke all on schema app from public;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit nosuperuser nobypassrls; end if;
  if not exists(select 1 from pg_roles where rolname='tre_worker') then create role tre_worker nologin noinherit nosuperuser nobypassrls; end if;
end $$;
grant usage on schema app to authenticated, tre_worker;

create function app.request_user_id() returns uuid language sql stable
set search_path = pg_catalog as $$
 select coalesce(nullif(current_setting('request.jwt.claim.sub',true),''), nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
create function app.worker_workspace_id() returns uuid language sql stable
set search_path = pg_catalog as $$ select nullif(current_setting('app.worker_workspace_id',true),'')::uuid $$;

create table app.workspaces (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100),
 plan_key text not null default 'demo', retention_days integer not null default 30 check(retention_days between 1 and 3650),
 created_at timestamptz not null default now()
);
create table app.memberships (
 workspace_id uuid not null references app.workspaces(id), user_id uuid not null,
 role text not null check(role in ('owner','editor','viewer')), revoked_at timestamptz,
 created_at timestamptz not null default now(), primary key(workspace_id,user_id)
);
create function app.has_role(p_workspace uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = pg_catalog, app as $$
 select exists(select 1 from app.memberships m where m.workspace_id=p_workspace
 and m.user_id=app.request_user_id() and m.revoked_at is null and m.role=any(p_roles))
$$;
revoke all on function app.has_role(uuid,text[]) from public;
grant execute on function app.has_role(uuid,text[]) to authenticated,tre_worker;

create table app.projects (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references app.workspaces(id),
 app_key text not null check(app_key in ('studio','flowlab','director')), name text not null check(length(name) between 1 and 100),
 document jsonb not null default '{}'::jsonb check(octet_length(document::text)<=5000000),
 revision bigint not null default 1 check(revision>0), archived_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,workspace_id), unique(id,workspace_id,app_key)
);
create table app.artifact_versions (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, project_id uuid not null,
 artifact_id uuid not null, version integer not null check(version>0),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), mime text not null check(length(mime)<100),
 bytes bigint not null check(bytes between 0 and 50000000),
 storage_key text not null check(storage_key !~ '(^|/)\.\.(/|$)' and position(chr(92) in storage_key)=0),
 provenance jsonb not null, rights_status text not null check(rights_status in ('owned','licensed','unknown')),
 created_at timestamptz not null default now(),
 foreign key(project_id,workspace_id) references app.projects(id,workspace_id),
 unique(workspace_id,artifact_id,version),unique(id,workspace_id),
 check(storage_key like workspace_id::text||'/'||project_id::text||'/%')
);
create table app.workspace_budgets (
 workspace_id uuid primary key references app.workspaces(id), currency text not null default 'DKK' check(currency='DKK'),
 daily_limit_minor bigint not null default 0 check(daily_limit_minor>=0),
 total_limit_minor bigint not null default 0 check(total_limit_minor>=0), updated_at timestamptz not null default now()
);
create table app.jobs (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, project_id uuid not null,
 app_key text not null, kind text not null check(length(kind) between 1 and 100),
 state text not null default 'queued' check(state in ('queued','running','validating','succeeded','retry_wait','blocked_credentials','blocked_budget','failed','cancelled','reconcile_required')),
 revision bigint not null default 1 check(revision>0), idempotency_key text not null check(length(idempotency_key) between 1 and 200),
 input jsonb not null check(octet_length(input::text)<=1000000), input_hash text not null check(input_hash~'^[a-f0-9]{64}$'),
 attempt integer not null default 0 check(attempt between 0 and 3), lease_token uuid,lease_until timestamptz,
 provider_ref text, result_version uuid, cancel_requested boolean not null default false,
 actionable_error text, created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(project_id,workspace_id,app_key) references app.projects(id,workspace_id,app_key),
 unique(workspace_id,idempotency_key),unique(id,workspace_id),check(state<>'succeeded' or result_version is not null)
);
create table app.job_results (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,project_id uuid not null,job_id uuid not null,
 manifest jsonb not null check(octet_length(manifest::text)<=1000000),sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
 created_at timestamptz not null default now(),foreign key(job_id,workspace_id) references app.jobs(id,workspace_id),
 foreign key(project_id,workspace_id) references app.projects(id,workspace_id),unique(job_id),unique(id,job_id,workspace_id)
);
alter table app.jobs add constraint result_belongs_to_job foreign key(result_version,id,workspace_id) references app.job_results(id,job_id,workspace_id) deferrable initially deferred;
create table app.budget_reservations (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,job_id uuid not null,
 reserved_minor bigint not null check(reserved_minor>=0),actual_minor bigint check(actual_minor>=0 and actual_minor<=reserved_minor),
 state text not null default 'held' check(state in ('held','settled','released')),day date not null default (now() at time zone 'UTC')::date,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(job_id,workspace_id) references app.jobs(id,workspace_id), unique(job_id),check(state<>'settled' or actual_minor is not null)
);
create table app.usage_events (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,job_id uuid not null,source_event_id text not null,
 amount_minor bigint not null check(amount_minor>=0),currency text not null default 'DKK' check(currency='DKK'),
 day date not null,created_at timestamptz not null default now(),
 foreign key(job_id,workspace_id) references app.jobs(id,workspace_id),unique(workspace_id,source_event_id)
);
create table app.job_events (
 id bigint generated always as identity primary key,workspace_id uuid not null,job_id uuid not null,
 job_revision bigint not null,type text not null,payload jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),
 foreign key(job_id,workspace_id) references app.jobs(id,workspace_id),unique(job_id,job_revision)
);
create table app.job_outbox (
 job_id uuid primary key,workspace_id uuid not null,dispatched_at timestamptz,
 created_at timestamptz not null default now(),foreign key(job_id,workspace_id) references app.jobs(id,workspace_id)
);
create table app.audit_log (
 id bigint generated always as identity primary key,workspace_id uuid not null references app.workspaces(id),actor uuid,
 action text not null,object_id uuid not null,before_revision bigint,after_revision bigint,created_at timestamptz not null default now()
);
create table app.entitlements (
 workspace_id uuid not null references app.workspaces(id),app_key text not null check(app_key in ('studio','flowlab','director')),
 plan_key text not null,state text not null check(state in ('trial','active','past_due','cancelled')),
 provider_subscription_id text,provider_event_created bigint not null default 0,updated_at timestamptz not null default now(),primary key(workspace_id,app_key)
);
create index projects_workspace_app on app.projects(workspace_id,app_key) where archived_at is null;
create index jobs_pending on app.jobs(workspace_id,state,created_at);
create index budgets_held on app.budget_reservations(workspace_id,day) where state='held';
create index usage_workspace_day on app.usage_events(workspace_id,day);
create index artifact_project on app.artifact_versions(workspace_id,project_id);

create function app.immutable_row() returns trigger language plpgsql set search_path=pg_catalog as $$
begin raise exception 'IMMUTABLE_VERSION' using errcode='P0001';end $$;
create trigger immutable_artifact before update or delete on app.artifact_versions for each row execute function app.immutable_row();
create trigger immutable_result before update or delete on app.job_results for each row execute function app.immutable_row();
create trigger immutable_usage before update or delete on app.usage_events for each row execute function app.immutable_row();
create trigger immutable_event before update or delete on app.job_events for each row execute function app.immutable_row();
create trigger immutable_audit before update or delete on app.audit_log for each row execute function app.immutable_row();
create function app.project_revision_guard() returns trigger language plpgsql security definer set search_path=pg_catalog,app as $$
begin
 if new.workspace_id<>old.workspace_id or new.app_key<>old.app_key or new.id<>old.id then raise exception 'IMMUTABLE_IDENTITY';end if;
 if new.revision<>old.revision+1 then raise exception 'REVISION_CONFLICT';end if;
 new.updated_at=now();
 insert into app.audit_log(workspace_id,actor,action,object_id,before_revision,after_revision)
 values(new.workspace_id,app.request_user_id(),'project.updated',new.id,old.revision,new.revision);
 return new;
end $$;
create trigger project_revision before update on app.projects for each row execute function app.project_revision_guard();

-- Serialize ownership changes so concurrent demotions cannot remove every owner.
create function app.membership_owner_guard() returns trigger language plpgsql security definer set search_path=pg_catalog,app as $$
begin
 if new.workspace_id<>old.workspace_id or new.user_id<>old.user_id then raise exception 'IMMUTABLE_IDENTITY';end if;
 if old.role='owner' and old.revoked_at is null and (new.role<>'owner' or new.revoked_at is not null) then
  perform 1 from app.workspaces where id=old.workspace_id for update;
  if not exists(select 1 from app.memberships where workspace_id=old.workspace_id and user_id<>old.user_id and role='owner' and revoked_at is null) then raise exception 'LAST_OWNER';end if;
 end if;
 return new;
end $$;
create trigger membership_owner before update on app.memberships for each row execute function app.membership_owner_guard();
create function app.job_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
declare allowed text[];begin
 if row(new.id,new.workspace_id,new.project_id,new.app_key,new.kind,new.idempotency_key,new.input,new.input_hash,new.created_at) is distinct from row(old.id,old.workspace_id,old.project_id,old.app_key,old.kind,old.idempotency_key,old.input,old.input_hash,old.created_at) then raise exception 'IMMUTABLE_JOB_INPUT';end if;
 if old.state in ('succeeded','failed','cancelled') then raise exception 'TERMINAL_JOB';end if;
 if new.cancel_requested=false and old.cancel_requested=true then raise exception 'CANCEL_IS_FINAL';end if;
 if new.state<>old.state then
  allowed=case old.state
   when 'queued' then array['running','cancelled','blocked_credentials','blocked_budget','failed']
   when 'running' then array['validating','retry_wait','blocked_credentials','failed','cancelled','reconcile_required']
   when 'validating' then array['succeeded','failed','cancelled','reconcile_required']
   when 'retry_wait' then array['queued','running','failed','cancelled']
   when 'blocked_credentials' then array['queued','cancelled']
   when 'blocked_budget' then array['queued','cancelled']
   when 'reconcile_required' then array['validating','failed','cancelled']
   else array[]::text[] end;
  if not new.state=any(allowed) then raise exception 'ILLEGAL_JOB_TRANSITION';end if;
  if new.revision<>old.revision+1 then raise exception 'REVISION_CONFLICT';end if;
 elsif new.revision<>old.revision and new.revision<>old.revision+1 then raise exception 'REVISION_CONFLICT';
 end if;
 if new.attempt<>old.attempt and not(new.attempt=old.attempt+1 and new.state='running' and old.state in ('queued','retry_wait')) then raise exception 'INVALID_ATTEMPT';end if;
 return new;
end $$;
create trigger job_guard before update on app.jobs for each row execute function app.job_guard();

-- FORCE RLS makes accidental table-owner runtime connections fail closed too.
do $$ declare table_name text; begin
 foreach table_name in array array['workspaces','memberships','projects','artifact_versions','workspace_budgets','jobs','job_results','budget_reservations','usage_events','job_events','job_outbox','audit_log','entitlements'] loop
 execute format('alter table app.%I enable row level security',table_name);
 execute format('alter table app.%I force row level security',table_name);
 end loop;
end $$;
create policy workspace_read on app.workspaces for select to authenticated using(app.has_role(id,array['owner','editor','viewer']));
create policy membership_read on app.memberships for select to authenticated using(app.has_role(workspace_id,array['owner','editor','viewer']));
create policy membership_insert on app.memberships for insert to authenticated with check(app.has_role(workspace_id,array['owner']));
create policy membership_update on app.memberships for update to authenticated using(app.has_role(workspace_id,array['owner'])) with check(app.has_role(workspace_id,array['owner']));
create policy projects_read on app.projects for select to authenticated using(app.has_role(workspace_id,array['owner','editor','viewer']));
create policy projects_insert on app.projects for insert to authenticated with check(app.has_role(workspace_id,array['owner','editor']));
create policy projects_update on app.projects for update to authenticated using(app.has_role(workspace_id,array['owner','editor'])) with check(app.has_role(workspace_id,array['owner','editor']));
create policy artifacts_read on app.artifact_versions for select to authenticated using(app.has_role(workspace_id,array['owner','editor','viewer']));
create policy artifacts_insert on app.artifact_versions for insert to authenticated with check(app.has_role(workspace_id,array['owner','editor']) and exists(select 1 from app.projects p where p.id=project_id and p.archived_at is null));
do $$ declare table_name text;begin
 foreach table_name in array array['workspace_budgets','jobs','job_results','budget_reservations','usage_events','job_events','audit_log','entitlements'] loop
 execute format('create policy tenant_read on app.%I for select to authenticated using(app.has_role(workspace_id,array[''owner'',''editor'',''viewer'']))',table_name);
 end loop;
 foreach table_name in array array['projects','artifact_versions','jobs','job_results','budget_reservations','usage_events','job_events','job_outbox','workspace_budgets'] loop
 execute format('create policy worker_tenant on app.%I to tre_worker using(workspace_id=app.worker_workspace_id()) with check(workspace_id=app.worker_workspace_id())',table_name);
 end loop;
end $$;
grant select on app.workspaces,app.memberships,app.projects,app.artifact_versions,app.workspace_budgets,app.jobs,app.job_results,app.budget_reservations,app.usage_events,app.job_events,app.audit_log,app.entitlements to authenticated;
grant insert on app.projects,app.artifact_versions,app.memberships to authenticated;
grant update(name,document,revision,archived_at) on app.projects to authenticated;
grant update(role,revoked_at) on app.memberships to authenticated;
grant select on app.projects,app.artifact_versions,app.workspace_budgets to tre_worker;
grant update(updated_at) on app.workspace_budgets to tre_worker;
grant select,update on app.jobs,app.budget_reservations,app.job_outbox to tre_worker;
grant select,insert on app.job_results,app.usage_events,app.job_events,app.artifact_versions to tre_worker;
grant usage,select on all sequences in schema app to tre_worker;

create function app.create_workspace(p_name text) returns app.workspaces language plpgsql security definer set search_path=pg_catalog,app as $$
declare result app.workspaces; actor uuid=app.request_user_id();begin
 if actor is null then raise exception 'AUTH_REQUIRED';end if;
 insert into app.workspaces(name) values(p_name) returning * into result;
 insert into app.memberships(workspace_id,user_id,role) values(result.id,actor,'owner');
 insert into app.workspace_budgets(workspace_id) values(result.id);
 return result;
end $$;
create function app.set_budget(p_workspace uuid,p_daily bigint,p_total bigint) returns void language plpgsql security definer set search_path=pg_catalog,app as $$
begin
 if not app.has_role(p_workspace,array['owner']) then raise exception 'FORBIDDEN';end if;
 if p_daily<0 or p_total<0 then raise exception 'INVALID_BUDGET';end if;
 update app.workspace_budgets set daily_limit_minor=p_daily,total_limit_minor=p_total,updated_at=now() where workspace_id=p_workspace;
end $$;
create function app.request_job(p_workspace uuid,p_project uuid,p_app text,p_kind text,p_key text,p_input jsonb,p_hash text,p_maximum bigint)
returns app.jobs language plpgsql security definer set search_path=pg_catalog,app as $$
declare result app.jobs; budget app.workspace_budgets;today date=(now() at time zone 'UTC')::date;held_total bigint;spent_total bigint;held_day bigint;spent_day bigint;begin
 if not app.has_role(p_workspace,array['owner','editor']) then raise exception 'FORBIDDEN';end if;
 if p_maximum<0 then raise exception 'INVALID_BUDGET';end if;
 if not exists(select 1 from app.projects where id=p_project and workspace_id=p_workspace and app_key=p_app and archived_at is null) then raise exception 'PROJECT_NOT_FOUND';end if;
 select * into budget from app.workspace_budgets where workspace_id=p_workspace for update;
 if not found then raise exception 'BUDGET_NOT_CONFIGURED';end if;
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
revoke all on function app.create_workspace(text),app.set_budget(uuid,bigint,bigint),app.request_job(uuid,uuid,text,text,text,jsonb,text,bigint) from public;
grant execute on function app.create_workspace(text),app.set_budget(uuid,bigint,bigint),app.request_job(uuid,uuid,text,text,text,jsonb,text,bigint) to authenticated;
commit;
