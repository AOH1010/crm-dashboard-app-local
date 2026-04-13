# AI Chat Core Roadmap

`V1 Delivered -> V1.5 Local Hardening + Compound Orchestration -> V2.0 Supabase Connector + MCP -> V2.5 Online Ingestion -> V3.0 Controlled Agentic Runtime -> V4.0 Retrieval`

## Summary

Roadmap này khóa theo nguyên tắc:

- `V1` đã hoàn thành ở mức beta dùng được.
- `V1.5` là phase quan trọng nhất hiện tại: hoàn thiện chất lượng chat thực tế trước khi mở rộng hạ tầng.
- Trọng tâm `V1.5` không chỉ là pass testcase cố định, mà là:
  - tăng độ bền khi user đổi wording nhẹ
  - giảm cảm giác "chat bot rule-based", tăng cảm giác trợ lý phân tích thật sự hiểu ý
  - giảm fallback rộng, tốn token
  - đưa compound skill orchestration thành năng lực lõi
  - làm cho widget chat thật gần hành vi của Chat Lab hơn
- `V2.0` không được hiểu là "đã kết nối Supabase là xong". Kết nối chỉ là điều kiện cần của data plane, không thay thế cho bài toán routing/skill/follow-up.
- `V2.0` chỉ được mở rộng sâu sau khi `V1.5` đạt gate chat quality rõ ràng trên chính môi trường Supabase.
- `V2.5` mới làm backend online trigger scrape -> upsert Supabase, sau khi `SupabaseConnector` đã đạt parity với SQLite.
- `RAG` và `vector search` không phải ưu tiên gần.

---

## 0. Checkpoint 2026-04-13

### Đóng gói hôm nay

- `SupabaseConnector` đã kết nối và chạy được; môi trường hiện tại có thể test trực tiếp với `CRM_DATA_CONNECTOR="supabase"`.
- Runtime V3 nền đã có:
  - `semantic-frame-v3`
  - `route-policy-v3`
  - `skill-capabilities-v3`
  - `skill-output-validator-v3`
- Family `seller_activity` đã được migrate sâu đầu tiên:
  - tách rõ `define`
  - `list`
  - `aggregate/team-level`
  - `inactive proxy logic`
- Test nội bộ hiện tại:
  - `npm run test --workspace @crm/ai-chat-module` pass `81/81`
  - `npm run check` pass

### Thực trạng cần nhìn thẳng

- Chat hiện tại vẫn chưa đủ chất lượng để đóng gói sản phẩm.
- Painpoint chính không còn là kết nối DB, mà là:
  - route sai khi prompt hơi khó
  - follow-up sai ngữ cảnh
  - ép skill vô lý
  - nhiều family còn chồng lấn boundary
  - stress test thực tế trên widget vẫn có thể loạn
- Vì vậy, trạng thái dự án hiện tại là:
  - `Supabase data plane đã mở`
  - nhưng `chat intelligence layer chưa đủ chín để productionize`

### Kết luận điều hành

- Không ưu tiên mở rộng thêm hạ tầng trước.
- Không coi việc có Supabase/MCP là lời giải cho chất lượng chat.
- Ưu tiên số 1 từ bây giờ là:
  - hardening theo `skill family`
  - widget parity thật
  - compound/multi-skill nền tảng

### Thứ tự làm tiếp

1. Hoàn tất migrate các family còn lại theo chuẩn V3:
   - `team_metrics`
   - `operations_metrics`
   - `source_metrics`
   - `order_metrics`
   - `seller_metrics`
2. Stress test lại trên widget với Supabase làm môi trường chính.
3. Chỉ khi các family chính đủ ổn mới mở rộng `compound orchestration` và `orchestrator skill`.
4. Chỉ sau đó mới quay lại mở rộng V2.0 MCP/tooling sâu hơn.

### Điều kiện để được phép sang bước tiếp theo

- User hỏi khó hơn một chút không được "sai loạn lên".
- Widget path không được lệch đáng kể so với Chat Lab.
- Family chính không còn nuốt prompt của nhau trên các case phổ biến.
- Follow-up phải ổn ở các chuỗi hội thoại thực tế, không chỉ testcase đơn.

### Chat Lab packaging hom nay

- Chat Lab khong con chi la man single-turn review. Hien tai no da co mot lane session QA rieng trong tab `Conversation`.
- Session QA hien co cac entry point ro rang:
  - replay testcase tung turn
  - seed transcript goc roi hoi tiep
  - auto-generate stress turns theo mode
- Review session hien duoc ghi theo turn, khong chi theo ket qua cuoi:
  - `ok`
  - `drift`
  - `fail`
