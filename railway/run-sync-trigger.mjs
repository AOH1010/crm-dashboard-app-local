const syncTriggerUrl = String(process.env.SYNC_TRIGGER_URL || "").trim();
const syncAdminToken = String(process.env.SYNC_ADMIN_TOKEN || "").trim();
const syncMode = String(process.env.SYNC_TRIGGER_MODE || "incremental").trim().toLowerCase();
const triggerSource = String(process.env.SYNC_TRIGGER_SOURCE || "railway-cron").trim();

if (!syncTriggerUrl) {
  console.error("[sync-trigger] Missing SYNC_TRIGGER_URL");
  process.exit(1);
}

if (!syncAdminToken) {
  console.error("[sync-trigger] Missing SYNC_ADMIN_TOKEN");
  process.exit(1);
}

const response = await fetch(syncTriggerUrl, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${syncAdminToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    mode: syncMode === "full" ? "full" : "incremental",
    trigger: triggerSource,
  }),
});

const bodyText = await response.text();
console.log(`[sync-trigger] status=${response.status} body=${bodyText}`);

if (response.status === 202 || response.status === 200 || response.status === 409) {
  process.exit(0);
}

process.exit(1);
