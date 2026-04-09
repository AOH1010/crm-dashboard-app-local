import { buildApiUrl } from "./apiBase";

export interface LeadsResponse {
  as_of: string;
  summary: {
    total_leads: number;
    total_customers: number;
    blank_province_count: number;
  };
  map: {
    province_counts: Array<{
      province_key: string;
      lead_count: number;
      customer_count: number;
    }>;
    top_provinces: {
      leads: Array<{
        province_key: string;
        lead_count: number;
        customer_count: number;
      }>;
      customers: Array<{
        province_key: string;
        lead_count: number;
        customer_count: number;
      }>;
    };
  };
  industry_mix: Array<{
    name: string;
    lead_count: number;
    customer_count: number;
  }>;
  segment_conversion: Array<{
    segment_group: string;
    lead_count: number;
    customer_count: number;
    conversion_rate: number;
  }>;
}

export async function fetchLeads(): Promise<LeadsResponse> {
  const response = await fetch(buildApiUrl("/api/sales/leads"));
  if (!response.ok) {
    throw new Error("Failed to fetch leads data.");
  }
  return response.json();
}
