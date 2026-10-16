begin;
-- Upload reservations are durable. Pending bytes stay reserved until finalized;
-- there is deliberately no expiry that could release quota while orphan bytes remain.
alter table app.workspace_budgets add column object_limit_bytes bigint not null
 default 100000000 check(object_limit_bytes between 0 and 10000000000000);

create table app.artifact_uploads (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null,
 project_id uuid not null, app_key text not null,
 idempotency_key text not null check(length(idempotency_key) between 1 and 200),
 artifact_id uuid not null, version integer not null check(version>0),
 requested_artifact_id uuid,
 name text not null check(length(name) between 1 and 200),
 mime text not null check(length(mime) between 1 and 99),
 bytes bigint not null check(bytes between 0 and 10000000),
 sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 source text not null check(length(source) between 1 and 2000),
 rights_status text not null check(rights_status in ('owned','licensed','unknown')),
 state text not null default 'pending' check(state in ('pending','finalized')),
 created_by uuid not null, created_at timestamptz not null default now(), finalized_at timestamptz,
 foreign key(project_id,workspace_id,app_key) references app.projects(id,workspace_id,app_key),
 unique(workspace_id,idempotency_key), unique(workspace_id,artifact_id,version),
 check((state='finalized')=(finalized_at is not null))
);
create index uploads_project on app.artifact_uploads(workspace_id,project_id,created_at);
create index uploads_pending on app.artifact_uploads(workspace_id) where state='pending';
alter table app.artifact_uploads enable row level security;
alter table app.artifact_uploads force row level security;
create policy upload_read on app.artifact_uploads for select to authenticated
 using(app.has_role(workspace_id,array['owner','editor','viewer']));
grant select on app.artifact_uploads to authenticated;

-- Apply the same quota to all artifact insertions, including existing worker paths.
-- All upload/insert/archive operations acquire budget before project/row locks.
create function app.enforce_object_budget() returns trigger
 language plpgsql security definer set search_path=pg_catalog,app as $$
declare maximum bigint; committed numeric; pending numeric;
begin
 select object_limit_bytes into maximum from app.workspace_budgets where workspace_id=new.workspace_id for update;
 if not found then raise exception 'BUDGET_NOT_CONFIGURED';end if;
 select coalesce(sum(bytes),0) into committed from app.artifact_versions where workspace_id=new.workspace_id;
 select coalesce(sum(bytes),0) into pending from app.artifact_uploads where workspace_id=new.workspace_id and state='pending' and id<>new.id;
 if committed+pending+new.bytes>maximum then raise exception 'STORAGE_QUOTA_EXCEEDED';end if;
 return new;
end $$;
revoke all on function app.enforce_object_budget() from public;
create trigger artifact_storage_quota before insert on app.artifact_versions for each row execute function app.enforce_object_budget();

