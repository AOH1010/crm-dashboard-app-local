# Review: PLAN.md v2 (Codex viết lại) + Phân tích chiến lược SQLite vs Supabase/MCP

> **Reviewer:** Antigravity  
> **Ngày:** 2026-04-10  

---

## 1. Đánh giá tổng thể PLAN v2

| Tiêu chí | v1 (bản cũ) | v2 (bản mới) |
|---|---|---|
| Bám sát codebase | ❌ Generic | ✅ Reference cụ thể `agent-chat.js`, `agent-skill.js` |
| Actionability | ⚠️ Trung bình | ✅ 10 step rõ ràng, có file paths |
| Thứ tự hợp lý | ⚠️ Có vấn đề | ✅ Đúng: baseline → scaffold → refactor → build → cutover |
| Scope kiểm soát | ⚠️ Quá rộng (12 bước, MCP+Supabase) | ✅ Gọn, tập trung v1 limited beta |
| Continuity awareness | ❌ | ⚠️ Tốt hơn nhưng chưa cập nhật `docs/continuity.md` |

### Kết luận: **PLAN v2 tốt hơn đáng kể.** Nó:
- ✅ Biết code đang có gì (reference `agent-chat.js` L702, `agent-skill.js`)
- ✅ Giữ backward compatibility (endpoint + chat widget giữ nguyên)
- ✅ Chiến lược "freeze baseline → parallel build → parity check → cutover" rất an toàn
- ✅ Hybrid prompt+skills architecture hợp lý cho scale hiện tại
- ✅ Biết rằng `maybeHandleDirectSellerRevenueQuestion` (fast path doanh số seller) cần chuyển thành skill chính thức

### Vẫn thiếu nhẹ:
- Chưa có timeline / milestone markers (tuần/sprint nào xong step nào)
- Chưa cập nhật `docs/continuity.md` (nhưng đây là lỗi workflow, không phải lỗi plan)

---

## 2. Câu hỏi chiến lược: SQLite bây giờ, Supabase/MCP sau — có ổn không?

Đây là câu hỏi quan trọng nhất. Tôi đã đọc kỹ cả code (`agent-chat.js` 841 dòng) và PLAN. Đây là phân tích:

### 2.1 Codex đúng ở những điểm nào

**a) V1 nên tập trung vào skill architecture, không phải infra migration**

Vấn đề lớn nhất hiện tại **không phải** là SQLite vs Supabase. Vấn đề là `agent-chat.js` là một monolith 841 dòng không có abstraction. Mọi sự cải thiện (thêm skill, giảm token, logging) đều bị block bởi cấu trúc code, không phải database.

**b) Connector pattern bảo vệ khỏi "restructure hell"**

PLAN v2 nói đúng ở step 10:
> "Connector contract phải đủ để sau này thêm `SupabaseConnector`"

Nếu v1 build đúng connector abstraction, thì code ở tầng skill/runtime sẽ **không biết** đang query SQLite hay Supabase. Khi chuyển DB, chỉ cần viết `SupabaseConnector` implement cùng interface, không cần sửa skill nào.

**c) Skills + schema hint không phụ thuộc vào DB engine**

Skill `seller_month_revenue` query `orders WHERE saler_name = ? AND month = ?`. Query này chạy trên SQLite hay Postgres đều giống nhau. Cái phụ thuộc DB engine là:
- `ATTACH DATABASE` (SQLite only)
- `PRAGMA` (SQLite only)  
- Connection pooling (Postgres cần, SQLite không)

→ Tất cả những thứ này đều nằm trong **connector layer**, không ảnh hưởng business logic.

### 2.2 Rủi ro thực sự mà bạn lo — và cách giảm thiểu

Bạn lo: *"làm nhiều trên SQLite thì restructure lại rất khó"*

Rủi ro này **có thật**, nhưng nó nằm ở **data schema**, không phải ở **code**:

```
┌─────────────────────────────────────────────────────┐
│              CÁI GÌ KHÓ MIGRATE?                    │
├────────────────────────┬────────────────────────────┤
│ Dễ migrate (code)      │ Khó migrate (data)         │
├────────────────────────┼────────────────────────────┤
│ Skill logic            │ Schema 3 DB files riêng    │
│ Prompt files           │ Table names & column names │
│ Runtime routing        │ ATTACH DATABASE pattern    │
│ Telemetry logging      │ Data sync pipeline (tasks/)│
│ Frontend chat widget   │ Aggregation logic          │
│                        │ (dashboard-sales-db.js)    │
└────────────────────────┴────────────────────────────┘
```

