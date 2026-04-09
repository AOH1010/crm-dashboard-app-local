# AI Chat V1 Architecture

## Muc tieu

Tai lieu nay mo ta buc tranh tong the cua AI chat V1 trong repo hien tai:

- van giu `frontend -> backend -> modules/ai-chat -> SQLite`
- tach ro `system prompt`, `skills`, `chat runtime`, `connector`
- uu tien deterministic skills cho cau hoi pho bien
- chi dung LLM fallback cho cau hoi ngoai catalog hoac prompt dai, nhieu y, kho route an toan

## So do tong the

```text
User Prompt
  |
  v
CrmAgentWidget (frontend)
  |
  v
POST /api/agent/chat
  |
  v
Backend adapter (apps/backend/src/index.js)
  |
  v
chatWithCrmAgent()
  |
  +--> normalizeMessages()
  |
  +--> buildRequestContext()
  |      |
  |      +--> questionAnalysis
  |      |      - latestQuestion
  |      |      - routingQuestion
  |      |      - isLongPrompt
  |      |      - isMultiIntent
  |      |
  |      +--> selectedFilters / viewId / sessionId
  |
  +--> SkillRegistry.findMatch()
  |      |
  |      +--> neu match 1 skill ro rang
  |      |      |
  |      |      v
  |      |   Skill Handler
  |      |      |
  |      |      v
  |      |   SQLiteConnector.runReadQuery()
  |      |      |
  |      |      v
  |      |   SQLite CRM + dashboard + operations
  |      |
  |      +--> neu khong match an toan
  |             |
  |             v
  +----------> PromptRegistry.buildSystemPrompt()
                |
                +--> base-system.md
                +--> tool-policy.md
                +--> answer-style.md
                +--> views/<view>.md
                +--> fallback-sql.md
                +--> schema summary
                |
                v
             Fallback LLM
                |
                v
             query_crm_data tool
                |
                v
             SQLiteConnector.runReadQuery()
                |
                v
             SQLite CRM + dashboard + operations
                |
                v
Telemetry + API Response
```

## Thanh phan chinh

### 1. Frontend

- Widget hien tai gui `messages`, `view_id`, va co the gui them `selected_filters`, `session_id`, `debug`.
- Frontend khong chon skill.
- Frontend khong tu build system prompt.

Vai tro cua frontend chi la:

- lay user prompt
- gui request
- hien reply va debug metadata neu can

### 2. Backend adapter

- Route `/api/agent/chat` trong backend giu contract tuong thich nguoc.
- Backend o V1 la adapter mong:
  - nhan request
  - goi `chatWithCrmAgent`
  - tra response

No khong chua business logic route skill.

### 3. Chat runtime

Runtime la bo dieu phoi trung tam.

No lam 6 buoc:

1. normalize messages
2. build request context
3. phan tich prompt de route
4. uu tien deterministic skill
5. neu khong an toan thi dung LLM fallback
6. build telemetry response

Day la noi quyet dinh:

- cau nao di skill
- cau nao di fallback
- metadata nao duoc log

### 4. System prompt

System prompt hien tai khong con nam trong 1 file JS lon.

No duoc ghep tu:

- `modules/ai-chat/prompts/base-system.md`
- `modules/ai-chat/prompts/tool-policy.md`
- `modules/ai-chat/prompts/answer-style.md`
- `modules/ai-chat/prompts/fallback-sql.md`
- `modules/ai-chat/prompts/views/<view-id>.md`

Vai tro cua system prompt:

- dinh nghia vai tro cua agent
- buoc model phai grounded vao du lieu noi bo
- quy dinh tool policy
- quy dinh answer style
- them view hint
- them schema summary o fallback route

Quan trong:

- neu request di qua deterministic skill thi model khong can quyet dinh skill
- khi do system prompt chu yeu co gia tri versioning va fallback readiness
- system prompt duoc dung manh nhat o `llm_fallback`

### 5. Skills

Skill o V1 khong phai la sub-agent.

Skill la business handler deterministic gom 2 phan:

- metadata ben ngoai:
  - `modules/ai-chat/skills/<skill-id>/skill.json`
- execution logic trong code:
  - `modules/ai-chat/src/skills/<skill-id>.js`

Moi skill thuong co:

