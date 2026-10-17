-- Replay after interrupted validation is narrowly limited to the bundled, free FlowLab engine.
-- Unknown external operations retain their reconciliation gate and held reservation.
create or replace function app.job_guard() returns trigger language plpgsql set search_path=pg_catalog as $$
declare allowed text[];begin
 if row(new.id,new.workspace_id,new.project_id,new.app_key,new.kind,new.idempotency_key,new.input,new.input_hash,new.created_at) is distinct from row(old.id,old.workspace_id,old.project_id,old.app_key,old.kind,old.idempotency_key,old.input,old.input_hash,old.created_at) then raise exception 'IMMUTABLE_JOB_INPUT';end if;
 if old.state in ('succeeded','failed','cancelled') then raise exception 'TERMINAL_JOB';end if;
 if new.cancel_requested=false and old.cancel_requested=true then raise exception 'CANCEL_IS_FINAL';end if;
 if old.state='validating' and new.state='retry_wait' and not(
  old.app_key='flowlab' and old.kind='flow.compare' and old.provider_ref is null
  and old.lease_until is not null and old.lease_until<=now()
  and exists(select 1 from app.budget_reservations r where r.job_id=old.id and r.reserved_minor=0 and r.state='held')
 ) then raise exception 'UNSAFE_JOB_REPLAY';end if;
 if new.state<>old.state then
  allowed=case old.state
   when 'queued' then array['running','cancelled','blocked_credentials','blocked_budget','failed']
   when 'running' then array['validating','retry_wait','blocked_credentials','failed','cancelled','reconcile_required']
   when 'validating' then array['succeeded','failed','cancelled','reconcile_required','retry_wait']
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
