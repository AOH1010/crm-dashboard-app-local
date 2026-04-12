import test from "node:test";
import assert from "node:assert/strict";
import { DataConnector } from "../src/connectors/data-connector.js";
import { createDefaultConnector, SQLiteConnector, SupabaseConnector } from "../src/connectors/index.js";

test("SQLiteConnector exposes health check and canonical marts", () => {
  const connector = new SQLiteConnector();
  assert.ok(connector instanceof DataConnector);
  assert.equal(typeof connector.getLatestOperationsMonthEndKey, "function");
  assert.equal(typeof connector.detectSellerCandidates, "function");
  const health = connector.healthCheck();
  assert.equal(health.ok, true);
  assert.equal(health.has_dashboard_db, true);

  const result = connector.runReadQuery({
    sql: "SELECT COUNT(*) AS c FROM kpis_daily",
    maxRows: 1
  });
  assert.ok(Number(result.rows[0].c) > 0);
});

test("SQLiteConnector blocks unsafe SQL", () => {
  const connector = new SQLiteConnector();
  assert.throws(() => connector.runReadQuery({
    sql: "SELECT * FROM orders; DROP TABLE orders",
    maxRows: 1
  }), /(Unsafe SQL keyword|Multiple SQL statements)/);

  assert.throws(() => connector.runReadQuery({
    sql: "SELECT * FROM orders; SELECT * FROM customers",
    maxRows: 1
  }), /Multiple SQL statements/);

  assert.throws(() => connector.runReadQuery({
    sql: "SELECT * FROM sqlite_master",
    maxRows: 1
  }), /not allowed/);
});

test("SQLiteConnector can resolve a unique seller alias token", () => {
  const connector = new SQLiteConnector();
  assert.equal(connector.detectSellerName("doanh thu Huy thang 1"), "Hoàng Văn Huy");
});

test("default connector can be selected by CRM_DATA_CONNECTOR", () => {
  const original = process.env.CRM_DATA_CONNECTOR;
  try {
    process.env.CRM_DATA_CONNECTOR = "sqlite";
    assert.ok(createDefaultConnector() instanceof SQLiteConnector);

    process.env.CRM_DATA_CONNECTOR = "supabase";
    const supabaseConnector = createDefaultConnector();
    assert.ok(supabaseConnector instanceof SupabaseConnector);
    assert.equal(supabaseConnector.healthCheck().connector, "supabase");
    assert.equal(typeof supabaseConnector.healthCheck().pooled, "boolean");
  } finally {
    if (original === undefined) {
      delete process.env.CRM_DATA_CONNECTOR;
    } else {
      process.env.CRM_DATA_CONNECTOR = original;
    }
  }
});

test("SupabaseConnector keeps the read-only SQL guardrail even before query execution is enabled", () => {
  const connector = new SupabaseConnector();
  assert.throws(() => connector.assertSafeSql("DELETE FROM orders"), /Only SELECT\/WITH|Unsafe SQL keyword/);
  assert.throws(() => connector.assertSafeSql("SELECT * FROM sqlite_master"), /not allowed/);
  assert.equal(connector.assertSafeSql("SELECT COUNT(*) AS c FROM orders"), "SELECT COUNT(*) AS c FROM orders");
  assert.equal(typeof connector.runReadQueryAsync, "function");
});