- `canHandle(context)`
- `run(context, connector)`
- `formatResponse(result)`

Y nghia:

- `canHandle`: nhin prompt va context de xem co nen nhan case nay hay khong
- `run`: build query va lay du lieu
- `formatResponse`: dong goi cau tra loi cuoi

### 6. SQLiteConnector

Connector la lop rat quan trong trong V1.

No lam 4 viec:

- attach cac DB SQLite hien tai
- map `canonical table names` sang bang that
- validate SQL an toan
- thuc thi read-only query va tra rows

Nho connector, skills va fallback khong can biet truc tiep:

- `dashboard.dashboard_kpis_daily`
- `operations.ops_monthly_metrics`

ma co the query bang ten chuan nhu:

- `kpis_daily`
- `monthly_status`
- `due_accounts`

## Luong route thuc te

## A. Cau hoi don, ro, nam trong skill catalog

Vi du:

`Doanh thu cua Hoang Van Huy thang 4/2026 la bao nhieu?`

Luong chay:

1. Runtime lay `latestQuestion`
2. `questionAnalysis` tao `routingQuestion`
3. `SkillRegistry` duyet skill theo priority
4. `seller-month-revenue.canHandle()` thay:
   - co keyword doanh thu
   - detect duoc seller name
   - co the resolve thang
5. Runtime chay skill nay ngay
6. Skill query `orders`
7. Connector validate SQL, chay query, tra rows
8. Skill format cau tra loi
9. Runtime tra response voi `route=skill`, `skill_id=seller-month-revenue`

LLM khong can tham gia.

## B. Cau hoi ngoai catalog

Vi du:

`Cho toi bang 5 don hang moi nhat co gia tri cao hon 20 trieu va nhom theo khu vuc`

Luong chay:

1. Runtime thu skill
2. Khong co skill nao match an toan
3. Runtime build system prompt tu `PromptRegistry`
4. Runtime goi fallback LLM
5. LLM duoc phep goi `query_crm_data`
6. Tool nay thuc chat di qua `SQLiteConnector.runReadQuery()`
7. Connector chan SQL nguy hiem va gioi han bang
8. LLM nhan rows ve va tong hop cau tra loi
9. Runtime tra response voi `route=llm_fallback`

## C. Prompt dai, nhieu boi canh nhung chi co 1 y chinh

Vi du:

`Toi dang xem dashboard cho buoi hop. Hay dong vai analyst noi bo, doc boi canh view nay, nhung quan trong nhat la cho toi biet doanh thu cua Hoang Van Huy thang 4/2026 la bao nhieu.`

V1 hien tai xu ly theo 2 tang:

1. `normalizeMessages()` giu lai toi da 20 messages gan nhat
2. `analyzeQuestionComplexity()` tao `routingQuestion`

`routingQuestion` la phien ban da rut gon cua prompt dai:

- uu tien doan chua request cue
- uu tien doan chua business keyword
- giu lai phan cuoi quan trong neu prompt rat dai

Sau do skill matcher dung `routingFoldedQuestion` thay vi chi dung toan bo prompt tho.

Ket qua:

- prompt dai nhung chi co 1 y chinh van co the di deterministic skill
- giam kha nang dinh keyword sai do boi canh dai dong

## D. Prompt dai va nhieu y

Vi du:

`Team nao dang dan dau doanh thu va nhom nguon nao co conversion cao nhat?`

V1 khong co gang ep 1 skill nhan ca hai y nay.

Runtime lam nhu sau:

1. `questionAnalysis` danh dau `isMultiIntent=true` neu prompt dai/co nhieu domain
2. `SkillRegistry` thu tim tat ca skills co the match
3. neu co nhieu hon 1 skill hop le, runtime khong chon bua 1 skill
4. route se nghieng sang `llm_fallback`

Ly do:

- tra loi sai 1 nua nguy hiem hon cham hon mot chut
- fallback co kha nang tong hop prompt phuc tap tot hon deterministic skill

## Vi sao he thong "hieu" prompt de boc skill

Co 2 co che hieu khac nhau:

### Co che 1. Hieu bang rule code

Day la deterministic skill routing.

He thong khong "suy nghi nhu nguoi".
No check cac dau hieu ro rang:

- keyword
- entity co detect duoc khong
- view hien tai la gi
- month/date co resolve duoc khong
- prompt co qua nhieu y hay khong

Neu du dieu kien thi skill duoc chon.

Uu diem:

- nhanh
- re token
- de test
- on dinh

### Co che 2. Hieu bang model

Day la fallback route.

Luc nay system prompt + lich su chat + schema summary + tool policy duoc gui vao model.
Model se:

- hieu prompt phuc tap hon
- quyet dinh can query gi
- goi SQL tool
- tong hop cau tra loi

Uu diem:

- linh hoat
- xu ly duoc prompt dai, prompt mo, prompt drill-down

Nhuoc diem:

- ton token hon
- kho predict hon
- can guardrails chat hon

## Query chay nhu the nao

## Skill path

Skill tu build SQL co chu dich.

Vi du `seller-month-revenue`:

- detect seller name tu prompt
- resolve month window
- query `orders`
- loai don huy
- tinh tong doanh thu, so don, binh quan/don

Vi du `conversion-source-summary`:

- group raw source thanh business source groups
- dung `customers` va `orders`
- tinh `lead_count`, `customer_count`, `conversion_rate`

Vi du `team-performance-summary`:

- join `orders` voi `staffs`
- map `dept_name` thanh nhom team business
- tinh doanh thu, so don, seller active

## Fallback path

Fallback khong query truc tiep.

Trinh tu la:

1. model tao SQL theo ten bang canonical
2. connector check:
   - chi `SELECT/WITH`
   - khong multi-statement
   - khong dung bang ngoai allowlist
   - row limit
3. connector chay query
4. rows tra lai model
5. model tong hop thanh cau tra loi cuoi

## Prompt dai thi sao

Day la cau hoi rat quan trong cho production.

## Hanh vi hien tai trong V1

- He thong van luu toi da 20 messages gan nhat.
- Skill routing khong con dua thuần vao full prompt; no dua vao `routingQuestion`.
- Neu prompt dai nhung 1 muc tieu ro rang, skill van co the an toan match.
- Neu prompt dai va co nhieu y, runtime uu tien fallback thay vi bat bua mot skill.
- Fallback LLM nhin duoc full normalized conversation, khong chi mot cau rut gon.

## Gioi han hien tai

- Skill routing van la rule-based, chua co mot lop intent parser rieng.
- Neu user viet 1 prompt rat dai, rat mo, co nhieu rang buoc mem, fallback moi la noi "hieu" sau hon.
- Neu user nhieu lan doi muc tieu trong cung 1 prompt, V1 chua co co che tu tach thanh nhieu sub-task.
- Neu user muon mot ban phan tich dai va nhieu bang so trong 1 message, fallback se lam duoc nhieu hon skill.

## Chien luoc dung cho prompt dai

Nen nghi theo 3 tang:

1. Prompt dai nhung chi co 1 cau hoi chinh
   - co the van di deterministic skill

2. Prompt dai, nhieu boi canh, 1 request chinh + nhieu rang buoc
   - thuong di fallback

3. Prompt dai, nhieu cau hoi khac domain
   - nen de fallback tong hop, hoac ve sau tach thanh multi-step planner

## Huong nang cap tiep theo neu can

Neu beta gap nhieu prompt dai, 3 nang cap hop ly nhat la:

1. Them `intent extraction` nho chi cho prompt dai
   - khong dung cho moi request
   - muc tieu la rut ra `primary ask`, `entities`, `time window`

2. Them `clarifying response`
   - neu prompt co 2-3 y canh tranh nhau, agent hoi lai 1 cau de chot muc tieu chinh

3. Them `multi-part response planner`
   - tach 1 prompt dai thanh nhieu skill calls co truot tu
   - day la viec phu hop hon cho V2, khong nen bat buoc vao V1

## Ket luan ngan

- Skill khong phai la AI agent doc lap.
- Skill la business shortcut de chat nhanh, re, on dinh.
- System prompt khong phai noi chua het business logic.
- Runtime moi la bo nao dieu phoi.
- Prompt dai van xu ly duoc, nhung he thong se uu tien an toan:
  - 1 y ro rang -> co the di skill
  - nhieu y / prompt phuc tap -> fallback LLM
