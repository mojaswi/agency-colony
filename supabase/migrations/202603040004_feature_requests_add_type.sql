-- Add type column to feature_requests: 'feature' (default) or 'bug'.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'feature_request_type' and typnamespace = 'app'::regnamespace) then
    create type app.feature_request_type as enum ('feature', 'bug');
  end if;
end;
$$;

alter table app.feature_requests
  add column if not exists request_type app.feature_request_type not null default 'feature';
