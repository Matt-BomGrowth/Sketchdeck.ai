-- Channel-level detail for the redesigned dashboard: Google Ads keywords and
-- search terms, GA4 daily by channel / landing page / key event, Search
-- Console daily by query / page, and the CRM funnel by original source.
-- All rows are written by the scan (service role) and read by the app.

-- ───────────────────────── Google Ads: keywords ─────────────────────────
create table google_ads_keyword_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  campaign_id uuid not null references campaigns (id) on delete cascade,
  ad_group_external_id text not null,
  ad_group_name text not null default '',
  ad_group_status campaign_status not null default 'active',
  external_id text not null, -- ad_group_criterion.criterion_id
  keyword_text text not null,
  match_type text not null default 'UNSPECIFIED', -- EXACT | PHRASE | BROAD
  status campaign_status not null default 'active',
  quality_score int,
  date date not null,
  spend numeric(14, 2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  conversions numeric(12, 2) not null default 0,
  conversion_value numeric(14, 2) not null default 0,
  top_impression_pct numeric(6, 4),
  search_impression_share numeric(6, 4),
  source text not null default 'notfair',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, ad_group_external_id, external_id, date)
);
create index gads_keyword_org_date_idx on google_ads_keyword_metrics (organization_id, date);
create index gads_keyword_campaign_idx on google_ads_keyword_metrics (campaign_id, date);

-- ─────────────────────── Google Ads: search terms ───────────────────────
create table google_ads_search_term_metrics (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  campaign_id uuid not null references campaigns (id) on delete cascade,
  ad_group_external_id text not null,
  ad_group_name text not null default '',
  search_term text not null,
  status text not null default 'NONE', -- ADDED | EXCLUDED | ADDED_EXCLUDED | NONE
  keyword_text text not null default '',
  match_type text not null default 'UNSPECIFIED',
  date date not null,
  spend numeric(14, 2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  conversions numeric(12, 2) not null default 0,
  conversion_value numeric(14, 2) not null default 0,
  source text not null default 'notfair',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, ad_group_external_id, search_term, keyword_text, match_type, date)
);
create index gads_search_term_org_date_idx on google_ads_search_term_metrics (organization_id, date);

-- ────────────────────────────── GA4 daily ──────────────────────────────
-- dimension: 'channel' (value = default channel group), 'landing_page'
-- (value = landing page path), 'key_event' (value = channel group,
-- sub_value = event name).
create table ga4_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  date date not null,
  dimension text not null check (dimension in ('channel', 'landing_page', 'key_event')),
  value text not null,
  sub_value text not null default '',
  sessions bigint not null default 0,
  users bigint not null default 0,
  new_users bigint not null default 0,
  engaged_sessions bigint not null default 0,
  key_events numeric(12, 2) not null default 0,
  source text not null default 'notfair',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, date, dimension, value, sub_value)
);
create index ga4_daily_org_date_idx on ga4_daily (organization_id, date, dimension);

-- ───────────────────────── Search Console daily ─────────────────────────
-- dimension: 'site' (value = ''), 'query', 'page'. `position` is the day's
-- average; aggregate it impression-weighted.
create table search_console_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  date date not null,
  dimension text not null check (dimension in ('site', 'query', 'page')),
  value text not null default '',
  clicks bigint not null default 0,
  impressions bigint not null default 0,
  position numeric(8, 3),
  source text not null default 'notfair',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, date, dimension, value)
);
create index sc_daily_org_date_idx on search_console_daily (organization_id, date, dimension);

-- ───────────────────── CRM funnel by original source ─────────────────────
-- Every lifecycle/deal event from the CRM, counted per day, original
-- traffic source (HubSpot hs_analytics_source) and stage — independent of
-- whether it could be attributed to a paid campaign.
create table crm_funnel_daily (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  date date not null,
  source text not null default 'UNKNOWN',
  stage text not null check (stage in ('lead', 'mql', 'sql', 'opportunity', 'closed_won', 'closed_lost')),
  count int not null default 0,
  amount numeric(14, 2) not null default 0,
  provider text not null default 'hubspot',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, date, source, stage)
);
create index crm_funnel_daily_org_date_idx on crm_funnel_daily (organization_id, date);

-- ───────────────────────── RLS + updated_at ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['google_ads_keyword_metrics','google_ads_search_term_metrics','ga4_daily','search_console_daily','crm_funnel_daily'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I_select on %I for select using (organization_id = current_organization_id())', t, t);
    execute format('create policy %I_insert on %I for insert with check (organization_id = current_organization_id())', t, t);
    execute format('create policy %I_update on %I for update using (organization_id = current_organization_id())', t, t);
    execute format('create policy %I_delete on %I for delete using (organization_id = current_organization_id())', t, t);
    execute format('create trigger %I_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;
