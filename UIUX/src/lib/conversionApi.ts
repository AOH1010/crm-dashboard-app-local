import { buildApiUrl } from "./apiBase";

export type CohortGrain = "month" | "week";

export interface ConversionResponse {
  as_of: string;
  applied_filters: {
    from: string;
    to: string;
    source_groups: string[];
    source_mode: "all" | "custom";
    cohort_grain: CohortGrain;
  };
  source_group_options: string[];
  funnel: {
    stages: Array<{
      key: string;
      label: string;
      value: number;
      rate: number;
    }>;
    side_metrics: Array<{
      key: string;
      label: string;
      value: number;
      rate: number;
    }>;
  };
  source_conversion: Array<{
    source_group: string;
    lead_count: number;
    customer_count: number;
    conversion_rate: number;
  }>;
  overall_conversion: {
    lead_count: number;
    customer_count: number;
    conversion_rate: number;
  };
  cohort: {
    grain: CohortGrain;
    rows: Array<{
      label: string;
      lead_count: number;
      values: Array<{
        count: number;
        rate: number | null;
      }>;
    }>;
  };
}

export async function fetchConversion(params: {
  from: string;
  to: string;
  cohortGrain: CohortGrain;
  sourceGroups: string[] | null;
}): Promise<ConversionResponse> {
  const searchParams = new URLSearchParams({
    from: params.from,
    to: params.to,
    cohort_grain: params.cohortGrain,
    source_mode: params.sourceGroups === null ? "all" : "custom",
  });

  for (const sourceGroup of params.sourceGroups || []) {
    searchParams.append("source_group", sourceGroup);
  }

  const response = await fetch(buildApiUrl(`/api/sales/conversion?${searchParams.toString()}`));
  if (!response.ok) {
    throw new Error("Failed to fetch conversion data.");
  }

  return response.json();
}
