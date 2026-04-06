import { buildDashboardSalesDb } from "./lib/dashboard-sales-db.js";

const result = buildDashboardSalesDb();
console.log(
  `[dashboard-sales-db] built ${result.analyticsDbPath} from ${result.sourceDbPath} at ${result.builtAt}`,
);
