-- AdPilot AI — initial schema (PostgreSQL / Supabase)
-- Conventions: UUID primary keys, timestamptz, organization isolation via RLS.

create extension if not exists "pgcrypto";

-- ───────────────────────────── Enums ─────────────────────────────
create type platform as enum ('google', 'meta', 'linkedin');
create type campaign_status as enum ('active', 'paused', 'ended', 'draft');
create type integration_health as enum ('connected', 'connection_issue', 'not_configured', 'demo');
create type recommendation_status as enum ('pending', 'approved', 'modified', 'rejected', 'executed', 'measured');
create type action_status as enum ('pending_approval', 'approved', 'executing', 'executed', 'failed', 'rejected', 'measured');
create type scan_status as enum ('running', 'completed', 'failed', 'partial');
create type creative_asset_status as enum ('asset', 'preview', 'unavailable', 'demo');

-- ───────────────────────────── Core ─────────────────────────────
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  currency text not null default 'USD',
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Application users map Supabase auth users to an organization.
create table users (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  created_at timestamptz not null default now()
);
create index users_org_idx on users (organization_id);

create table org_settings (
  organization_id uuid primary key references organizations (id) on delete cascade,
  fatigue_thresholds jsonb not null default '{"criticalCtr":0.015,"warningCtrBand":0.004,"deteriorationPct":0.15,"lookbackDays":2,"baselineDays":14,"maxFrequency":4,"minRecentImpressions":400,"minRecentClicks":12}',
  automation_policy jsonb not null default '{"maxBudgetChangePct":0.1,"maxDailyExposure":2000,"approvalRequiredAbove":5000,"autoExecuteEnabled":false}',
  updated_at timestamptz not null default now()
);

create table integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  key text not null check (key in ('notfair', 'google_ads', 'meta', 'linkedin', 'hubspot', 'ga4', 'search_console')),
  name text not null,
  health integration_health not null default 'not_configured',
  detail text,
  -- Provider secrets are NEVER stored here; only non-secret config (account ids, property ids).
  config jsonb not null default '{}',
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

-- ───────────────────────────── Advertising ─────────────────────────────
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  platform platform not null,
  external_id text not null,
  name text not null,
  status campaign_status not null default 'active',
  objective text not null default 'lead_gen',
  daily_budget numeric(14, 2) not null default 0,
  currency text not null default 'USD',
  country text,
  industry text,
  icp_segment text,
  channel_type text,
  started_at date,
  source text not null default 'manual', -- e.g. 'notfair', 'google_ads', 'demo'
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, platform, external_id)
);
create index campaigns_org_platform_idx on campaigns (organization_id, platform);
create index campaigns_org_status_idx on campaigns (organization_id, status);

create table ad_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  campaign_id uuid not null references campaigns (id) on delete cascade,
  external_id text not null,
  name text not null,
  status campaign_status not null default 'active',
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (campaign_id, external_id)
);
create index ad_groups_campaign_idx on ad_groups (campaign_id);

create table creatives (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  campaign_id uuid not null references campaigns (id) on delete cascade,
  ad_group_id uuid references ad_groups (id) on delete set null,
  platform platform not null,
  external_id text not null,
  name text not null,
  type text not null default 'text',
  status campaign_status not null default 'active',
  headline text,
  primary_text text,
  description text,
  cta text,
  landing_url text,
  asset_status creative_asset_status not null default 'unavailable',
  asset_id text,
  asset_url text,
  preview_url text,
  thumbnail_url text,
  width int,
  height int,
  test_group text,
  variant text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, platform, external_id)
);
create index creatives_campaign_idx on creatives (campaign_id);

create table ads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  ad_group_id uuid references ad_groups (id) on delete cascade,
  creative_id uuid references creatives (id) on delete set null,
  external_id text not null,
  name text,
  status campaign_status not null default 'active',
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, external_id)
);

-- Normalized daily performance for any entity (campaign, creative).
create table performance_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  entity_type text not null check (entity_type in ('campaign', 'creative', 'ad_group')),
  entity_id uuid not null,
  date date not null,
  spend numeric(14, 2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  leads int not null default 0,
  mqls int not null default 0,
  sqls int not null default 0,
  opportunities int not null default 0,
  pipeline numeric(14, 2) not null default 0,
  revenue numeric(14, 2) not null default 0,
  frequency numeric(8, 3),
  platform_conversions numeric(12, 2),
  platform_conversion_value numeric(14, 2),
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id, date)
);
create index perf_org_date_idx on performance_metrics (organization_id, date);
create index perf_entity_date_idx on performance_metrics (entity_type, entity_id, date);

