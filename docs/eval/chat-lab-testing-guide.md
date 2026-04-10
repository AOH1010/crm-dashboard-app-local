# Chat Lab Testing Guide

## Muc dich

Tai lieu nay la nguon su that cho agent khac khi lam viec voi he thong test AI chat trong repo nay.

Chat Lab khong phai widget production. Day la man hinh kiem thu noi bo de:
- chay tung testcase hoac chay batch
- xem classifier, router, skill, SQL log, formatter
- cham auto-score o muc route/intent/clarify
- ghi nhan manual review cho nhung case can nguoi xac nhan
- export ket qua ra CSV de tiep tuc phan tich

## Duong dan lien quan

- Frontend Chat Lab view: [apps/frontend/src/views/ChatLabView.tsx](/d:/CRM/crm-dashboard-app-local/apps/frontend/src/views/ChatLabView.tsx)
- Frontend scenario type va fallback scenarios: [apps/frontend/src/lib/chatLabScenarios.ts](/d:/CRM/crm-dashboard-app-local/apps/frontend/src/lib/chatLabScenarios.ts)
- Backend endpoint tra scenario: [apps/backend/src/index.js](/d:/CRM/crm-dashboard-app-local/apps/backend/src/index.js)
- Runtime chinh: [modules/ai-chat/src/runtime/chat-runtime.js](/d:/CRM/crm-dashboard-app-local/modules/ai-chat/src/runtime/chat-runtime.js)
- Intent catalog va route threshold: [modules/ai-chat/src/runtime/intent-catalog.js](/d:/CRM/crm-dashboard-app-local/modules/ai-chat/src/runtime/intent-catalog.js)
- Skill formatter runtime: [modules/ai-chat/src/runtime/skill-response-formatter.js](/d:/CRM/crm-dashboard-app-local/modules/ai-chat/src/runtime/skill-response-formatter.js)
- Eval dataset cho Chat Lab: [docs/eval/eval-50-chat-lab.json](/d:/CRM/crm-dashboard-app-local/docs/eval/eval-50-chat-lab.json)
- Know-how da duoc xac minh: [docs/eval/chat-lab-know-how.md](/d:/CRM/crm-dashboard-app-local/docs/eval/chat-lab-know-how.md)
- Draft skill de dong goi workflow nay: [skills/chat-lab-review/SKILL.md](/d:/CRM/crm-dashboard-app-local/skills/chat-lab-review/SKILL.md)

## Luong chay cua he thong

Luồng runtime hien tai:

`messages -> buildRequestContext -> Intent Classifier -> Intent Router -> skill | clarify_required | llm_fallback | validation`

Neu vao `skill`:

`skill.run() -> SkillResponseFormatter -> final reply`

Neu classifier loi:

`intent_source = legacy_rules` va runtime roi ve compatibility path.

## Chat Lab dang test cai gi

Chat Lab test theo tang, khong chi nhin moi cau tra loi cuoi:

1. `Route`
   - He thong co di dung nhanh khong.
   - Gia tri hop le: `skill`, `clarify_required`, `llm_fallback`, `validation`.

2. `Intent`
   - Classifier co hieu dung primary intent khong.

3. `Clarify`
   - Neu case mo ho thi he thong co hoi lai khong.

4. `Manual review`
   - Nguoi review co the quyet dinh ket qua cuoi cho moi testcase.
   - Dung cho grounding, hallucination, quality cua reply, do dung cua SQL shape, do day du cua cau tra loi.

## Nguyen tac cham diem

### Auto-score

Auto-score hien tai chi danh gia:
- `routePass`
- `intentPass`
- `clarifyPass`

Day la `dieu kien can`, khong phai `ket luan cuoi` cho moi testcase.

### Manual review

Tat ca testcase deu cho phep `manual review`.

Co 2 loai:
- `manualReview = true`: review tay la bat buoc
- `manualReview = false`: review tay la tuy chon, nhung reviewer van co quyen override ket qua

Trang thai hop le:
- `Cho review tay`
- `Dat sau review`
- `Truot sau review`
- `Dat tu dong`

