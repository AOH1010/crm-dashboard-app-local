import { buildApiUrl } from "./apiBase";

export interface TeamResponse {
  as_of: string | null;
  applied_filters: {
    from: string;
    to: string;
  };
  teams: Array<{
    key: string;
    label: string;
    color: string;
  }>;
  team_summaries: Array<{
    team_key: string;
    team_label: string;
    color: string;
    revenue_amount: number;
    order_count: number;
    member_count: number;
  }>;
  team_members: Record<string, Array<{
    seller_name: string;
    revenue_amount: number;
    order_count: number;
  }>>;
  trend: {
    monthly_points: Array<{
      month_key: string;
      label: string;
      fire: number;
      andes: number;
      ka: number;
      hcm: number;
    }>;
    weekly_points: Array<{
      week_key: string;
      label: string;
      fire: number;
      andes: number;
      ka: number;
      hcm: number;
    }>;
  };
}

export async function fetchTeam(params: {
  from: string;
  to: string;
}): Promise<TeamResponse> {
  const searchParams = new URLSearchParams({
    from: params.from,
    to: params.to,
  });

  const response = await fetch(buildApiUrl(`/api/sales/team?${searchParams.toString()}`));
  if (!response.ok) {
    throw new Error("Failed to fetch team data.");
  }

  return response.json();
}
