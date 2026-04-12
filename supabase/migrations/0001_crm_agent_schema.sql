-- V2.0 CRM agent canonical read schema.
-- Apply to a non-production Supabase project first, then seed from local SQLite export.

create schema if not exists crm_agent;

create table if not exists crm_agent.customers (
  id_1 text primary key,
  title text,
  phone_office text,
  email text,
  industry_name text,
  customer_group_name text,
  mgr_display_name text,
  total_revenue numeric,
  account_source_full_name text,
  relation_name text,
  latest_interaction text,
  description text,
  created_at_1 text,
  updated_at_1 text,
  province_name text
);

create table if not exists crm_agent.orders (
  order_id bigint primary key,
  order_code text,
  account_id bigint,
  id_1 text,
  account_phone text,
  saler_name text,
  status_label text,
  real_amount numeric,
  discount_amount numeric,
  vat_amount numeric,
  payment_status text,
  order_date text,
  created_at text,
  updated_at text,
  products_json text
);

create table if not exists crm_agent.staffs (
  user_id bigint primary key,
  contact_id bigint,
  contact_name text,
  dept_id bigint,
  dept_name text,
  email text,
  contact_mobile text,
  callio_extension text,
  raw_extensions_json text
);

create table if not exists crm_agent.kpis_daily (
  day text primary key,
  revenue_amount numeric,
  new_leads_count integer,
  new_customers_count integer
);

create table if not exists crm_agent.revenue_series (
  day text,
  month_key text,
  month_label text,
  iso_week_key text,
  iso_week_label text,
  day_label text,
  revenue_amount numeric,
  primary key (day, iso_week_key, month_key)
);

create table if not exists crm_agent.sales_leaderboard_monthly (
  month_key text,
  seller_name text,
  team_name text,
  revenue_amount numeric,
  order_count integer,
  rank_order integer,
  primary key (month_key, seller_name)
);

create table if not exists crm_agent.recent_orders (
  order_id bigint primary key,
  order_code text,
  customer_id text,
  customer_title text,
  order_date text,
  created_at text,
  amount numeric,
  seller_name text,
  team_name text,
  status_label text,
  is_cancelled integer,
  sort_timestamp text
);

create table if not exists crm_agent.dashboard_meta (
  meta_key text primary key,
  meta_value text
);

create table if not exists crm_agent.activation_accounts (
  account text primary key,
  customer_type text,
  customer_id text,
  customer_name text,
  sale_owner text,
  activation_date text,
  activation_month_end text,
  expiry_date text,
  expiry_month_end text,
  contract_term text,
  account_type text,
  is_renew_contract integer
);

create table if not exists crm_agent.expired_accounts (
  account text,
  activation_date text,
  activation_month_end text,
  expiry_date text,
  expiry_month_end text,
  account_type text,
  password_value text,
  password_customer_id text,
  primary key (account, expiry_date)
);

create table if not exists crm_agent.ops_raw_daily (
  day_key text,
  account text,
  regdate text,
  organization_name text,
  open_cnt integer,
  create_cnt integer,
  update_cnt integer,
  render_cnt integer,
  month_end_key text,
  quality_flag integer,
  open_flag integer,
  invalid_daily integer,
  primary key (day_key, account)
);

create table if not exists crm_agent.monthly_metrics (
  account text,
  month_end_key text,
  open_cnt integer,
  create_cnt integer,
  update_cnt integer,
  render_cnt integer,
  quality_numerator integer,
  open_days integer,
  quality_ratio numeric,
  invalid_daily_count integer,
  latest_active_date text,
  primary key (account, month_end_key)
);

create table if not exists crm_agent.monthly_status (
  account text,
  month_end_key text,
  status text,
  category text,
  primary key (account, month_end_key)
);

create table if not exists crm_agent.due_accounts (
  account text,
  due_month_key text,
  due_date text,
  source text,
  customer_type text,
  renewed integer,
  customer_id text,
  customer_name text,
  sale_owner text,
  account_type text,
  renew_activation_date text,
  renew_expiry_date text,
  current_expiry_date text,
  primary key (account, due_month_key)
);

create table if not exists crm_agent.operations_meta (
  key text primary key,
  value text
);

create index if not exists idx_crm_agent_orders_saler_month
  on crm_agent.orders (saler_name, order_date);

create index if not exists idx_crm_agent_orders_customer
  on crm_agent.orders (id_1);

create index if not exists idx_crm_agent_customers_source
  on crm_agent.customers (account_source_full_name);

create index if not exists idx_crm_agent_leaderboard_month
  on crm_agent.sales_leaderboard_monthly (month_key, rank_order);

create index if not exists idx_crm_agent_monthly_status_month
  on crm_agent.monthly_status (month_end_key, status, category);

create index if not exists idx_crm_agent_due_month
  on crm_agent.due_accounts (due_month_key, renewed);

-- Create a dedicated read-only role manually in Supabase before production use.
-- Example:
-- create role crm_agent_readonly login password '<replace>';
-- grant usage on schema crm_agent to crm_agent_readonly;
-- grant select on all tables in schema crm_agent to crm_agent_readonly;
-- alter default privileges in schema crm_agent grant select on tables to crm_agent_readonly;