Quy tac:
- `autoPass = true` va case bat buoc review dang `pending` -> chua ket luan
- `manual review = pass` -> case dat hoan chinh
- `manual review = fail` -> case truot, du route va intent co the dung
- voi case review tuy chon:
  - neu khong review, he thong giu ket qua auto-score
  - neu reviewer danh dau `fail`, ket qua cuoi bi override thanh truot
  - neu reviewer danh dau `pass`, ket qua cuoi duoc xac nhan boi reviewer

## Khi nao phai manual review

Tat ca case deu co the review tay.

Bat buoc review tay neu scenario co `manualReview = true`, thuong la cac nhom:
- grounding ve doanh thu, don hang, tong tien
- kiem tra hallucination
- fallback query phuc tap
- kiem tra cau tra loi co day du y hay khong
- kiem tra reply co dung ngon ngu va dinh dang mong muon hay khong

Vi du:
- `tc01-seller-revenue-basic` la case route de nhung van can review tay vi can dung so, dung order count, va khong duoc hallucinate

## Cau truc scenario

Moi scenario trong [eval-50-chat-lab.json](/d:/CRM/crm-dashboard-app-local/docs/eval/eval-50-chat-lab.json) co cac field chinh:

- `id`: ma testcase, vi du `tc01-seller-revenue-basic`
- `title`: ten hien thi
- `group`: nhom A/B/C...
- `viewId`: context cua UI
- `messages`: lich su hoi dap dua vao runtime
- `selectedFilters`: filters neu can
- `expectedRoute`: route mong doi
- `expectedSkillId`: skill mong doi neu route la skill
- `expectedIntent`: primary intent mong doi
- `expectedClarify`: co ky vong he thong hoi lai hay khong
- `allowedRoutes`: danh sach route chap nhan duoc cho soft-case
- `routeSuite`: `strict` hoac `soft`
- `intentSuite`: `strict` hoac `soft`
- `clarifySuite`: `strict` hoac `none`
- `manualReview`: case co bat buoc nguoi review xac nhan hay khong
- `reviewFocus`: trong tam review tay
- `notes`: ghi chu nghiep vu

## Mapping intent -> skill

Route tu intent sang skill duoc khoa o [intent-catalog.js](/d:/CRM/crm-dashboard-app-local/modules/ai-chat/src/runtime/intent-catalog.js):

- `seller_revenue_month` -> `seller-month-revenue`
- `top_sellers_period` -> `top-sellers-period`
- `kpi_overview` -> `kpi-overview`
- `period_comparison` -> `compare-periods`
- `renew_summary` -> `renew-due-summary`
- `operations_summary` -> `operations-status-summary`
- `conversion_source_summary` -> `conversion-source-summary`
- `team_revenue_summary` -> `team-performance-summary`

Nhung intent chua co deterministic skill trong Round 1 se roi ve `llm_fallback`, vi du:
- `customer_lookup`
- `lead_geography`
- `cohort_summary`
- `custom_analytical_query`
- `unknown`

## Threshold route

Threshold classifier hien tai:
- `confidence >= 0.85` va intent map duoc skill -> `skill`
- `0.50 <= confidence < 0.85` -> `clarify_required`
- `confidence < 0.50` -> `llm_fallback`
- `ambiguity_flag = true` -> uu tien `clarify_required`

Nguon: [intent-catalog.js](/d:/CRM/crm-dashboard-app-local/modules/ai-chat/src/runtime/intent-catalog.js)

## Cach doc Chat Lab

### Tong quan

Panel `Tong quan` cho biet:
- auto-score cua `route`, `intent`, `clarify`
- trang thai final, bao gom ca review bat buoc hoac review tuy chon
- thong tin ky vong va thuc te
- reply hien tai

### Suy luan

Panel `Suy luan` cho biet:
- `intent_source`
- `formatter_source`
- `intent_confidence`
- `fallback_reason`
- `trace_id`
- `clarification_question`
- `matched_skill_candidates`
- `intent JSON`
- `execution_timeline`

### SQL