create function app.begin_upload(p_project uuid,p_app text,p_key text,p_name text,p_mime text,p_bytes bigint,p_sha text,p_source text,p_rights text,p_family uuid)
returns app.artifact_uploads language plpgsql security definer set search_path=pg_catalog,app as $$
declare project app.projects; result app.artifact_uploads; maximum bigint; committed numeric; pending numeric; active integer; next_version integer; family uuid;
begin
 select * into project from app.projects where id=p_project and app_key=p_app;
 if not found or not app.has_role(project.workspace_id,array['owner','editor','viewer']) then raise exception 'PROJECT_NOT_FOUND';end if;
 if not app.has_role(project.workspace_id,array['owner','editor']) then raise exception 'FORBIDDEN';end if;
 select object_limit_bytes into maximum from app.workspace_budgets where workspace_id=project.workspace_id for update;
 if not found then raise exception 'BUDGET_NOT_CONFIGURED';end if;
 select * into project from app.projects where id=p_project and app_key=p_app for update;
 if not app.has_role(project.workspace_id,array['owner','editor']) then raise exception 'FORBIDDEN';end if;
 if project.archived_at is not null then raise exception 'PROJECT_ARCHIVED';end if;
 select * into result from app.artifact_uploads where workspace_id=project.workspace_id and idempotency_key=p_key;
 if found then
  if result.project_id<>p_project or result.app_key<>p_app or result.name is distinct from p_name or result.mime is distinct from p_mime or result.bytes is distinct from p_bytes or result.sha256 is distinct from p_sha or result.source is distinct from p_source or result.rights_status is distinct from p_rights or result.requested_artifact_id is distinct from p_family then raise exception 'IDEMPOTENCY_CONFLICT';end if;
  return result;
 end if;
 select count(*),coalesce(sum(bytes),0) into active,pending from app.artifact_uploads where workspace_id=project.workspace_id and state='pending';
 if active>=20 then raise exception 'UPLOAD_LIMIT';end if;
 select coalesce(sum(bytes),0) into committed from app.artifact_versions where workspace_id=project.workspace_id;
 if committed+pending+p_bytes>maximum then raise exception 'STORAGE_QUOTA_EXCEEDED';end if;
 family=coalesce(p_family,gen_random_uuid());
 if p_family is not null and not exists(select 1 from app.artifact_versions where artifact_id=p_family and project_id=p_project and workspace_id=project.workspace_id) then raise exception 'ARTIFACT_NOT_FOUND';end if;
 select coalesce(max(version),0)+1 into next_version from (
  select version from app.artifact_versions where workspace_id=project.workspace_id and artifact_id=family
  union all select version from app.artifact_uploads where workspace_id=project.workspace_id and artifact_id=family
 ) versions;
 insert into app.artifact_uploads(workspace_id,project_id,app_key,idempotency_key,artifact_id,version,requested_artifact_id,name,mime,bytes,sha256,source,rights_status,created_by)
 values(project.workspace_id,p_project,p_app,p_key,family,next_version,p_family,p_name,p_mime,p_bytes,p_sha,p_source,p_rights,app.request_user_id()) returning * into result;
 insert into app.audit_log(workspace_id,actor,action,object_id) values(result.workspace_id,app.request_user_id(),'artifact.upload_reserved',result.id);
 return result;
end $$;

-- API calls this only after readVerified has checked the canonical private file.
-- A failed/lost acknowledgement never deletes bytes; the same upload ID retries safely.
create function app.finalize_upload(p_upload uuid,p_app text)
returns app.artifact_uploads language plpgsql security definer set search_path=pg_catalog,app as $$
declare result app.artifact_uploads; project app.projects;
begin
 select * into result from app.artifact_uploads where id=p_upload and app_key=p_app;
 if not found or not app.has_role(result.workspace_id,array['owner','editor','viewer']) then raise exception 'UPLOAD_NOT_FOUND';end if;
 if not app.has_role(result.workspace_id,array['owner','editor']) then raise exception 'FORBIDDEN';end if;
 perform 1 from app.workspace_budgets where workspace_id=result.workspace_id for update;
 select * into project from app.projects where id=result.project_id for update;
 select * into result from app.artifact_uploads where id=p_upload for update;
 if not app.has_role(result.workspace_id,array['owner','editor']) then raise exception 'FORBIDDEN';end if;
 -- Read-only retry may acknowledge an already completed version after archival.
 if result.state='finalized' then return result;end if;
 if project.archived_at is not null then raise exception 'PROJECT_ARCHIVED';end if;
 insert into app.artifact_versions(id,workspace_id,project_id,artifact_id,version,sha256,mime,bytes,storage_key,provenance,rights_status)
 values(result.id,result.workspace_id,result.project_id,result.artifact_id,result.version,result.sha256,result.mime,result.bytes,
 result.workspace_id::text||'/'||result.project_id::text||'/'||result.id::text||'/'||result.sha256,
 jsonb_build_object('name',result.name,'source',result.source,'uploadId',result.id,'uploadedBy',result.created_by),result.rights_status);
 update app.artifact_uploads set state='finalized',finalized_at=clock_timestamp() where id=p_upload returning * into result;
 insert into app.audit_log(workspace_id,actor,action,object_id,after_revision) values(result.workspace_id,app.request_user_id(),'artifact.upload_finalized',result.id,result.version);
 return result;
end $$;
revoke all on function app.begin_upload(uuid,text,text,text,text,bigint,text,text,text,uuid),app.finalize_upload(uuid,text) from public;
grant execute on function app.begin_upload(uuid,text,text,text,text,bigint,text,text,text,uuid),app.finalize_upload(uuid,text) to authenticated;
commit;
