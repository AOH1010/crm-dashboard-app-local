# V1 Final Plan: Hard Reset AI Chat Core voi Hybrid Prompt + Skills

## Summary

- V1 se viet lai loi `modules/ai-chat`, nhung giu nguyen `/api/agent/chat` va widget chat hien tai de rollout an toan.
- V1 chi chay tren kien truc hien tai: `frontend -> backend -> modules/ai-chat -> SQLite`.
- V1 se tach ro 3 lop:
  - `System Prompt`: file ngoai, de maintain va version
  - `Skills`: metadata/rules o file ngoai, execution logic trong code
  - `Chat Script / Runtime`: dieu phoi skill hoac LLM fallback
- V1 nham toi `limited beta`: on dinh, nhanh, re token, co log du de danh gia.
- V2 se di tiep sang cloud database / MCP / production deployment, nhung V1 phai tao san seam de them cac lop do ma khong phai dap lai.

## Phase 0 - Baseline va Chuan Trien Khai

- Audit runtime hien tai trong `modules/ai-chat`, backend route, va widget chat.
- Freeze contract hien tai:
  - request giu `messages`, `view_id`
  - response giu `reply`, `usage`, `sql_logs`, `error`
- Cho phep them field optional cho beta:
  - request: `selected_filters`, `session_id`, `debug`
  - response: `trace_id`, `route`, `skill_id`, `confidence`, `prompt_version`
- Tao `docs/eval/questions.json` voi 30-40 cau hoi that theo domain.
- Chay baseline de do accuracy, token, latency, so vong tool, va ti le fail.

## Phase 1 - Scaffold kien truc moi trong `modules/ai-chat`

- Tao cau truc:
  - `modules/ai-chat/prompts/`
  - `modules/ai-chat/skills/<skill-id>/`
  - `modules/ai-chat/config/`
  - `modules/ai-chat/src/contracts/`
  - `modules/ai-chat/src/runtime/`
  - `modules/ai-chat/src/skills/`
  - `modules/ai-chat/src/connectors/`
  - `modules/ai-chat/src/tooling/`
  - `modules/ai-chat/src/telemetry/`
- Giu runtime cu song song de parity test; khong xoa ngay.
- Tao cac abstraction nen:
  - `PromptRegistry`
  - `SkillRegistry`
  - `SQLiteConnector`
  - `TraceContext`
  - `RouteDecision`

## Phase 2 - Tach System Prompt ra file ngoai

- Chuyen prompt hien tai thanh cac fragment:
  - `prompts/base-system.md`
  - `prompts/tool-policy.md`
  - `prompts/answer-style.md`
  - `prompts/fallback-sql.md`
  - `prompts/views/<view-id>.md`
- Viet `PromptRegistry` de load, compose, cache, version hoa prompt.
- Prompt chinh chi giu:
  - role
  - data-only rule
  - tool usage policy
  - answer style
  - month/year inference policy
  - view hint ngan
- Khong de full schema dump trong prompt chinh; chi dung schema summary ngan hoac helper rieng cho fallback.

## Phase 3 - Thiet ke skill framework hybrid

- Moi skill co folder:
  - `skills/<skill-id>/skill.json`
  - `skills/<skill-id>/prompt.md` hoac `examples.md` neu can
- Moi skill co code handler:
  - `src/skills/<skill-id>.js`
- Contract skill v1:
  - `canHandle(context)`
  - `run(context, connector)`
  - `formatResponse(result)`
- `skill.json` toi thieu gom:
  - `id`
  - `description`
  - `priority`
  - `triggers`
  - `supported_views`
  - `required_entities`
  - `output_mode`
  - `fallback_policy`
- File ngoai chua rules va maintainability metadata.
- Code chua execution logic, SQL builder, validation, formatter.

## Phase 4 - Connector hoa dung de mo duong cho V2

- Tao `SQLiteConnector` la implementation duy nhat cua v1.
- Tao `modules/ai-chat/config/schema-registry.json` chua:
  - domain definitions
  - canonical table names
  - allowed tables
  - source db mapping
  - schema summary source