- Chat Lab da export duoc 2 loai artifact cho handoff:
  - CSV review artifact
  - JSON session artifact co full trace + turn review + scenario draft
- Muc dich cua Chat Lab tu thoi diem nay:
  - tim diem bat dau lech trong session 5-10 turn
  - chot turn nao fail that
  - chuyen session fail thanh regression scenario sau khi da co manual review

### Vong lap lam viec dung tu bay gio

1. Dung Chat Lab `Conversation` de replay va stress session tren Supabase.
2. Danh dau turn bat dau lech bang review theo turn.
3. Xuat JSON session artifact de handoff/debug.
4. Sua runtime theo family / carry-over / route-policy, khong sua theo cam tinh cua turn cuoi.
5. Chi sau khi session behavior on dinh hon moi mo rong tiep compound orchestration va MCP surface.

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
- Trạng thái hiện tại không còn là "thiếu testcase", mà là "cần hardening lại kiến trúc chat để chịu được stress test thực tế".
- `V1.5` hiện nên được hiểu là `Chat Quality Hardening on top of Supabase-ready runtime`, không chỉ là "đóng gói gate local".
- Các rủi ro còn lại:
  - live classifier/formatter/fallback vẫn phụ thuộc API key và model runtime
  - một số custom analytical query rộng vẫn phải đi fallback cho đến V2/V3
  - widget parity đã tốt hơn nhưng stress test thực tế vẫn còn lộ ra lỗi route/follow-up mà Chat Lab đơn lẻ chưa bắt hết
  - compound orchestration trong V1.5 chỉ cố ý giới hạn 2 skill, chưa phải planner V3
  - nhiều skill vẫn mới được bọc bởi V3 policy layer, chưa được refactor sâu theo family contract

### AI capability status

- `Function Calling`: đã có trong fallback path
- `Text-to-SQL`: đã có trong fallback path
- `Deterministic Skills`: đã có
- `Skill Formatter`: đã có; critical-path skills ưu tiên deterministic fallback để không mất facts khi formatter yếu
- `Compound Skill Orchestration`: đã có ở mức controlled 2-skill composition, có debug timeline và partial-success policy
- `Skill Family Model`: đã có nền capability-based routing toàn cục, nhưng mới chỉ migrate sâu một số family đầu tiên; chưa đạt mức family contract đồng đều trên toàn catalog
- `Conversation Memory`: đã có controlled carry-over state cho V1.5; chưa phải agentic long-term memory
- `Agentic Workflow`: chưa ở mức planner/orchestrator hoàn chỉnh, để sang V3.0
- `DataConnector seam`: đã có repo-local contract; `SQLiteConnector` là implementation stable và `SupabaseConnector` đã có schema contract + seeded parity + pooled read-only runtime path trên local
- `Supabase + MCP`: đã mở được phần connector/parity cơ bản; chưa được xem là phase hoàn tất vì business reasoning layer vẫn là painpoint lớn hơn
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

- Hoàn thiện chất lượng chat thực tế trước khi mở rộng thêm hạ tầng.
- Dùng `Supabase` làm môi trường test chính để hardening đúng painpoint thật, không quay về tối ưu ảo trên local SQLite.
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
- mỗi sub-ask phải reuse chính runtime skill hiện có, không đi đường tắt riêng
- debug timeline phải cho thấy:
  - detected sub-asks
  - selected skills
  - fallback reason nếu có

Chuẩn decomposition cần dùng từ nay:
- trước tiên detect `compound ask` thay vì cố ép cả câu vào 1 skill
- mỗi sub-ask phải có shape riêng:
  - `family`
  - `primary_intent`
  - `action`
  - `subject`
  - `metric`
  - `entity`
  - `time_window`
  - `output_shape`
- shared context như entity/time chỉ được carry sang sub-ask khác khi có bằng chứng rõ trong câu hỏi
- nếu decomposition không đủ rõ thì chuyển `clarify_required`, không được bịa sub-plan

Nguyên tắc dùng LLM trong compound orchestration:
- LLM chỉ nên dùng để:
  - nhận diện câu hỏi nhiều phần
  - hỗ trợ decomposition khi rule-based không đủ
  - hợp nhất câu trả lời cuối
- LLM không được tự thay deterministic business skill khi sub-ask đã có skill phù hợp
- nếu một sub-ask không có deterministic path thì mới cho đi `llm_fallback` ở mức subtask, không kéo hỏng toàn bộ câu trả lời

Nguyên tắc merge kết quả:
- merge chỉ dùng grounded outputs từ từng sub-skill
- formatter/merger không được tự thêm số liệu mới
- final answer phải nói rõ:
  - phần nào đã xử lý được
  - phần nào chưa xử lý được
  - phần nào cần user làm rõ thêm
