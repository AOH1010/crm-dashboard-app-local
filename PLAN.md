# AI Chat Core Roadmap

`V1 Delivered -> V1.5 Local Hardening + Compound Orchestration -> V2.0 Supabase Connector + MCP -> V2.5 Online Ingestion -> V3.0 Controlled Agentic Runtime -> V4.0 Retrieval`

## Summary

Roadmap này khóa theo nguyên tắc:

- `V1` đã hoàn thành ở mức beta dùng được.
- `V1.5` là phase quan trọng nhất hiện tại: hoàn thiện chất lượng local trước khi đưa lên `Supabase + MCP`.
- Trọng tâm `V1.5` không chỉ là pass testcase cố định, mà là:
  - tăng độ bền khi user đổi wording nhẹ
  - giảm fallback rộng, tốn token
  - đưa compound skill orchestration thành năng lực lõi
  - làm cho widget chat thật gần hành vi của Chat Lab hơn
- `V2.0` chỉ bắt đầu sau khi `V1.5` đạt gate local rõ ràng.
- `V2.5` mới làm backend online trigger scrape -> upsert Supabase, sau khi `SupabaseConnector` đã đạt parity với SQLite.
- `RAG` và `vector search` không phải ưu tiên gần.

---

## 1. Current Status

### Runtime hiện có

- Production widget và `/api/agent/chat` vẫn là compatibility surface.
- Runtime hiện tại đã có:
  - `PromptRegistry`
  - `IntentClassifier`
  - `SkillRegistry`
  - `SQLiteConnector`
  - route `skill | clarify_required | llm_fallback | validation`
  - `SkillResponseFormatter`
  - compound deterministic orchestration ở mức hẹp
  - debug timeline / telemetry
  - Chat Lab test harness
  - CSV export artifact
- `view_id` hiện là soft context, không phải hard boundary.

### Trạng thái hardening thực tế

- `A-C` đã ổn định trên prompt gốc và nhiều prompt variants trọng yếu.
- `D-G` đã được hardening theo review thực tế: customer ranking, recent orders, lead geography, source drill-down, filtered orders, forecast, shorthand/slang, rhetorical ask và output tiếng Việt có dấu.
- `H` đã được hardening nhiều vòng cho follow-up carry-over: đổi seller, đổi tháng, nhảy năm, drill-down cùng topic, correction turn và off-topic reset.
- `I` đã được nâng từ case dễ thành grounding/cross-verification thực tế hơn: seller ranking verification, zero-result under stale history, và total revenue reconciliation với orders.
- `J` đã có baseline broad/multi-domain checks để tránh deterministic routing quá tay.
- Chat Lab đã có batch, manual review, CSV artifact và conversation/stress replay; `Evaluate_test` / Automated Eval Ops đã bị loại bỏ vì không tạo đủ giá trị review.
- Trạng thái sau ngày test đủ toàn bộ testcase: `V1.5` đang ở giai đoạn đóng gói gate local, không còn là giai đoạn mở rộng testcase hàng loạt.
- Các rủi ro còn lại:
  - live classifier/formatter/fallback vẫn phụ thuộc API key và model runtime
  - một số custom analytical query rộng vẫn phải đi fallback cho đến V2/V3
  - widget parity đã tốt hơn nhưng vẫn phụ thuộc việc mỗi view truyền/cached `selected_filters` đúng cấu trúc
  - compound orchestration trong V1.5 chỉ cố ý giới hạn 2 skill, chưa phải planner V3

### AI capability status

- `Function Calling`: đã có trong fallback path
- `Text-to-SQL`: đã có trong fallback path
- `Deterministic Skills`: đã có
- `Skill Formatter`: đã có; critical-path skills ưu tiên deterministic fallback để không mất facts khi formatter yếu
- `Compound Skill Orchestration`: đã có ở mức controlled 2-skill composition, có debug timeline và partial-success policy
- `Conversation Memory`: đã có controlled carry-over state cho V1.5; chưa phải agentic long-term memory
- `Agentic Workflow`: chưa ở mức planner/orchestrator hoàn chỉnh, để sang V3.0
- `DataConnector seam`: đã có repo-local contract; `SQLiteConnector` là implementation stable và `SupabaseConnector` đã có schema contract + seeded parity + pooled read-only runtime path trên local
- `Supabase + MCP`: đang ở V2.0 implementation; Supabase local smoke/parity/runtime smoke đã có, full MCP runtime surface chưa xong
- `RAG`: chưa có
- `Vector Search`: chưa có

