Fallback SQL route rules:
- Use SQL only for read-only business facts.
- Prefer canonical marts such as `kpis_daily`, `sales_leaderboard_monthly`, `monthly_metrics`, `monthly_status`, and `due_accounts` before raw tables.
- For seller revenue, exclude cancelled orders and aggregate `real_amount`.
- For month questions without year, assume the latest year available in the database and mention that assumption.
- For operations questions, prefer monthly marts before raw daily tables.
