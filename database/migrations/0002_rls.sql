-- Row-level security: every row is scoped to an organization; a user may only
-- see rows for the organization they belong to. The service role (used by
-- scheduled jobs) bypasses RLS by design.

create or replace function current_organization_id() returns uuid
language sql stable security definer set search_path = public as $$
  select organization_id from users where id = auth.uid();
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'organizations','users','org_settings','integrations','campaigns','ad_groups','creatives','ads',
    'performance_metrics','companies','contacts','funnel_events','opportunities','pipeline_events',
    'audience_segment_metrics','scan_runs','ai_recommendations','optimization_actions','daily_briefs','audit_logs'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- organizations: members can read their own organization.
create policy org_select on organizations for select using (id = current_organization_id());
create policy org_update on organizations for update using (id = current_organization_id());

-- users: members can read colleagues in the same organization and update themselves.
create policy users_select on users for select using (organization_id = current_organization_id());
create policy users_update_self on users for update using (id = auth.uid());

-- Generic org-scoped policies for all remaining tables.
do $$
declare t text;
begin
  foreach t in array array[
    'org_settings','integrations','campaigns','ad_groups','creatives','ads',
    'performance_metrics','companies','contacts','funnel_events','opportunities','pipeline_events',
    'audience_segment_metrics','scan_runs','ai_recommendations','optimization_actions','daily_briefs','audit_logs'
  ] loop
    execute format('create policy %I_select on %I for select using (organization_id = current_organization_id())', t, t);
    execute format('create policy %I_insert on %I for insert with check (organization_id = current_organization_id())', t, t);
    execute format('create policy %I_update on %I for update using (organization_id = current_organization_id())', t, t);
    execute format('create policy %I_delete on %I for delete using (organization_id = current_organization_id())', t, t);
  end loop;
end $$;

-- Viewers may not approve recommendations or execute actions.
create policy recs_decide_role on ai_recommendations for update
  using (organization_id = current_organization_id()
     and exists (select 1 from users u where u.id = auth.uid() and u.role in ('owner','admin','member')));
