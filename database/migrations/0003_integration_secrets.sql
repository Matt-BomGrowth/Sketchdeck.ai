-- Provider OAuth material (e.g. NotFair tokens) for organizations that prefer
-- database storage over environment variables. Service-role only: RLS is
-- enabled with NO policies, so user sessions can never read or write secrets.
create table integration_secrets (
  organization_id uuid not null references organizations (id) on delete cascade,
  key text not null,
  secret jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, key)
);
alter table integration_secrets enable row level security;