Panel `SQL` cho biet:
- query nao da chay
- `row_count`
- `row_limit`
- loi SQL neu co

### Batch

Panel `Batch` cho biet:
- tong so case da chay va dang cache
- so case dat hoan chinh
- so case con cho manual review bat buoc

## Cache va export

Chat Lab co luu cache tren trinh duyet cho 3 loai du lieu:
- `currentResult`
- `batchResults`
- `manualReviews`

Y nghia:
- reload tab khong lam mat lich su chay
- export CSV co the lay ca ket qua cu va review tay da ghi
- chi khi bam `Lam moi lab` thi moi xoa het cache

## Manual review workflow

Khi gap case can review tay:

1. Chay testcase.
2. Xem `Tong quan`, `Suy luan`, `SQL`.
3. So doi `reply` va `notes` cua scenario.
4. Chon:
   - `Danh dau pass`
   - `Danh dau fail`
5. Dien `Ly do review tay`.

Yeu cau:
- Ly do phai cu the, khong viet chung chung.
- Neu fail thi chi ro tang loi:
  - router
  - intent
  - skill SQL
  - formatter
  - fallback
  - grounding
  - language/style

Vi du ly do tot:
- `Route dung nhung formatter tra loi bang tieng Anh va thieu tong doanh thu.`
- `SQL dung row nhung reply khong neu so don, khong dat yeu cau grounding.`
- `Intent dung seller_revenue_month nhung skill resolve sai seller nickname.`

## Quy trinh agent nen theo

Khi mot agent khac duoc giao fix testcase:

1. Xac dinh `scenario id`.
2. Xac dinh case do la:
   - case review bat buoc
   - case review tuy chon
3. Doc 4 tang:
   - route
   - intent
   - SQL/data
   - final reply
4. Chi ra tang loi chinh.
5. Sua dung tang loi.
6. Chay lai testcase.
7. Neu case can review tay, agent khong tu ket luan `Dat` thay cho reviewer.

## Quy tac quan trong

- Khong coi `autoPass` la `pass cuoi` voi case `manualReview`.
- Khong sua theo cam tinh chi vi reply nghe "ngu". Phai xac dinh loi o route, intent, skill, hay formatter.
- Neu route va intent dung ma reply do, kha nang cao loi nam o `SkillResponseFormatter`.
- Neu SQL sai hoac row count sai, kha nang cao loi nam o skill handler hoac filter resolution.
- Neu `intent_source = legacy_rules`, danh gia can than hon vi classifier co the da fail va runtime dang o compatibility path.

## Endpoint va nguon du lieu

- Frontend lay full scenario tu:
  - `GET /api/agent/chat-lab/scenarios`
- Backend doc file:
  - [docs/eval/eval-50-chat-lab.json](/d:/CRM/crm-dashboard-app-local/docs/eval/eval-50-chat-lab.json)
- Neu endpoint loi, frontend roi ve:
  - `CHAT_LAB_FALLBACK_SCENARIOS` trong [chatLabScenarios.ts](/d:/CRM/crm-dashboard-app-local/apps/frontend/src/lib/chatLabScenarios.ts)

## Muc tieu cua tai lieu nay

Tai lieu nay duoc viet de agent khac:
- khong cham sai `manual review` thanh `Dat`
- hieu cach route sang skill tu intent
- hieu vi sao mot case nhom A van co the fail o formatter du route dung
- biet cach doc cache, batch, export CSV va review tay theo cung mot chuan

## Cach dung cung voi know-how

Doc tai lieu nay truoc de nam:
- he thong Chat Lab dang van hanh ra sao
- testcase duoc cham nhu the nao
- route, intent, formatter, SQL nam o dau

Sau do doc [chat-lab-know-how.md](/d:/CRM/crm-dashboard-app-local/docs/eval/chat-lab-know-how.md) de ap bo loc triage truoc khi sua code:
- day la tang route hay intent
- day la bug skill SQL hay formatter
- day la bug runtime hay lech label cua dataset

Neu sau nay dong goi thanh skill, file nay la "how the system works", con `chat-lab-know-how.md` la "how to think when triaging failures".
