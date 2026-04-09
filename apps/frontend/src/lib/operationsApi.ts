import { buildApiUrl } from "./apiBase";

export type OperationsMetric = "open" | "create" | "update" | "render";
export type TenureBucket = "all" | "0-3" | "3-6" | "6-9" | "9-12" | "12+";

export interface OperationsUserMapResponse {
  as_of: string | null;
  applied_filters: {
    report_month: string;
  };
  thresholds: {
    open_low: number;
    open_high: number;
    quality: number;
  };
  kpis: {
    total_active: number;
    total_inactive: number;
    active_rate: number;
    bv_count: number;
    ng_count: number;
  };
  quadrants: {
    points: Array<{
      account: string;
      customer_id: string | null;
      customer_name: string | null;
      sale_owner: string | null;
      account_type: string | null;
      customer_type: string | null;
      open_cnt: number;
      quality_ratio: number;
      latest_active_date: string | null;
      status: string | null;
      category: string;
      color: string;
    }>;
  };
  segment_breakdown: Array<{
    category: string;
    account_count: number;
    share: number;
    color: string;
  }>;
  qa: {
    official_accounts: number;
    raw_accounts_excluded: number;
    invalid_daily_rows: number;
  };
}

export interface OperationsActiveMapResponse {
  as_of: string | null;
  applied_filters: {
    report_month: string;
    tenure_bucket: TenureBucket;
  };
  bucket_summary: Array<{
    key: TenureBucket;
    label: string;
    account_count: number;
  }>;
  kpis: {
    tracked_accounts: number;
    active_accounts: number;
    active_rate: number;
    risk_accounts: number;
    avg_quality: number;
  };
  rows: Array<{
    account: string;
    customer_type: string | null;
    customer_id: string | null;
    customer_name: string | null;
    sale_owner: string | null;
    activation_date: string | null;
    expiry_date: string | null;
    account_type: string | null;
    open_cnt: number;
    create_cnt: number;
    update_cnt: number;
    render_cnt: number;
    quality_ratio: number;
    status: string | null;
    category: string;
    tenure_months: number | null;
    latest_active_date: string | null;
  }>;
}

export interface OperationsCohortResponse {
  as_of: string | null;
  applied_filters: {
    report_month: string;
    metric: OperationsMetric;
    threshold: number;
  };
  kpis: {
    t0_t3_rate: number;
    t3_t6_rate: number;
    t6_t12_rate: number;
  };
  qa: {
    invalid_daily_rows_total: number;
    invalid_account_months: number;
    affected_accounts: number;
  };
  cohorts: Array<{
    cohort_month: string;
    label: string;
    account_count: number;
    cells: Array<{
      offset: number;
      label: string;
      active_count: number;
      eligible_count: number;
      active_rate: number | null;
    }>;
  }>;
}

export interface OperationsRenewResponse {
  as_of: string | null;
  applied_filters: {
    report_month: string;
    year: number;
  };
  kpis: {
    due_count: number;
    renewed_count: number;
    renewal_rate: number;
    expired_pending: number;
  };
  chart: {
    points: Array<{
      month_key: string;
      label: string;
      due_count: number;
      renewed_count: number;
      current: boolean;
    }>;
  };
  expiring_window: {
    from: string;
    to: string;
  };
  expiring_accounts: Array<{
    account: string;
    customer_type: string | null;
    customer_id: string | null;
    customer_name: string | null;
    sale_owner: string | null;
    account_type: string | null;
    activation_date: string | null;
    expiry_date: string | null;
    contract_term: string | null;
    days_left: number;
    current_category: string;
    previous_category: string;
    category_history: Array<{
      month_key: string;
      label: string;
      status: string | null;
      category: string;
    }>;
  }>;
}

export async function fetchOperationsUserMap(reportMonth: string): Promise<OperationsUserMapResponse> {
  const searchParams = new URLSearchParams({ report_month: reportMonth });
  const response = await fetch(buildApiUrl(`/api/operations/user-map?${searchParams.toString()}`));
  if (!response.ok) {
    throw new Error("Failed to fetch user map data.");
  }
  return response.json();
}

export async function fetchOperationsActiveMap(params: {
  reportMonth: string;
  tenureBucket: TenureBucket;
}): Promise<OperationsActiveMapResponse> {
  const searchParams = new URLSearchParams({
    report_month: params.reportMonth,
    tenure_bucket: params.tenureBucket,
  });
  const response = await fetch(buildApiUrl(`/api/operations/active-map?${searchParams.toString()}`));
  if (!response.ok) {
    throw new Error("Failed to fetch active map data.");
  }
  return response.json();
}

export async function fetchOperationsCohort(params: {
  reportMonth: string;
  metric: OperationsMetric;
  threshold: number;
}): Promise<OperationsCohortResponse> {
  const searchParams = new URLSearchParams({
    report_month: params.reportMonth,
    metric: params.metric,
    threshold: String(params.threshold),
  });
  const response = await fetch(buildApiUrl(`/api/operations/cohort-active?${searchParams.toString()}`));
  if (!response.ok) {
    throw new Error("Failed to fetch cohort active data.");
  }
  return response.json();
}

export async function fetchOperationsRenew(params: {
  reportMonth: string;
  year: number;
}): Promise<OperationsRenewResponse> {
  const searchParams = new URLSearchParams({
    report_month: params.reportMonth,
    year: String(params.year),
  });
  const response = await fetch(buildApiUrl(`/api/operations/renew?${searchParams.toString()}`));
  if (!response.ok) {
    throw new Error("Failed to fetch renew data.");
  }
  return response.json();
}