- nếu hai sub-kết quả mâu thuẫn, runtime phải ưu tiên:
  - trả mâu thuẫn một cách trung thực
  - hoặc yêu cầu làm rõ / route validation
  - không được tự chọn một kết quả im lặng

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

Chuẩn hóa skill từ nay phải theo cùng một contract:
- mỗi skill mới phải khai báo rõ:
  - `family`
  - `supportedSemanticIntents`
  - `supportedActions`
  - `supportedMetrics`
  - `supportedEntityTypes`
  - `supportedSubjects`
  - `supportedStates`
  - `supportedOutputShapes`
  - `supportedTimeTypes`
  - `requiredSlots`
  - `defaultableSlots`
  - `certifiedBackends`
- mỗi skill `run()` phải trả về tối thiểu:
  - `reply`
  - `fallback_reply`
  - `format_hint`
  - `summary_facts`
  - `data`
  - `sqlLogs`
  - `usage`
- với các family quan trọng, skill contract phải dần tách rõ theo:
  - `define`
  - `list`
  - `lookup`
  - `rank`
  - `compare`
  - `aggregate/summarize`
- không tiếp tục thêm skill "ôm nhiều ý" nếu có thể tách thành boundary rõ hơn trong cùng family

Thứ tự migrate family nên bám theo:
- `team_metrics`
- `operations_metrics`
- `source_metrics`
- `order_metrics`
- `seller_metrics`

Lý do phải đi theo family trước khi mở rộng V2/MCP:
- painpoint hiện tại nằm ở business reasoning layer, không nằm chủ yếu ở connector layer
- nếu family boundaries chưa ổn mà mở tool surface rộng hơn, chat sẽ chỉ query sai nhanh hơn chứ không thông minh hơn
- MCP/Supabase tools không thay thế được business definitions, follow-up policy, clarify policy, hay skill boundary của CRM runtime

Mỗi family chỉ được coi là migrate xong khi đạt:
- action semantics rõ
- output-shape semantics rõ
- boundary giữa các skill không chồng chéo quá mức
- có regression cho define/list/aggregate/follow-up collision

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
- Từ 2026-04-13, `SupabaseConnector` đã dùng được và nên được xem là test bed chính cho chat quality hardening.
- Tuy nhiên việc "đã dùng được Supabase" không đồng nghĩa được chuyển trọng tâm sang MCP/tooling sâu hơn khi chat quality còn yếu.

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
- stress test thực tế trên widget không còn tạo cảm giác "chat bot không có AI"
- khi user hỏi khó hơn câu map skill đơn, runtime vẫn giữ được:
  - đúng topic
  - đúng family
  - đúng follow-up context
  - đúng chỗ cần clarify/phản biện

### Metrics cần đo trong kickoff V1.5

Các baseline này phải được đo thật ở đầu phase, không ghi số ước tính như số liệu đã xác nhận:

- deterministic route rate
- fallback call rate
- average token per request
- average token per fallback request
- pass rate trên prompt gốc
- pass rate trên prompt variants
- pass rate của widget path so với Chat Lab path

### V1.5 gate snapshot - 2026-04-13

- AI chat regression suite hiện pass `81/81`.
- `SupabaseConnector` đã dùng được; hardening từ thời điểm này nên ưu tiên test trên Supabase.
- Family `seller_activity` đã đi được một vòng migrate sâu theo V3.
- Các family còn lại chưa được refactor đồng đều, nên đây vẫn là painpoint lớn nhất.
- Trước khi nghĩ đến đóng gói sản phẩm hoặc mở rộng MCP sâu hơn, phần còn lại phải làm theo thứ tự:
  1. `team_metrics`
  2. `operations_metrics`
  3. `source_metrics`
  4. `order_metrics`
  5. `seller_metrics`
  6. widget stress replay trên Supabase
  7. compound/multi-skill planner mở rộng
  8. sau đó mới quay lại V2.0 MCP surface sâu hơn

---

## 4. V2.0 - Supabase Connector + MCP Safe Surface

### Mục tiêu thiết yếu

- Chuyển data plane query của AI chat sang Supabase mà không viết lại runtime.
- Giữ SQLite là local/offline regression path cho Chat Lab.
- Chuẩn hóa tool surface qua MCP theo hướng read-only, debug được, và không expose quyền Supabase rộng cho user chat.
- Không phá contract hiện tại của widget/chat-lab.

Lưu ý chiến lược:
- `V2.0` không được dùng như cái cớ để bỏ qua painpoint của chat.
- Supabase MCP không thay thế CRM business skills.
- MCP chỉ là tool surface / execution surface phía dưới runtime.
- Bộ não vẫn phải là:
  - semantic frame
  - route policy
  - skill families
  - validators
  - clarify/fallback policy

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