### 2.3 Khuyến nghị: Giữ SQLite v1 nhưng thêm 2 safeguards

Tôi **đồng ý với Codex** rằng v1 nên giữ SQLite. Nhưng thêm 2 điều để tránh "restructure hell":

#### Safeguard 1: Canonical table names ngay từ v1

Hiện tại code có 3 namespace DB:
- `main.*` (customers, orders, staffs) — từ `crm.db`
- `dashboard.*` (dashboard_kpis_daily, ...) — từ `dashboard_sales.db`  
- `operations.*` (ops_*, ...) — từ `dashboard_operations.db`

**Vấn đề:** Skills viết SQL reference `dashboard.dashboard_kpis_daily`, `operations.ops_monthly_metrics`. Khi chuyển sang Supabase (1 DB, no ATTACH), tất cả prefix `dashboard.` và `operations.` sẽ vỡ.

**Fix ngay trong v1:** Connector layer nên **abstract hóa table reference**. Skill viết query với table name canonical (ví dụ `kpis_daily`), connector tự map thành `dashboard.dashboard_kpis_daily` trên SQLite hoặc `analytics.kpis_daily` trên Supabase.

```js
// ❌ Hiện tại: skill hardcode DB prefix
"SELECT * FROM dashboard.dashboard_kpis_daily WHERE ..."

// ✅ V1 nên làm: skill dùng canonical name, connector resolve
connector.query("kpis_daily", { where: ... })
// hoặc ít nhất
connector.resolveTable("kpis_daily") // → "dashboard.dashboard_kpis_daily" trên SQLite
```

#### Safeguard 2: Schema as config, không hardcode trong code

`agent-chat.js` hiện hardcode `ALLOWED_TABLES` (line 35-51) và `buildSchemaHint()` (line 274-326). Khi đổi DB, phải sửa code.

**Fix:** Đưa table registry ra config file:
```json
// modules/ai-chat/config/schema-registry.json
{
  "domains": {
    "sales": {
      "tables": ["kpis_daily", "revenue_series", "sales_leaderboard_monthly"],
      "source": "dashboard_sales.db"
    },
    "operations": {
      "tables": ["ops_activation_accounts", "ops_monthly_metrics"],
      "source": "dashboard_operations.db"  
    }
  }
}
```

Connector đọc config này để biết map table nào vào đâu. Khi đổi sang Supabase, chỉ cần đổi config, không sửa code.

### 2.4 Về MCP — đúng là chưa cần

MCP là **delivery mechanism**, không phải core logic. Workflow đúng:
1. Build skill catalog + connector (v1 — đang plan)
2. Ổn định internal API
3. Wrap thành MCP server (v2 — chỉ là adapter layer mỏng)

Làm MCP trước khi internal API ổn định = phải maintain 2 interface surfaces khi đang iterate nhanh. Codex đúng khi defer.

---

## 3. Tổng kết

### PLAN v2: ✅ Approve với 2 bổ sung

| # | Bổ sung | Lý do |
|---|---|---|
| 1 | **Canonical table naming** trong connector layer | Tránh hardcode `dashboard.`/`operations.` prefix — sẽ vỡ khi chuyển Supabase |
| 2 | **Schema registry config** thay vì hardcode `ALLOWED_TABLES` | Dễ swap DB source mà không sửa code |

### Chiến lược SQLite → Supabase: ✅ Ổn nếu:
- Connector contract abstract đúng (không leak SQLite-specific API)
- Table names có canonical mapping
- Schema config file thay vì hardcode
- Data pipeline (tasks/, sync-runner.js) có kế hoạch migrate riêng (chưa cần v1)

### Chiến lược defer MCP: ✅ Đúng
- MCP chỉ là adapter wrapping ToolCatalog — build sau khi internal skill API stable

---

> [!TIP]
> **Action ngay:** Nếu bạn approve PLAN v2, bước tiếp theo là step 1 — audit `agent-chat.js` và gom 30-40 câu hỏi thật. Tôi có thể bắt đầu audit ngay nếu bạn muốn.