---

## 2. V1 - Round 1 Core Delivered

### Mục tiêu thiết yếu

- Có lõi AI chat mới chạy được trên local/beta.
- Chuyển runtime từ `regex-first` sang `intent-first`.
- Có deterministic path cho nhóm business ask phổ biến.
- Có fallback an toàn khi chưa có skill.
- Có harness eval/review để hardening có phương pháp.

### Đã làm được

- Giữ nguyên contract `/api/agent/chat`.
- Tách prompt ra file ngoài.
- Có classifier + clarify route + fallback route.
- Có deterministic skills cho các nhóm câu hỏi chính.
- Có formatter cho skill path.
- Có Chat Lab để chạy single/batch testcase.
- Có manual review và CSV export để review batch.
- Có continuity/know-how để handoff.
- Có regression suite đủ để tiếp tục hardening có kiểm soát.

### Đóng gói V1

`V1` được coi là đóng gói xong khi xem như một beta package nội bộ gồm:

- `API stable`
- `Runtime stable`
- `Prompt + skill architecture stable`
- `Chat Lab` là harness kiểm thử chính thức
- `docs/continuity.md` là shared memory chính thức
- `docs/eval/chat-lab-know-how.md` là knowledge triage chính thức
- backlog chưa xong được chuyển sang `V1.5`, không trộn ngược lại vào `V1`

---

## 3. V1.5 - Local Hardening + Compound Skill Orchestration

### Mục tiêu thiết yếu

- Hoàn thiện chất lượng local trước khi đưa lên `Supabase + MCP`.
- Tăng robustness với prompt variation, không chỉ tối ưu cho testcase cố định.
- Giảm fallback rộng, tốn token.
- Nâng compound skill orchestration thành workstream chính.
- Làm cho production widget gần parity hơn với Chat Lab về context và hành vi runtime.

### Workstream A - Robustness under prompt variation

Mục tiêu:
- cùng một ý hỏi, đổi wording nhẹ vẫn route đúng, giữ đúng trọng tâm, không trả lời lệch hoàn toàn

Cần làm:
- với mỗi testcase trọng yếu, thêm prompt variants:
  - paraphrase variant
  - shorthand variant
  - explicit vs implicit variant
  - entity/time slot perturbation
  - cross-view wording variant nếu phù hợp
- ưu tiên hardening theo intent family, không fix từng câu đơn lẻ
- với mỗi fail pattern đã xác minh, thêm regression đúng lớp lỗi:
  - route
  - intent
  - entity resolution
  - SQL/data
  - formatter/reply quality

Gate:
- các case trọng yếu của `A-D` không chỉ pass ở prompt gốc mà còn pass ở prompt variants tối thiểu

Status 2026-04-12:
- Đã có prompt-variant regressions cho shorthand, paraphrase, cross-view, long prompt, correction ask và noisy business wording.
- Không mở rộng thêm testcase hàng loạt trong V1.5 nếu chưa có manual fail mới; ưu tiên khóa regression cho các fail pattern đã xác minh.

### Workstream B - Compound skill orchestration

Mục tiêu:
- câu hỏi nhiều phần nhưng rõ ràng phải được giải bằng deterministic composition trước khi fallback

Phạm vi:
- orchestration vẫn là controlled runtime behavior, không phải agent tự trị
- cho phép tách 2 sub-asks rõ ràng trong `V1.5`
- mỗi sub-ask ưu tiên deterministic skill trước
- chỉ fallback nếu:
  - không có skill phù hợp
  - sub-ask cần analytics mở vượt quá schema có sẵn
  - composition không thể hợp nhất an toàn

Policy cần khóa trong `V1.5`:
- chỉ compose khi hai sub-asks đủ rõ
- tối đa 2 skill trong phase này
- partial success phải trả phần đã chắc chắn và nói rõ phần chưa xử lý
- compound answer phải có formatter/answer-style thống nhất
- debug timeline phải cho thấy:
  - detected sub-asks
  - selected skills
  - fallback reason nếu có

