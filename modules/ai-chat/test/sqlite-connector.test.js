import test from "node:test";
import assert from "node:assert/strict";
import { SQLiteConnector } from "../src/connectors/sqlite-connector.js";

test("SQLiteConnector exposes health check and canonical marts", () => {
  const connector = new SQLiteConnector();
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