Điều kiện để thật sự mở rộng V2.0 sau checkpoint hiện tại:
- chat quality trên Supabase đã vượt ngưỡng chấp nhận được
- các family chính đã được migrate tối thiểu một vòng
- widget stress replay không còn fail hàng loạt vì route/follow-up
- khi đó mới đáng để đầu tư tiếp vào MCP safe surface sâu hơn

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

Thiết kế cần khóa trước khi build:
- không thay deterministic business skills bằng một "agent skill" tổng quát
- dùng một lớp `agent skill` hoặc `orchestrator skill` chỉ để:
  - detect compound ask
  - tạo sub-plan
  - gọi nhiều skill family / skill
  - hợp nhất grounded outputs
  - quyết định `clarify_required` khi thiếu dữ kiện
- business data vẫn phải đi qua deterministic skills hoặc controlled fallback, không cho orchestrator tự sinh số liệu

Chuẩn sub-plan của orchestrator cần có:
- `goal`
- `subtasks[]`
- mỗi `subtask` gồm:
  - `family`
  - `candidate_skill_ids`
  - `intent`
  - `action`
  - `entity bindings`
  - `time_window`
  - `output_shape`
  - `execution_mode`
  - `can_fallback`
- `merge_strategy`
- `partial_success_policy`
- `clarify_policy`

Chính sách phản biện / clarify với người dùng phải rõ:
- nếu câu hỏi gộp nhiều phần nhưng một phần thiếu dữ kiện, hệ thống phải:
  - trả phần chắc chắn đã có
  - nói rõ phần nào đang thiếu
  - hỏi lại đúng chỗ còn thiếu
- nếu user giả định sai dữ liệu, hệ thống phải phản biện bằng facts grounded thay vì chiều theo giả định
- nếu yêu cầu quá rộng hoặc mơ hồ để decomposition an toàn, ưu tiên `clarify_required` hơn là dựng plan đoán mò
- nếu sub-results mâu thuẫn hoặc chất lượng thấp, ưu tiên validation/clarify thay vì merge cưỡng bức

Thứ tự thực hiện V3 đúng nên là:
1. chuẩn hóa family/skill contracts
2. mở rộng compound orchestration từ 2 skill sang planner có sub-plan
3. thêm merger/formatter contract cho multi-skill result
4. thêm regression suite cho compound asks và partial-success/clarify cases
5. chỉ sau đó mới cân nhắc retrieval hoặc agentic workflow sâu hơn

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
# 2026-04-13 Checkpoint

## Runtime / Widget parity updates completed today

- Confirmed Chat Lab and production widget use the same backend runtime at `/api/agent/chat`.
- Confirmed the mismatch was caused by input/context differences, not by two different chat engines.
- Removed hidden widget-side `selected_filters` inference from localStorage cache when the parent view does not pass explicit filters.
- Hardened seller alias detection on both SQLite and Supabase connectors so temporal phrases like `hien tai` no longer false-match seller names such as `Hien`.
- Hardened follow-up logic so standalone analytical asks such as:
  - `lap bang ...`
  - `theo thang`
  - `tu ... den ...`
  - `... den hien tai`
  are re-parsed as fresh asks instead of being patched into the previous seller/topic.
- Added regression coverage for:
  - alias false-positive on `hien tai`
  - prior seller history not hijacking a standalone monthly seller-table ask

## Current phase assessment

- Project status remains `V1.5 local hardening`, not yet ready to claim full production-grade multi-turn robustness.
- V3 semantic/policy foundations are in place:
  - semantic frame
  - route policy
  - skill capability metadata
  - skill output validator
- Family-aware scoring exists, but the runtime still does not have a full `family router -> within-family skill selector` split.

## Immediate next steps

1. Add a widget-parity regression set
- Reproduce real production-style conversations instead of only isolated Chat Lab cases.
- Priority conversation types:
  - seller ask -> standalone analytical ask
  - KPI ask -> source/team drilldown
  - view A while asking domain B
  - overwrite / correction / reset follow-up turns

2. Split routing into two explicit layers
- `family router`
- `within-family skill selector`

3. Freeze the future skill creation contract
- Any new skill must declare:
  - family
  - supported semantic intents
  - supported metrics/entities/time types
  - required slots
  - certified backends
- Runtime/LLM should never "guess" the family at execution time.

4. Continue fallback hardening for `custom_analytical_query`
- Many broader business asks still end up in fallback.
- Before deeper agentic or retrieval work, the next practical path is:
  - widget parity
  - family router
  - family-specific skill selection

## Validation snapshot

- `npm run test --workspace @crm/ai-chat-module` passed with `76/76`
- `npm run check` passed