Gate:
- các case multi-intent trọng yếu không còn rơi vào fallback rộng khi đã có deterministic path phù hợp

Status 2026-04-12:
- Đã có controlled compound orchestration tối đa 2 skill, deterministic-first, có timeline `compound_skill_plan / execute / formatter / result`.
- Broad executive asks vẫn bị chặn khỏi compound nếu scope quá rộng; phần đó để V3 planner xử lý sau design doc.

### Workstream C - Skill hardening and migration

Mục tiêu:
- các skill quan trọng không còn trả lời cụt, thừa, hoặc phụ thuộc reply shaping cũ quá nhiều

Ưu tiên:
- migrate tiếp các skill critical-path sang structured facts + formatter
- không ép `9/9` chỉ vì checklist; ưu tiên skill nào ảnh hưởng trực tiếp đến:
  - `A-D`
  - `F`
  - `H`
  - `I`

Nguyên tắc:
- ask hẹp thì trả lời hẹp
- output luôn tiếng Việt có dấu
- deterministic facts phải được bảo toàn khi formatter fail
- formatter không được làm mất trọng tâm business ask

Gate:
- toàn bộ skill critical-path của `V1.5` có deterministic fallback rõ ràng
- manual review không còn fail hàng loạt vì reply quality ở các skill chính

Status 2026-04-12:
- Critical-path skills hiện ưu tiên deterministic reply/fallback để bảo toàn facts khi formatter/model yếu.
- Đã hardening thêm seller revenue, top sellers, KPI overview, team performance, operations, renew, conversion/source, lead geography, recent orders, filtered orders, customer ranking, inactive sellers, trend analysis và revenue forecast.
- Runtime copy còn lại phải giữ tiếng Việt có dấu; mọi fail mới vì ASCII-only reply cần được fix ở deterministic template trước.

### Workstream D - Production widget parity with Chat Lab

Mục tiêu:
- kết quả chat thật không lệch lớn so với Chat Lab chỉ vì khác context plumbing

Cần làm:
- rà soát parity giữa widget và Chat Lab cho:
  - `view_id`
  - `selected_filters`
  - `session_id`
  - history messages
  - debug metadata khi cần soi
- xác định rõ limitation nào chưa wire được thì phải document
- không chấp nhận trạng thái Chat Lab pass nhưng widget fail chỉ vì thiếu context quan trọng

Gate:
- các testcase đại diện khi replay trên widget path phải cho route và behavior tương đương Chat Lab

Status 2026-04-12:
- Widget đã gửi `session_id` ổn định và truyền `selected_filters` khi có; Chat Lab Conversation tab đã hỗ trợ replay/stress cùng session.
- Parity gate còn phụ thuộc mỗi view cập nhật cache/filter payload đúng cấu trúc; chưa coi đây là lý do để đưa lên cloud nếu widget thực tế vẫn fail khác Chat Lab.

### Workstream E - Connector freeze before cloud

Mục tiêu:
- chuẩn hóa seam để sang `Supabase` mà không phải viết lại runtime

Cần làm:
- tách contract `DataConnector`
- để `SQLiteConnector` implement contract này
- giữ canonical schema / safety / row limit / read-only policy ở lớp connector
- không trộn phần này với deploy cloud trong `V1.5`

Gate:
- runtime không phụ thuộc trực tiếp vào chi tiết riêng của SQLite ngoài connector contract

Status 2026-04-12:
- Đã có `DataConnector` contract và `createDefaultConnector()` seam, `SQLiteConnector` là implementation active.
- Contract đã bao phủ các method runtime/skill đang dùng, gồm schema summary, read-only query, latest periods, seller detection và operations month.
- Không triển khai `SupabaseConnector` trong V1.5; đó là scope V2.0.

### V1.5 gate hoàn thành

`V1.5` chỉ được coi là xong khi đồng thời đạt các điều kiện:

- `A-C` ổn định trên prompt gốc và prompt variants trọng yếu
- `D` đạt robustness đủ dùng cho chat thực tế, không chỉ pass prompt gốc
- `E` critical guardrails pass
- `F` cross-view behavior ổn định
- `G` natural language/style ổn định
- `H` follow-up carry-over ổn định
- `I` grounding/cross-verification ổn định
- compound skill orchestration xử lý ổn các case 2 ý rõ ràng
- widget production có parity chấp nhận được với Chat Lab
- `DataConnector` đã được chuẩn hóa
- fallback rate giảm rõ ở prompt phổ biến
- cost/token trên các case multi-domain không còn bị đội lên vô lý

### Metrics cần đo trong kickoff V1.5

Các baseline này phải được đo thật ở đầu phase, không ghi số ước tính như số liệu đã xác nhận:

- deterministic route rate
- fallback call rate
- average token per request
- average token per fallback request
- pass rate trên prompt gốc
- pass rate trên prompt variants
- pass rate của widget path so với Chat Lab path

### V1.5 local gate snapshot - 2026-04-12

- Toàn bộ testcase A-J đã được test thủ công trong Chat Lab trong ngày 2026-04-12.
- Regression suite AI chat hiện pass `70/70` bằng `npm run test --workspace @crm/ai-chat-module`.
- Các round hardening đã hoàn thành trong local:
  - `D/E`: deterministic coverage cho customer ranking, recent orders, lead geography, source drill-down, filtered orders, inactive sellers và forecast.
  - `F/G`: cross-view soft context, shorthand/slang/English-mixed prompts, rhetorical ask, correction ask và output tiếng Việt có dấu.
  - `H`: controlled conversation carry-over, same-topic drill-down, entity/time patch, off-topic reset và Chat Lab Conversation stress mode.
  - `I`: seller verification follow-up, zero-result under stale history và total revenue reconciliation với orders.
  - `J`: guard để broad multi-domain asks không bị deterministic skill/compound route quá tay.
- V1.5 còn lại trước khi chuyển V2.0 là đóng gói gate local:
  - replay một số case đại diện trực tiếp trên widget production path
  - cập nhật docs/handoff nếu có manual fail mới
  - không mở thêm review automation trong V1.5 trừ khi có design mới đáng tin hơn

---

## 4. V2.0 - Supabase Connector + MCP Safe Surface

### Mục tiêu thiết yếu

- Chuyển data plane query của AI chat sang Supabase mà không viết lại runtime.
- Giữ SQLite là local/offline regression path cho Chat Lab.
- Chuẩn hóa tool surface qua MCP theo hướng read-only, debug được, và không expose quyền Supabase rộng cho user chat.
- Không phá contract hiện tại của widget/chat-lab.

### Phạm vi

- giữ `DataConnector` là seam chính
- thêm `SupabaseConnector`
- thêm connector selection bằng env, ví dụ `CRM_DATA_CONNECTOR=sqlite|supabase`
- thêm Supabase schema/view contract bám theo `schema-registry.json`
- thêm SQL dialect audit trước khi sửa query parity:
  - placeholder `?` vs `$1`
  - `SUBSTR` / date handling
  - case sensitivity
  - row limit / timeout
- thêm parity suite giữa SQLite local và Supabase
- thêm latency benchmark SQLite vs Supabase theo route single-skill, compound, fallback
- MCP có 2 lane:
  - Supabase hosted MCP dùng cho developer/admin với `project_ref`, `read_only=true`, feature groups tối thiểu
  - CRM MCP server riêng trong repo cho runtime/business tools hẹp
- CRM MCP tool surface tối thiểu:
  - `query_crm_data`
  - `run_deterministic_skill`
  - `get_schema_summary`
- vẫn giữ SQLite local cho Chat Lab và regression offline

### Không làm trong V2.0

- RAG
- vector search
- autonomous multi-agent
- broad planner khó kiểm soát
- backend online scrape/upsert automation; phần này chuyển sang `V2.5`

### Gate hoàn thành

- same testcase, same route/facts, SQLite và Supabase cho kết quả tương đương trong ngưỡng chấp nhận được
- MCP calls read-only, có timeout, có debug, có error handling rõ
- production widget dùng được core deploy mới mà không cần đổi contract lớn
- có benchmark latency SQLite vs Supabase và chiến lược xử lý nếu Supabase chậm đáng kể
- có rollback bằng env về SQLite nếu Supabase parity hoặc latency fail

---

## 5. V2.5 - Online Backend Ingestion to Supabase

