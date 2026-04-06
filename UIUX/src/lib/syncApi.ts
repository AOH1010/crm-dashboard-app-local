import { buildApiUrl } from "./apiBase";

export type SyncMode =
  | "auto"
  | "full"
  | "customers-auto"
  | "orders-auto"
  | "customers-full"
  | "orders-full";

export interface SyncStatusResponse {
  ok: boolean;
  enabled: boolean;
  running: boolean;
  active_run_id: string | null;
  queued_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  last_status: string | null;
  last_mode: string | null;
  last_trigger: string | null;
  last_error: string | null;
  default_mode?: string | null;
  interval_minutes?: number | null;
  sync_state_rows?: Array<{
    job_name: string;
    last_successful_updated_at: string | null;
    last_started_at: string | null;
    last_completed_at: string | null;
    last_status: string | null;
  }>;
  log_tail?: string[];
}

function buildSyncHeaders(syncToken: string) {
  return {
    "Authorization": `Bearer ${syncToken}`,
    "Content-Type": "application/json",
  };
}

export async function fetchSyncStatus(syncToken: string): Promise<SyncStatusResponse> {
  const response = await fetch(buildApiUrl("/api/admin/sync/status"), {
    headers: buildSyncHeaders(syncToken),
  });

  if (!response.ok) {
    throw new Error("Khong the tai trang thai sync.");
  }

  return response.json();
}

export async function triggerSyncRun(params: {
  syncToken: string;
  mode: SyncMode;
  trigger?: string;
}) {
  const response = await fetch(buildApiUrl("/api/admin/sync"), {
    method: "POST",
    headers: buildSyncHeaders(params.syncToken),
    body: JSON.stringify({
      mode: params.mode,
      trigger: params.trigger || "ui-admin",
    }),
  });

  if (!response.ok && response.status !== 409) {
    throw new Error("Khong the bat dau sync.");
  }

  return response.json();
}
