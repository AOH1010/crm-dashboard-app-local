# AI Chat V3 Architecture

## Muc tieu

Tai lieu nay mo ta runtime AI chat da duoc nang cap tu Round 1 den V3 semantic-policy-execution:

- van giu luong `frontend -> backend -> modules/ai-chat -> DataConnector`
- them lop `Intent Classifier` de hieu prompt truoc khi route
- them `Semantic Frame V3` de chuan hoa classifier output thanh topic/metric/entity/time/broadness/follow-up
- them `Route Policy V3` de cham capability truoc khi chon skill, thay vi `intent -> skill id` truc tiep
- them `Skill Capability Metadata V3` cho tung skill/family/backend
- them `Skill Output Validator V3` de chan skill reply sai metric/entity truoc khi tra user
- da tach them family `seller_activity` de phan biet ro:
  - cau hoi dinh nghia seller active
  - cau hoi list ten seller active
  - aggregate operations/account active
- them route `clarify_required` cho prompt mo ho
- giu deterministic skill execution cho query business pho bien
- them `SkillResponseFormatter` de skill path khong con bypass answer style
- giu `llm_fallback` cho intent chua co skill hoac query phuc tap
- runtime active hien tai la `modules/ai-chat/src/runtime/chat-runtime-v2.js`
- connector seam hien tai la `DataConnector -> SQLiteConnector | SupabaseConnector`
- tren may nay `.env` dang duoc set `CRM_DATA_CONNECTOR="supabase"` de test runtime online

## So do tong the

```text
User Prompt
  |
  v
CrmAgentWidget / Chat Lab (frontend)
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
  |      +--> recent_turns_for_intent
  |      +--> selected_filters / view_id / session_id
  |      +--> legacy_question_analysis
  |
  +--> IntentClassifier
  |      |
  |      +--> primary_intent
  |      +--> entities
  |      +--> time_window
  |      +--> output_mode
  |      +--> confidence
  |      +--> ambiguity_flag
  |      +--> clarification_question
  |
  +--> Intent Router / SkillRegistry
  |      |
  |      +--> Semantic Frame V3
  |      +--> Route Policy V3
  |      +--> Skill Capability Metadata V3
  |      +--> skill | clarify_required | llm_fallback | validation
  |
  +--> neu route = skill
  |      |
  |      +--> Skill Handler.run()
  |      |      |
  |      |      +--> deterministic SQL via DataConnector
  |      |      +--> structured facts
  |      |
  |      +--> Skill Output Validator V3
  |      |
  |      +--> SkillResponseFormatter
  |             |
  |             +--> answer-style prompt
  |             +--> template fallback neu formatter fail
  |
  +--> neu route = clarify_required
  |      |
  |      +--> clarification_question
  |
  +--> neu route = llm_fallback
         |
         +--> buildFallbackPrompt()
         +--> query_crm_data tool
         +--> DataConnector.runReadQueryAsync()
         +--> model summary
         |
         v
Telemetry + API Response
```

## Thanh phan chinh

### 1. Frontend

- Production widget van gui:
  - `messages`
  - `view_id`
  - `selected_filters`
  - `session_id`
  - `debug`
- Request hien tai co them:
  - `use_intent_classifier`
  - `use_skill_formatter`
- Frontend co them route `chat-lab` de test testcase va xem debug chain day du
- Production widget hien tai khong con tu infer `selected_filters` an tu localStorage cache neu parent khong truyen filter that su. Dieu nay giup widget gan input cua Chat Lab hon va giam tinh trang "view dang mo khoa chat mot cach ngam".

Vai tro cua frontend:

- gui conversation history
- chuyen view context va filter context
- hien reply
- hien debug metadata khi can
- o Chat Lab: visualize route, intent, sql logs, timeline, va score

### 2. Backend adapter

- Route `/api/agent/chat` van la compatibility target
- Backend chi la adapter mong:
  - nhan request
  - map field request
  - goi `chatWithCrmAgent`
  - tra JSON response

Backend khong chua business routing logic.

### 3. Request context

`buildRequestContext()` khong con la noi tu route bang regex.

No co 3 vai tro:

1. normalize conversation
2. cat ra recent turns phuc vu intent classification
3. tap hop view/filter/session/debug vao mot context object

Context hien tai chua:

