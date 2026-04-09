import { buildApiUrl } from "./apiBase";

export type DashboardGrain = "month" | "week" | "day";

export interface DashboardResponse {
  as_of: string | null;
  applied_filters: {
    from: string;
    to: string;
    grain: DashboardGrain;
  };
  kpis: {
    total_revenue: number;
    new_leads: number;
    new_customers: number;
    conversion_rate: number;
  };
  revenue_series: {
    grain: DashboardGrain;
    compare_enabled: boolean;
    points: Array<{
      key: string;
      label: string;
      current: number;
      previous: number | null;
    }>;
  };
  leaderboard: Array<{
    seller_name: string;
    team_name: string;
    revenue_amount: number;
    order_count: number;
    rank: number;
  }>;
  recent_orders: Array<{
    order_id: number;
    order_code: string;
    customer_id: string;
    customer_title: string;
    order_date: string;
    created_at: string;
    amount: number;
    seller_name: string;
    team_name: string;
    status_label: string;
  }>;
}

export async function fetchDashboard(params: {
  from: string;
  to: string;
  grain: DashboardGrain;
}): Promise<DashboardResponse> {
  const searchParams = new URLSearchParams({
    from: params.from,
    to: params.to,
    grain: params.grain,
  });

  const response = await fetch(buildApiUrl(`/api/sales/dashboard?${searchParams.toString()}`));
  if (!response.ok) {
    throw new Error("Failed to fetch dashboard data.");
  }

  return response.json();
}
