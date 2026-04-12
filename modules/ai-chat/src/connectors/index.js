import { SQLiteConnector } from "./sqlite-connector.js";
import { SupabaseConnector } from "./supabase-connector.js";

export { DataConnector } from "./data-connector.js";
export { SQLiteConnector } from "./sqlite-connector.js";
export { SupabaseConnector } from "./supabase-connector.js";

export function createDefaultConnector() {
  const connectorKind = String(process.env.CRM_DATA_CONNECTOR || "sqlite").trim().toLowerCase();
  if (connectorKind === "supabase") {
    return new SupabaseConnector();
  }
  return new SQLiteConnector();
}
