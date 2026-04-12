import React, { useEffect, useState } from "react";
import { DatabaseZap, LoaderCircle, RefreshCw, ShieldEllipsis, X } from "lucide-react";
import { fetchSyncStatus, triggerSyncRun, type SyncMode, type SyncStatusResponse } from "../lib/syncApi";

const STORAGE_KEY = "crm_sync_admin_token";

const ACTIONS: Array<{ mode: SyncMode; label: string; tone: string }> = [
  { mode: "auto", label: "Auto sync now", tone: "bg-primary text-primary-foreground" },
  { mode: "customers-full", label: "Full customers", tone: "bg-primary text-on-primary" },
  { mode: "orders-full", label: "Full orders", tone: "bg-muted text-card-foreground" },
  { mode: "full", label: "Full all", tone: "bg-error text-on-error" },
];

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export default function SyncAdminPanel() {
  const [open, setOpen] = useState(false);
  const [syncToken, setSyncToken] = useState("");
  const [status, setStatus] = useState<SyncStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMode, setActionMode] = useState<SyncMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = window.localStorage.getItem(STORAGE_KEY) || "";
    if (storedToken) {
      setSyncToken(storedToken);
    }
  }, []);

  useEffect(() => {
    if (!open || !syncToken.trim()) {
      return undefined;
    }

    let cancelled = false;

    const loadStatus = async () => {
      try {
        const nextStatus = await fetchSyncStatus(syncToken.trim());
        if (!cancelled) {
          setStatus(nextStatus);
          setError(null);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Khong the tai sync status.");
        }
      }
    };

    void loadStatus();
    const intervalId = window.setInterval(() => {
      void loadStatus();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [open, syncToken]);

  const handleSaveToken = async () => {
    const trimmedToken = syncToken.trim();
    if (!trimmedToken) {
      setError("Nhap sync token truoc.");
      return;
    }

    setLoading(true);
    try {
      const nextStatus = await fetchSyncStatus(trimmedToken);
      window.localStorage.setItem(STORAGE_KEY, trimmedToken);
      setStatus(nextStatus);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Khong the xac thuc sync token.");
    } finally {
      setLoading(false);
    }
  };

  const handleTrigger = async (mode: SyncMode) => {
    const trimmedToken = syncToken.trim();
    if (!trimmedToken) {
      setError("Nhap sync token truoc.");
      return;
    }

    setActionMode(mode);
    try {
      await triggerSyncRun({
        syncToken: trimmedToken,
        mode,
      });
      const nextStatus = await fetchSyncStatus(trimmedToken);
      setStatus(nextStatus);
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Khong the kich hoat sync.");
    } finally {
      setActionMode(null);
    }
  };

  const clearToken = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    setSyncToken("");
    setStatus(null);
    setError(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-xs font-bold text-card-foreground shadow-sm transition hover:bg-muted"
      >
        <span className="flex items-center gap-2">
          <DatabaseZap className="h-4 w-4" />
          Data Sync
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 top-14 z-50 w-[26rem] rounded-2xl border border-border bg-popover p-4 shadow-2xl shadow-slate-900/15">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-extrabold text-card-foreground">Sync Admin</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Auto mode chay customer incremental nhe va orders incremental. Full mode dung de scrape tay.
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1 text-muted-foreground hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="rounded-xl border border-border bg-muted/50 p-3">
            <label className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
              <ShieldEllipsis className="h-4 w-4" />
              Sync Token
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={syncToken}
                onChange={(event) => setSyncToken(event.target.value)}
                placeholder="Nhap sync token backend"
                className="h-10 flex-1 rounded-xl border border-border bg-popover px-3 text-sm outline-none transition focus:border-primary"
              />
              <button
                type="button"
                onClick={() => void handleSaveToken()}
                disabled={loading}
                className="rounded-xl bg-primary px-3 text-xs font-bold text-primary-foreground disabled:opacity-60"
              >
                {loading ? "..." : "Save"}
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Token duoc luu local trong trinh duyet nay.</span>
              <button type="button" onClick={clearToken} className="font-bold text-muted-foreground hover:underline">
                Clear
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {ACTIONS.map((action) => (
              <button
                key={action.mode}
                type="button"
                onClick={() => void handleTrigger(action.mode)}
                disabled={Boolean(actionMode) || Boolean(status?.running)}
                className={`rounded-xl px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${action.tone}`}
              >
                {actionMode === action.mode ? "Dang chay..." : action.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => syncToken.trim() ? void handleSaveToken() : undefined}
            className="mt-3 flex items-center gap-2 text-xs font-bold text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh status
          </button>

          <div className="mt-4 rounded-xl border border-border bg-muted/50 p-3 text-xs text-muted-foreground">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="font-bold text-muted-foreground">State:</span>{" "}
                {status?.running ? "running" : status?.last_status || "--"}
              </div>
              <div>
                <span className="font-bold text-muted-foreground">Mode:</span>{" "}
                {status?.running ? status?.last_mode : status?.default_mode || status?.last_mode || "--"}
              </div>
              <div>
                <span className="font-bold text-muted-foreground">Started:</span>{" "}
                {formatDateTime(status?.started_at)}
              </div>
              <div>
                <span className="font-bold text-muted-foreground">Finished:</span>{" "}
                {formatDateTime(status?.finished_at)}
              </div>
            </div>

            {status?.sync_state_rows?.length ? (
              <div className="mt-3 space-y-1 rounded-xl bg-popover p-3">
                {status.sync_state_rows.map((row) => (
                  <div key={row.job_name} className="flex items-center justify-between gap-3">
                    <span className="font-bold text-slate-800">{row.job_name}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {row.last_status || "--"} | {row.last_successful_updated_at || "--"}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}

            {status?.log_tail?.length ? (
              <div className="mt-3 max-h-40 overflow-y-auto rounded-xl bg-[#101114] p-3 font-mono text-[11px] text-slate-200">
                {status.log_tail.slice(-12).map((line) => (
                  <div key={line} className="mb-1 last:mb-0">
                    {line}
                  </div>
                ))}
              </div>
            ) : null}

            {status?.running ? (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-primary-container/30 px-3 py-2 text-[11px] font-bold text-card-foreground">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                Sync dang chay. Sau khi backend xong, bam Load live data o man hinh can xem de cap nhat cache.
              </div>
            ) : null}

            {error ? (
              <div className="mt-3 rounded-xl bg-error/10 px-3 py-2 text-[11px] font-bold text-error">
                {error}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
