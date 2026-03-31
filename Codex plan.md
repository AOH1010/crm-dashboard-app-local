# Phase 1 không UI: Insight khách hàng + Recommendation + Action Plan

## Phase 1 Checklist (Tracking)
1. Ổn định và tối ưu lớp dữ liệu hiện có
2. Chuẩn hóa dữ liệu để phân tích (`customer_features`)
3. Xây lớp product knowledge (`product_catalog`)
4. Segment khách hàng theo nhóm hành động
5. Sinh recommendation và action plan

## Summary
- Mục tiêu Phase 1 là tạo một pipeline offline chạy được trên codebase hiện tại để:
  - làm sạch và tái phân tích lịch sử trao đổi của khách hàng,
  - kết hợp dữ liệu CRM + orders + lifecycle + ma trận sản phẩm trong `jega products`,
  - sinh `insight`, `relationship summary`, `recommended products`, và `action plan list`.
- Không làm NocoDB, không làm UI, không làm FastAPI trước.
- Hướng triển khai chốt: `filter toàn bộ khách -> chia nhóm hành động -> đào sâu từng nhóm -> chỉ AI hóa shortlist cần thiết`.

## Implementation Changes
### 1. Ổn định và tối ưu lớp dữ liệu hiện có
- Tách module dùng chung cho config, HTTP session, SQLite access; `scrape_getfly.py` và `scrape_orders.py` chỉ còn vai trò ingest.
- Bỏ hardcoded secrets, chỉ đọc từ env.
- Bổ sung index cho:
  - `customers(relation_name)`
  - `customers(industry_name)`
  - `customers(account_source_full_name)`
  - `customers(province_name)`
  - `customers(updated_at_1)`
  - `orders(id_1)`
  - `orders(updated_at)`
  - `customer_lifecycle(first_purchase_date)`
- Đổi insert loop sang batch write (`executemany`) cho customer/order/derived outputs.
- Thêm timeout + retry + structured logging cho mọi API call.

### 2. Chuẩn hóa dữ liệu để phân tích
- Tạo job mới `build_customer_features.py` đọc từ `customers`, `orders`, `customer_lifecycle`.
- Sinh bảng dẫn xuất `customer_features` với các trường chính:
  - `id_1`
  - `interaction_clean`
  - `interaction_count`
  - `last_interaction_at`
  - `last_actor`
  - `relationship_history_summary`
  - `has_orders`
  - `order_count`
  - `total_paid_amount`
  - `last_order_date`
  - `current_stage`
  - `source`
  - `province_norm`
  - `customer_segment`
  - `priority_score`
- Chuẩn hóa text interaction:
  - bỏ HTML, `&nbsp;`, hashtag markup, bảng HTML, line noise,
  - giữ lại timeline cơ bản `[time] actor: content`,
  - rút trích keyword bán hàng như: quan tâm, demo, báo giá, chốt, gia hạn, tái ký, không nghe máy, add zalo.
- Chuẩn hóa dimensions:
  - province viết hoa/thường không nhất quán,
  - relation_name thành nhóm chuẩn,
  - source giữ raw và thêm source group.

### 3. Xây lớp product knowledge từ folder `jega products`
- Tạo job `build_product_catalog.py`.
- Nguồn vào:
  - text files trong [jega products/Product description](/f:/Antigravity/CRM/jega%20products/Product%20description)
  - workbook `Hero solution.xlsx`
  - workbook `Product plan.xlsx`
- Output là bảng `product_catalog` và `product_signals`:
  - `product_id`
  - `product_name`
  - `category`
  - `target_industries`
  - `target_roles`
  - `pain_points`
  - `benefits`
  - `trigger_keywords`
  - `cross_sell_after`
  - `upsell_from`
  - `price_band`
- Với file text tự do, pipeline cần bước normalize/chunk và map thủ công một lần để ra catalog chuẩn; sau đó dùng catalog chuẩn cho matching lặp lại.
- Dùng dữ liệu orders hiện có để bổ sung “bằng chứng bán thật”:
  - sản phẩm nào đã bán,
  - sản phẩm nào thường gắn với nhóm khách nào,
  - nhóm khách nào có tín hiệu tái ký/upsell.

### 4. Filter khách hàng trước, đào sâu theo nhóm sau
- Tạo bước `segment_customers.py` chia toàn bộ khách thành các nhóm vận hành:
  - `new_high_potential`
  - `demo_followup`
  - `quoted_no_close`
  - `renewal_due`
  - `reactivation`
  - `cross_sell_existing_customer`
  - `upsell_existing_customer`
  - `low_signal_archive`
- Logic nhóm dùng:
  - `relation_name`
  - recency từ `updated_at_1` và `last_interaction_at`
  - `orders` và `customer_lifecycle`
  - revenue / order value
  - source
  - province
  - keyword trong interaction
- Chỉ sau khi nhóm xong mới chạy đào sâu:
  - ưu tiên các nhóm `renewal_due`, `cross_sell_existing_customer`, `upsell_existing_customer`, `demo_followup`.
- AI scope:
  - rule-based cho toàn bộ khách,
  - LLM chỉ dùng cho shortlist của từng nhóm để sinh insight sâu hơn và next-best-action rõ hơn.

### 5. Sinh recommendation và action plan
- Tạo job `generate_recommendations.py`:
  - match `customer_features` với `product_catalog`,
  - sử dụng cả tín hiệu hiện tại lẫn lịch sử mua hàng,
  - output top `1-3` đề xuất/sản phẩm cho từng khách.
- Tạo bảng `customer_recommendations`:
  - `id_1`
  - `recommended_product`
  - `recommendation_type` (`new_sale`, `upsell`, `cross_sell`, `renewal`)
  - `match_score`
  - `reason_summary`
  - `evidence_snippets`
- Tạo bảng `action_plan`:
  - `id_1`
  - `customer_segment`
  - `priority_score`
  - `owner`
  - `proposed_product`
  - `action_type`
  - `action_message_outline`
  - `action_reason`
  - `due_bucket`
- Đầu ra mặc định nên là:
  - SQLite tables để dùng lâu dài,
  - CSV export để phân tích và ứng dụng tiếp.

## Test Plan
- Ingest customer/orders chạy lại không làm hỏng schema hiện có.
- Join `customers` + `orders` + `customer_lifecycle` đúng trên `id_1`.
- Sau khi thêm index, các query nhóm/join chính cho Phase 1 giữ ở mức usable local, mục tiêu dưới khoảng `200ms` cho query danh sách ngắn.
- 50 khách mẫu ở 5 nhóm khác nhau phải có:
  - summary quan hệ trước đây,
  - insight ngắn gọn,
  - ít nhất 1 đề xuất sản phẩm hợp lý,
  - action plan có lý do rõ.
- 20 khách đã mua phải cho kết quả `renewal/cross-sell/upsell` hợp lý hơn khách chưa mua.
- Product parser phải đọc được toàn bộ text files; Excel parser nếu thiếu thư viện thì cần fallback rõ ràng hoặc bổ sung dependency trong bước implementation.

## Assumptions
- Output chính của Phase 1 là `SQLite + CSV export`, vì đây là dạng dễ phân tích tiếp và tái dùng nhất.
- Không có UI/UX trong Phase 1.
- Product knowledge sẽ được chuẩn hóa từ folder [jega products](/f:/Antigravity/CRM/jega%20products), trong đó text tự do là nguồn chính, Excel là nguồn bổ sung.
- Giai đoạn đầu ưu tiên “đúng và chạy được” hơn là AI full-batch cho toàn bộ 50k khách.