- Dung `canonical table naming` ngay trong v1:
  - skills khong duoc hardcode `dashboard.` hay `operations.`
  - connector map canonical names sang bang SQLite that
- Moi query fallback va skill query phai di qua connector/tooling, khong query lung tung truc tiep tu runtime.

## Phase 5 - Build bo skills uu tien

- Xay theo thu tu:
  1. `seller_month_revenue`
  2. `top_sellers_period`
  3. `kpi_overview`
  4. `compare_periods`
  5. `renew_due_summary`
  6. `operations_status_summary`
- Mo rong neu beta can:
  7. `conversion_source_summary`
  8. `team_performance_summary`
- Quy tac chon skill:
  - tan suat hoi cao
  - query on dinh
  - du lieu ro
  - giam token ro so voi fallback
- Fast path seller revenue hien tai phai duoc di chuyen thanh skill dau tien.

## Phase 6 - Viet lai chat runtime

- Runtime moi phai tach ro 6 buoc:
  1. normalize messages
  2. build request context
  3. route sang skill hoac fallback
  4. execute
  5. format response
  6. log telemetry
- Route mac dinh:
  - skill truoc
  - fallback sau
  - khong co evaluator/optimizer mac dinh
- Giu generic SQL fallback nhung lam gon hon:
  - schema summary ngan
  - row limit cung
  - safety guardrails giu trong code
  - han che so vong tool neu hop ly

## Phase 7 - Frontend support va telemetry cho limited beta

- Sua toi thieu frontend:
  - gui them `selected_filters` neu co
  - hien thi loi/no-data tot hon
  - support debug info an cho admin
- Log bat buoc:
  - `trace_id`
  - `route`
  - `skill_id`
  - `provider`
  - `model`
  - `latency`
  - `usage`
  - `sql_logs`
  - `error_class`
  - `prompt_version`

## Phase 8 - Test, eval, parity, cutover

- Chay regression suite tu `docs/eval/questions.json`
- Them test cho tung skill: it nhat 3-5 case moi skill
- Them safety tests:
  - read-only only
  - no multi-statement
  - forbidden keyword rejection
  - invalid table rejection
  - row limit enforcement
- Them runtime tests:
  - skill hit dung
  - fallback dung
  - no-data handling
  - timeout/error handling
- Chay parity giua runtime cu va runtime moi
- Chi cutover khi runtime moi dat parity hoac tot hon o cac case trong yeu
- Sau cutover moi xoa code cu

## V1 Scope khoa lai

- Co trong V1:
  - hard reset core noi bo
  - prompt ngoai file
  - hybrid skills
  - runtime moi
  - `SQLiteConnector`
  - canonical table naming
  - schema registry config
  - logging va beta support
- Khong co trong V1:
  - Supabase runtime
  - MCP server
  - vector search
  - evaluator/optimizer mac dinh
  - autonomous actions
  - multi-tenant control plane

## Test Plan

- Regression test toan bo `docs/eval/questions.json`
- Moi skill co 3-5 case rieng
- Safety tests cho SQL:
  - read-only only
  - no multi-statement
  - forbidden keyword rejection
  - invalid table rejection
  - row limit
- Runtime tests:
  - skill hit dung
  - fallback dung
  - no-data handling
  - timeout/error handling
- Beta KPI:
  - accuracy dat nguong chap nhan
  - p95 latency on
  - token cost giam ro o cau hoi pho bien
  - skill hit rate cao hon fallback rate o domain chinh

## Assumptions

- Chap nhan hard reset noi bo chat core, nhung khong xoa baseline truoc khi co parity.
- Prompt de file ngoai la lua chon chuan cho maintainability.
- Skill theo mo hinh hybrid la phu hop nhat cho v1: file ngoai cho metadata, code cho execution.
- SQLite van la nen chay v1, nhung moi abstraction phai chua duong di ro sang Supabase/MCP o v2.