-- ───────────────────────────── CRM / Funnel ─────────────────────────────
create table companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  external_id text,
  name text not null,
  domain text,
  industry text,
  company_size text,
  country text,
  region text,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, external_id)
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  company_id uuid references companies (id) on delete set null,
  external_id text,
  email text,
  job_title text,
  seniority text,
  country text,
  first_touch_campaign_id uuid references campaigns (id) on delete set null,
  first_touch_platform platform,
  lifecycle_stage text,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, external_id)
);
create index contacts_org_campaign_idx on contacts (organization_id, first_touch_campaign_id);

create table funnel_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  contact_id uuid references contacts (id) on delete cascade,
  campaign_id uuid references campaigns (id) on delete set null,
  creative_id uuid references creatives (id) on delete set null,
  stage text not null check (stage in ('lead', 'mql', 'sql', 'opportunity', 'closed_won', 'closed_lost')),
  occurred_at timestamptz not null,
  source text not null default 'hubspot',
  raw jsonb,
  created_at timestamptz not null default now()
);
create index funnel_events_org_stage_idx on funnel_events (organization_id, stage, occurred_at);

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  contact_id uuid references contacts (id) on delete set null,
  company_id uuid references companies (id) on delete set null,
  campaign_id uuid references campaigns (id) on delete set null,
  external_id text,
  name text,
  stage text not null,
  amount numeric(14, 2) not null default 0,
  is_closed boolean not null default false,
  is_won boolean not null default false,
  created_at_source timestamptz,
  closed_at timestamptz,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, external_id)
);
create index opportunities_org_campaign_idx on opportunities (organization_id, campaign_id);

create table pipeline_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  opportunity_id uuid not null references opportunities (id) on delete cascade,
  from_stage text,
  to_stage text not null,
  amount numeric(14, 2),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Pre-aggregated ICP segment performance (rebuilt by the hourly scan).
create table audience_segment_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  window_start date not null,
  window_end date not null,
  dimension text not null check (dimension in ('industry', 'company_size', 'job_title', 'seniority', 'geography')),
  value text not null,
  spend numeric(14, 2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  leads int not null default 0,
  mqls int not null default 0,
  sqls int not null default 0,
  opportunities int not null default 0,
  pipeline numeric(14, 2) not null default 0,
  revenue numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  unique (organization_id, window_start, window_end, dimension, value)
);

-- ───────────────────────────── AI agent ─────────────────────────────
create table scan_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  platforms_scanned platform[] not null default '{}',
  campaigns_scanned int not null default 0,
  issues_detected int not null default 0,
  recommendations_created int not null default 0,
  actions_executed int not null default 0,
  errors jsonb not null default '[]',
  status scan_status not null default 'running'
);
create index scan_runs_org_started_idx on scan_runs (organization_id, started_at desc);

create table ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  scan_run_id uuid references scan_runs (id) on delete set null,
  campaign_id uuid references campaigns (id) on delete cascade,
  creative_id uuid references creatives (id) on delete set null,
  platform platform,
  type text not null,
  priority text not null default 'medium',
  title text not null,
  what_happened text not null,
  why text not null,
  recommended_action text not null,
  expected_impact jsonb not null default '{}',
  confidence numeric(4, 3) not null default 0.5,
  status recommendation_status not null default 'pending',
  budget_change jsonb,
  requires_approval boolean not null default true,
  dedupe_key text,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references users (id)
);
create index recs_org_status_idx on ai_recommendations (organization_id, status, created_at desc);
create unique index recs_dedupe_idx on ai_recommendations (organization_id, dedupe_key) where dedupe_key is not null and status = 'pending';

create table optimization_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  recommendation_id uuid references ai_recommendations (id) on delete set null,
  platform platform not null,
  campaign_id uuid references campaigns (id) on delete set null,
  campaign_name text not null,
  action_type text not null,
  before_value text not null,
  after_value text not null,
  reason text not null,
  expected_impact text not null,
  actual_impact text,
  approver text,
  approver_user_id uuid references users (id),
  status action_status not null default 'pending_approval',
  external_change_id text,
  created_at timestamptz not null default now(),
  executed_at timestamptz,
  measured_at timestamptz
);
create index actions_org_created_idx on optimization_actions (organization_id, created_at desc);

create table daily_briefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  date date not null,
  subject text not null,
  summary_markdown text not null,
  email_html text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, date)
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  actor text not null,
  actor_user_id uuid references users (id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_org_created_idx on audit_logs (organization_id, created_at desc);

-- ───────────────────────────── updated_at trigger ─────────────────────────────
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['organizations','integrations','campaigns','creatives','performance_metrics','org_settings']
  loop
    execute format('create trigger %I_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;