- `normalizedMessages`
- `latestUserMessage`
- `recentTurnsForIntent`
- `viewId`
- `selectedFilters`
- `sessionId`
- `legacyQuestionAnalysis`
- `intent`
- `intentSource`
- `intentConfidence`
- `ambiguityFlag`
- `clarificationQuestion`

Luu y van hanh:

- `viewId` la soft hint, khong phai hard boundary
- `selectedFilters` chi nen duoc truyen khi do la bo filter ma view dang ap dung that
- neu widget va Chat Lab cho ket qua lech nhau, phai so sanh truoc tien:
  - `messages`
  - `view_id`
  - `selected_filters`
  - `session_id`

### 4. Intent Classifier

Day la lop "hieu" prompt chinh trong Round 1.

Classifier la mot LLM call rieng, strict JSON, khong duoc phep tra loi business.

Output chuan hoa:

- `primary_intent`
- `action`
- `metric`
- `dimension`
- `entities`
- `time_window`
- `output_mode`
- `ambiguity_flag`
- `ambiguity_reason`
- `clarification_question`
- `confidence`

Neu classifier fail, timeout, hoac output invalid:

- runtime danh dau `intent_source = legacy_rules`
- roi sang logic fallback compatibility

### 5. Intent Router va SkillRegistry

Runtime khong con uu tien regex-first va cung khong route truc tiep bang `primary_intent -> skill` nua.

V3 route theo thu tu:

1. doc `intent`
2. build `semantic_frame`
3. cham diem skill candidate bang capability metadata
4. quyet dinh `skill | clarify_required | llm_fallback | validation`
5. neu vao skill thi output phai qua validator truoc khi formatter/final reply

Route hien tai:

- `skill`
- `clarify_required`
- `llm_fallback`
- `validation`

Nguong route hien tai:

- `ambiguity_flag = true` -> `clarify_required`
- semantic confidence `>= 0.75` + top candidate score `>= 0.80` + capability hop le -> `skill`
- `0.50 <= confidence < 0.75` -> `clarify_required`
- `confidence < 0.50` -> `llm_fallback`
- `custom_analytical_query` -> `llm_fallback`
- direct certified skill duoc uu tien khi top candidate ro rang, nhung van bi chan neu metric/entity output validator phat hien mismatch

Cap nhat 2026-04-13:

- follow-up carry-over khong duoc phep de cau hoi cu keo mot "standalone analytical ask" moi ve skill cu
- cac cau dang:
  - `lap bang ...`
  - `theo thang`
  - `tu ... den ...`
  - `... den hien tai`
  neu du la yeu cau phan tich doc lap thi phai duoc semantic parse lai tu dau, khong patch theo seller/topic cua turn truoc
- entity resolution da duoc siet lai de tranh false-positive seller alias tu cum thoi gian nhu `hien tai`
- nhom prompt `seller active` khong con duoc collapse ve `operations_summary`; runtime da co route rieng cho:
  - `seller_activity_definition`
  - `active_sellers_list`

### 6. Skills

Skill van la business handler deterministic, khong phai sub-agent.

Trong Round 1, skill path duoc tach thanh 2 lop:

1. `run(context, connector)`
   - query SQL deterministic
   - tra facts / data co cau truc

2. `SkillResponseFormatter`
   - format reply theo `answer-style`
   - neu fail thi roi ve deterministic template

3 skill da migrate sang structured-facts formatter flow:

- `seller-month-revenue`
- `team-performance-summary`
- `kpi-overview`

Nhung skill con lai van chay duoc va co the tiep tuc dung reply shaping cu nhu compatibility path.

### 7. PromptRegistry

PromptRegistry hien tai tach ro 3 muc dich:

- `buildIntentClassifierPrompt()`
- `buildSkillFormatterPrompt()`
- `buildFallbackPrompt()`

Y nghia:

- classifier prompt de hieu intent
- formatter prompt de dien dat lai deterministic facts
- fallback prompt de guide model query SQL khi khong co skill

`buildSystemPrompt()` khong con la trung tam cua moi route; no chu yeu con gia tri compatibility va fallback support.

### 8. DataConnector

Connector la lop trung tam cho truy van read-only va che khac biet SQLite/Supabase:

- SQLiteConnector attach CRM DB + dashboard marts + operations DB
- SupabaseConnector query schema `crm_agent` qua pooler read-only
- map canonical table names
- validate SQL an toan
- execute query read-only