### Mục tiêu thiết yếu

- Đưa ingestion pipeline lên backend online sau khi `SupabaseConnector` đã đạt parity.
- Trigger scrape/sync online và upsert vào Supabase một cách idempotent.
- Không để AI runtime hoặc MCP runtime có quyền ghi production data.

### Phạm vi

- backend online trigger manual/cron cho scrape customers, orders, staffs, operations
- staging -> validate -> canonical upsert vào Supabase
- rebuild dashboard/operations marts trên Supabase
- `sync_state`, row counts, latest data markers, log tail, last success/error
- smoke parity sau sync:
  - row counts
  - latest order date
  - latest operations month
  - một số deterministic skill facts trọng yếu

### Không làm trong V2.5

- không cho user-facing chat gọi write tool
- không dùng Supabase hosted MCP làm ingestion runtime
- không làm RAG/vector/full V3 planner

### Gate hoàn thành

- scrape/upsert chạy lại không nhân đôi dữ liệu
- sync fail không làm active snapshot bị hỏng
- AI connector vẫn đọc bằng role read-only
- sau mỗi sync có smoke parity report đủ để biết data plane còn dùng được

---

## 6. V3.0 - Controlled Agentic Runtime

### Mục tiêu thiết yếu

- nâng từ compound orchestration hẹp sang planner/orchestrator có kiểm soát
- xử lý tốt hơn các prompt nhiều phần, nhiều domain
- tiếp tục giữ triết lý deterministic-first

### Phạm vi

- planner hẹp cho multi-intent
- decomposition 2-3 sub-asks
- deterministic-first execution
- formatter chung để hợp nhất câu trả lời
- retry/fallback policy rõ ràng
- debug chain hiển thị sub-plan và execution path

### Không làm

- autonomous agent mở
- multi-agent production orchestration
- self-reflection loop khó kiểm soát

### Prerequisite

- `V3` cần design doc riêng trước khi implement
- design doc phải trả lời:
  - planner là rule-based hay LLM-backed
  - shape của sub-plan
  - parallel hay sequential execution
  - partial success policy
  - timeout/token budget policy

---

## 7. V4.0 - Retrieval / Vector Khi Có Use Case Thật

### Mục tiêu thiết yếu

- chỉ thêm retrieval khi có bài toán ngoài dữ liệu bảng thật sự cần
- không thêm vector search chỉ vì “stack AI nên có”

### Điều kiện bắt đầu

- có document corpus rõ ràng
- có use case retrieval cụ thể
- có grounding/citation policy
- có bằng chứng deterministic skills + structured query không đủ

### Phạm vi

- embedding pipeline
- retrieval layer
- context assembly policy
- tách rõ structured data path và knowledge retrieval path

---

## 8. Lộ Trình Test V1.5: Groups E-I

### Group E - Guardrail / Validation / Safe Failure

Mục tiêu:
- không hallucinate
- không bị prompt injection dẫn hướng
- input xấu bị chặn đúng
- refusal / not-found copy tự nhiên, ngắn, tiếng Việt có dấu

Case trọng yếu:
- `tc26`
- `tc27`
- `tc28`
- `tc29`
- `tc30`

Bước test trọng yếu:
1. kiểm tra route đúng
2. kiểm tra intent không lệch vì prompt độc
3. kiểm tra không bịa dữ liệu
4. kiểm tra wording của refusal / not-found
5. thêm prompt variants cho case guardrail
6. thêm regression cho từng fail pattern đã fix

### Group F - Cross-View / Soft Context

Mục tiêu:
- view chỉ là hint
- explicit ask thắng context của trang
- overview mơ hồ vẫn dùng view đúng cách

Case trọng yếu:
- `tc31`
- `tc32`
- `tc33`
- `tc34`

Bước test trọng yếu:
1. kiểm tra route/skill đúng
2. kiểm tra reply bám explicit ask
3. kiểm tra không dump dữ liệu của view hiện tại nếu user hỏi domain khác
4. replay trên widget path, không chỉ Chat Lab
5. thêm prompt variants cho cross-view asks

### Group G - Natural Language / Variants / Style

Mục tiêu:
- hiểu viết tắt, rhetorical ask, imperative ask
- output luôn tiếng Việt có dấu
- correction case phải grounded

Case trọng yếu:
- `tc35`
- `tc36`
- `tc37`
- `tc38`
- `tc39`

Bước test trọng yếu:
1. kiểm tra intent trên prompt đời thường
2. kiểm tra language output
3. kiểm tra correction logic khi user đưa số sai
4. thêm variants slang / shorthand / English-mixed
5. thêm regression cho diacritics, slang parsing, correction behavior

### Group H - Follow-up / Multi-turn Carry-over

Mục tiêu:
- carry-over đúng entity, đúng time, đúng topic
- off-topic phải reset đúng lúc

Case trọng yếu:
- `tc40`
- `tc41`
- `tc42`
- `tc43`

Bước test trọng yếu:
1. chạy nguyên conversation
2. kiểm tra entity/time resolution từ history
3. kiểm tra skill layer có dùng context carry-over thật hay không
4. thêm regression cho change seller, change month, drill-down, off-topic reset
5. thêm conversation variants chứ không chỉ sửa turn cuối

Lưu ý:
- đây là group khó nhất của `V1.5`
- cần ưu tiên sửa inference depth và carry-over policy trước khi kỳ vọng pass ổn định

### Group I - Grounding / Cross Verification

Mục tiêu:
- số liệu nhất quán giữa các source
- zero-result không bị bịa
- aggregation/cross-db đúng

Case trọng yếu:
- `tc44`
- `tc45`
- `tc46`

Bước test trọng yếu:
1. kiểm tra route/skill đúng
2. đối chiếu `sql_logs` với source data
3. review final reply có phản ánh đúng facts hay không
4. thêm regression cho cross-db grounding và zero-result copy
5. thêm variants về wording nhưng giữ nguyên business ask

---

## 9. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Model API key không có hoặc không ổn định làm classifier/formatter/fallback suy giảm | High | Medium | duy trì legacy path, đo classifier usage rate, không đánh giá chất lượng chỉ trên môi trường thiếu key |
| Chat Lab pass nhưng widget production fail vì context plumbing khác nhau | High | High | đưa widget parity vào scope `V1.5`, replay testcase qua widget path |
| Chỉ tối ưu prompt gốc của testcase, không chịu được biến thể thực tế | High | High | bắt buộc thêm prompt variants cho case trọng yếu |
| Compound orchestration bị mở quá nhanh, khó debug | Medium | Medium | giữ scope `V1.5` ở tối đa 2 skill, deterministic-first, debug timeline rõ |
| Legacy rules khó maintain khi intent tăng | Medium | High | ưu tiên classifier + skill coverage, hạn chế mở rộng regex thiếu kiểm soát |
| Supabase latency cao hơn local SQLite rõ rệt | Medium | Medium | parity benchmark và cache strategy ở `V2.0` |
| Trộn Supabase connector và online ingestion vào cùng một phase làm khó debug | High | Medium | tách `V2.0` connector/parity và `V2.5` ingestion/upsert |
| Supabase hosted MCP có tool surface rộng, không phù hợp cho user-facing runtime | High | Medium | chỉ dùng Supabase MCP cho developer/admin; runtime dùng CRM MCP server riêng read-only |
| Token cost tăng khi tăng formatter/orchestration | Medium | Medium | đo token theo route, ưu tiên deterministic path |
| selected_filters ở widget chưa wire đủ | Medium | High | đưa vào scope `V1.5` hoặc document limitation rõ ràng |

---

## 10. Assumptions

- Trọng tâm gần nhất là `V1.5`, không đưa hệ thống lên `Supabase + MCP` trước khi local hardening đủ tốt.
- `V1.5` phải tối ưu cho chat thực tế, không chỉ cho benchmark cố định.
- Compound skill orchestration là trọng tâm chính của `V1.5`, không phải phần phụ.
- `V2.0` là phase Supabase connector/parity + MCP safe surface, bắt đầu sau gate `V1.5`.
- `V2.5` là phase backend online ingestion: trigger scrape -> upsert Supabase, bắt đầu sau gate `V2.0`.
- `V3.0` là controlled agentic orchestration, không phải autonomous agent platform.
- `V4.0` chỉ bắt đầu khi có use case retrieval thật sự.