Ca skill path va fallback path deu di qua connector nay.

Cap nhat 2026-04-13:

- ca `SQLiteConnector` va `SupabaseConnector` da duoc hardening them cho seller alias detection
- cac cum thoi gian va cum cau truc analytics nhu `hien tai`, `lap`, `bang`, `theo`, `tu`, `den` khong con duoc phep gay false match seller alias

## Luong route thuc te

Runtime thuc te hien tai trong `chat-runtime-v2.js` di theo thu tu debug timeline sau:

1. `normalize_messages`
2. `build_request_context`
3. `intent_classifier`
4. `semantic_frame_v3`
5. `route_policy_v3`
6. `intent_router`
7. `conversation_topic_state`
8. mot trong 4 nhanh:
   - `validation`
   - `clarify_required`
   - `skill_execute -> skill_output_validator_v3 -> skill_formatter`
   - `llm_fallback`

Neu can soi mot loi route, thu tu doc debug metadata de xac dinh root cause nen la:

1. `intent`
2. `semantic_frame`
3. `route_policy`
4. `conversation_state`
5. `sql_logs`
6. `fallback_reason`

### A. Cau hoi ro rang, co skill

Vi du:

`Doanh thu cua Hoang Van Huy thang 4/2026 la bao nhieu?`

Luong chay:

1. runtime build context
2. classifier tra `primary_intent = seller_revenue_month`
3. router map intent -> `seller-month-revenue`
4. skill query `orders`
5. skill tra structured facts
6. formatter tao reply cuoi
7. runtime tra `route=skill`, `skill_id=seller-month-revenue`

### B. Cau hoi mo ho can hoi lai

Vi du:

`Cho toi biet tinh hinh chung`

Luong chay:

1. classifier danh dau `ambiguity_flag=true`
2. classifier tao `clarification_question`
3. runtime tra `route=clarify_required`

Khong query SQL o buoc nay.

### C. Cau hoi chua co skill catalog

Vi du:

`Hien thi bang seller co doanh thu duoi trung binh`

Luong chay:

1. classifier tra `primary_intent = custom_analytical_query`
2. runtime route sang `llm_fallback`
3. fallback prompt nhan resolved intent + filters + schema summary
4. model goi `query_crm_data`
5. connector validate va execute SQL
6. model tong hop cau tra loi

### D. Classifier fail

Vi du:

- model timeout
- API key khong hop le
- output khong parse duoc JSON

Luong chay:

1. runtime danh dau `intent_source = legacy_rules`
2. fallback ve logic intent/routing compatibility
3. response debug van cho thay classifier path da fail

## He thong "hieu" prompt nhu the nao

Sau Round 1, co 3 lop hieu:

### Lop 1. Intent Classifier

Day la lop hieu chinh.

No giai quyet:

- seller vs team
- summary vs comparison
- prompt mo ho
- follow-up co history ngan

### Lop 2. Legacy rules

Day khong con la noi route chinh.

No chi ton tai de:

- offline fallback
- compatibility path
- giu runtime van chay duoc khi classifier khong san sang

### Lop 3. Fallback LLM

Day la lop hieu sau nhat cho:

- query chua co skill
- prompt phuc tap
- phan tich mo rong

## Gioi han hien tai

- Khong co persistent server-side memory; follow-up chi dua vao `messages` request hien tai
- Khong phai tat ca skills da migrate sau vao family/variant executor dung nghia; hien tai V3 la policy/capability/validator layer tren skill catalog hien co
- Nhieu intent van chua co skill rieng:
  - customer lookup
  - lead geography
  - cohort summary
  - richer custom analytics
- Khi khong co model API key hop le, classifier va formatter se roi ve compatibility behavior

## Ket luan ngan

- Round 1 da dua he thong tu `regex-first` sang `intent-first`
- V3 hien tai them lop `semantic frame -> route policy -> capability check -> output validator`
- Supabase runtime da co the chay qua `DataConnector` va duoc test parity voi SQLite
- Skill van la deterministic shortcut cho query business on dinh
- Clarify duoc nang len thanh route rieng
- Prompt layer khong con chi phuc vu fallback; no con duoc dung de format skill reply
- Legacy rules van con, nhung chi la compatibility fallback
