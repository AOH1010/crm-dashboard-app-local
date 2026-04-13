# Tài liệu thiết kế: 3-Phase Routing và Skill Family cho CRM AI Chat

## 1. Mục tiêu tài liệu

Tài liệu này mô tả một kiến trúc chat AI cho CRM theo hướng **semantic-first, policy-routed, execution-validated**.

Mục tiêu là giải quyết các lỗi phổ biến của chatbot CRM hiện tại:

- route bị chặn bởi keyword/rule quá sớm
- intent hiểu đúng nhưng route chọn sai skill
- route đúng nhưng skill không đủ khả năng xử lý
- follow-up chat bị carry context sai hoặc thiếu
- skill taxonomy quá vụn nên khó mở rộng và dễ route nhầm
- khó hardening vì control flow nằm rải rác trong nhiều if/else

Tài liệu này được viết để phục vụ đồng thời 2 mục đích:

- **cho Codex/AI coding assistant**: hiểu rõ kiến trúc để implement đúng
- **cho người vận hành/chủ sản phẩm**: đọc, review và chỉnh sửa policy sau này

---

## 2. Nguyên tắc thiết kế cốt lõi

### 2.1. Semantic trước, route sau

Hệ thống không được chọn skill chỉ vì khớp keyword.

Luồng đúng phải là:

1. hiểu người dùng đang muốn gì
2. trích xuất context và slot cần thiết
3. đánh giá câu hỏi có phù hợp deterministic skill hay không
4. mới quyết định skill / clarify / fallback / validation

Sai kiểu cũ:

`keyword -> route -> skill`

Đúng kiểu mới:

`semantic parse -> policy route -> execution -> output validation`

### 2.2. Route không phải là nơi “đoán cuối cùng”

Route policy không phải bộ não hiểu ngôn ngữ tự nhiên.

Route policy chỉ là lớp ra quyết định dựa trên dữ liệu đã được semantic classifier chuẩn hóa.

### 2.3. Skill phải được xem như năng lực có điều kiện

Không phải cứ có skill là dùng được.

Một skill chỉ nên được chạy nếu đồng thời thỏa:

- intent phù hợp
- slot đủ
- context đủ rõ
- metric/time/entity được skill support
- output của skill có thể kiểm chứng được với business ask

### 2.4. Follow-up không được dựa hoàn toàn vào raw history text

Conversation history dạng text chỉ là nguồn tham khảo.

Hệ thống phải có **structured conversation state** để biết:

- đang nói về ai
- đang nói về tháng nào
- đang nói về topic gì
- cái gì được carry
- cái gì phải overwrite

### 2.5. Skill taxonomy phải gom theo family, không vụn theo từng câu hỏi nhỏ

Skill design nên ưu tiên:

- ít family hơn
- input chuẩn hóa hơn
- nhiều variant/parameter hơn

Tránh tình trạng có hàng chục skill rất nhỏ, tên gần giống nhau, gây route nhầm liên tục.

---

## 3. Kiến trúc tổng thể

```text
User Message
  -> Phase 1: Semantic Classifier
  -> Phase 2: Route Policy
  -> Phase 3: Execution
  -> Response Validator
  -> Final Reply
```

Mỗi phase có trách nhiệm riêng, không chồng lấn.

---

# PHASE 1 - SEMANTIC CLASSIFIER

## 4. Mục tiêu của Phase 1

Phase 1 có nhiệm vụ **hiểu câu hỏi** và chuyển ngôn ngữ tự nhiên thành một object chuẩn hóa.

Phase này không được chọn skill cụ thể.

Phase này chỉ trả về mô tả có cấu trúc của user ask.

## 5. Output bắt buộc của Phase 1

Semantic classifier phải trả về ít nhất các trường sau:

- `intent`
- `confidence`
- `slots`
- `broadness`
- `multi_intent_flag`
- `follow_up_flag`
- `needs_clarification`
- `clarification_reason`
- `candidate_skill_families`

## 6. Schema đề xuất cho Phase 1

```json
{
  "intent": "metric_lookup | ranking | comparison | trend | diagnostic | breakdown | forecast | unsupported",
  "confidence": 0.0,
  "broadness": "narrow | medium | broad",
  "multi_intent_flag": false,
  "follow_up_flag": false,
  "needs_clarification": false,
  "clarification_reason": null,
  "slots": {
    "topic": "seller_performance",
    "metric": "revenue",
    "metric_modifier": "actual",
    "entity_type": "seller",
    "entity_value": "Nguyen Van A",
    "team": null,
    "customer": null,
    "source": null,
    "time_range": {
      "type": "month",
      "month": 4,
      "year": 2026,
      "from": null,
      "to": null
    },
    "breakdown_by": null,
    "comparison_target": null,
    "limit": null,
    "output_mode": "answer"
  },
  "candidate_skill_families": [
    "seller_metrics",
    "seller_conversion"
  ]
}
```

## 7. Ý nghĩa từng field

### 7.1. `intent`

Mô tả kiểu câu hỏi chính.

Ví dụ:

- `metric_lookup`: hỏi một KPI cụ thể
- `ranking`: top / bottom / xếp hạng
- `comparison`: so sánh giữa hai thực thể hoặc hai giai đoạn
- `trend`: xu hướng theo thời gian
- `diagnostic`: phân tích nguyên nhân, bất thường, giải thích sâu
- `breakdown`: chia theo nguồn, khu vực, seller, team...
- `forecast`: dự báo
- `unsupported`: ngoài phạm vi hỗ trợ

### 7.2. `confidence`

Độ tin cậy semantic parse.

Không phải confidence của toàn hệ thống, mà là confidence của bước hiểu câu hỏi.

### 7.3. `broadness`

Đánh giá độ rộng của câu hỏi.

- `narrow`: rất cụ thể, thường phù hợp deterministic skill
- `medium`: có thể skill được nếu slot đủ
- `broad`: thiên về open-ended analysis, thường nên fallback hoặc planner

Ví dụ:

- “doanh thu tháng 4 của sale A” -> `narrow`
- “top seller tháng 4 theo doanh thu” -> `medium`
- “đánh giá tình hình kinh doanh tháng này” -> `broad`

### 7.4. `multi_intent_flag`

Đánh dấu câu hỏi có nhiều yêu cầu cùng lúc.

Ví dụ:

- “cho tôi doanh thu và tỉ lệ chuyển đổi của sale A tháng 4” -> true
- “doanh thu sale A tháng 4” -> false

### 7.5. `follow_up_flag`

Đánh dấu đây là turn cần resolve thêm từ conversation state.

Ví dụ:

- “còn tỉ lệ chuyển đổi thì sao?” -> true
- “top seller tháng 4 là ai?” -> false

### 7.6. `slots`

Là phần quan trọng nhất.

Mọi downstream phase phải dựa vào `slots`, không re-parse raw text nếu không thật cần thiết.

### 7.7. `candidate_skill_families`

Chỉ gợi ý family phù hợp.

Không phải chọn skill cuối cùng.

## 8. Nguyên tắc semantic parse

### 8.1. Parse theo ý nghĩa, không parse theo keyword thô

Ví dụ:

- “doanh thu thực tế” và “revenue thật” có thể map cùng metric
- “sale”, “nhân viên sale”, “seller”, “bạn Hùng” có thể cùng entity type
- “tháng 4”, “tháng 4 vừa rồi”, “April” có thể map cùng time slot

### 8.2. Tách “metric” khỏi “topic”

Ví dụ:

- topic = seller_performance
- metric = conversion_rate

Không được gộp cả hai thành một nhãn cứng kiểu `seller_conversion_monthly_follow_up_specific`.

### 8.3. Tách “explicit ask” khỏi “carry-over context”

Phase 1 có thể đọc conversation state, nhưng phải giữ nguyên tắc:

- giá trị nói rõ ở turn hiện tại luôn thắng
- metric mới phải overwrite metric cũ
- entity/time có thể carry nếu turn hiện tại không ghi rõ

## 9. Khi nào Phase 1 nên đánh dấu `needs_clarification = true`

Ví dụ:

- thiếu entity mà skill bắt buộc phải có
- thiếu time range trong khi business logic không có default an toàn
- metric mơ hồ
- follow-up quá mơ hồ và state không đủ để resolve

Ví dụ:

- “xem giúp tôi tình hình của Hùng”
- “phần kia thì sao?”
- “doanh thu thực tế” nhưng không rõ của ai / thời gian nào

---

# PHASE 2 - ROUTE POLICY

## 10. Mục tiêu của Phase 2

Phase 2 nhận semantic output và quyết định đường đi phù hợp:

- `skill`
- `clarify`
- `fallback`
- `validation`

Phase này không nên hiểu ngôn ngữ lại từ đầu.

Phase này là lớp **policy engine**.

## 11. Input của Phase 2

Phase 2 nhận:

- semantic result từ Phase 1
- conversation state hiện tại
- current view/filter context
- capability metadata của skill registry
- system policy thresholds

## 12. Output của Phase 2

```json
{
  "decision": "skill | clarify | fallback | validation",
  "reason_code": "string",
  "resolved_context": {
    "topic": "seller_performance",
    "metric": "conversion_rate",
    "entity_type": "seller",
    "entity_value": "Nguyen Van A",
    "time_range": {
      "type": "month",
      "month": 4,
      "year": 2026
    }
  },
  "candidate_executors": [
    {
      "family": "seller_metrics",
      "score": 0.91
    },
    {
      "family": "team_metrics",
      "score": 0.34
    }
  ]
}
```

## 13. Điều Phase 2 phải làm

### 13.1. Merge context theo thứ tự ưu tiên

Quy tắc merge bắt buộc:

`explicit current turn > conversation state > selected_filters/view context > defaults`

Ví dụ:

- turn hiện tại có metric mới -> dùng metric mới
- turn hiện tại không nhắc lại tháng -> có thể carry tháng từ state
- turn hiện tại không nói seller nhưng đang cùng topic seller -> có thể carry seller
- selected_filters chỉ là hint, không được thắng explicit ask

### 13.2. Chấm điểm candidate skill family

Phase 2 phải tạo danh sách ứng viên, không chọn mù một cái duy nhất ngay từ đầu.

Tiêu chí chấm điểm có thể gồm:

- semantic fit
- slot completeness
- family support for metric
- family support for entity
- family support for time_range
- follow-up compatibility
- output suitability

### 13.3. Quyết định policy route

#### Chọn `skill` khi:

- confidence đủ cao
- broadness không quá rộng
- slot đủ
- có ít nhất một skill family đủ khả năng
- candidate top score vượt ngưỡng

#### Chọn `clarify` khi:

- thiếu slot quan trọng
- follow-up không đủ rõ
- nhiều candidate ngang nhau nhưng có thể hỏi lại ngắn để chốt

#### Chọn `fallback` khi:

- câu hỏi quá broad/open-ended
- semantic đúng nhưng skill registry không support
- multi-intent vượt phạm vi deterministic hiện tại
- capability check sơ bộ cho thấy skill khó trả đúng

#### Chọn `validation` khi:

- câu hỏi ngoài phạm vi
- bị injection / malformed / unsafe
- vi phạm rule hệ thống

## 14. Những lỗi Phase 2 phải tránh

### 14.1. Không chọn skill chỉ vì khớp keyword

### 14.2. Không chọn skill chỉ vì intent đúng sơ bộ

Ví dụ `intent = metric_lookup` chưa đủ để chọn skill.
Cần xét thêm:

- metric nào
- entity nào
- time nào
- family nào support

### 14.3. Không carry metric cũ một cách mù quáng

Ví dụ:

Turn 1: “doanh thu tháng 4 của sale A”
Turn 2: “còn tỉ lệ chuyển đổi thì sao?”

Ở turn 2:

- nên giữ `sale A`
- nên giữ `tháng 4`
- phải đổi `metric = conversion_rate`

### 14.4. Không để view/filter override explicit ask

Nếu user đang ở view doanh thu nhưng hỏi conversion, route phải nghe user.

## 15. Reason code chuẩn hóa cho Phase 2

Nên bắt buộc log reason code rõ ràng.

Ví dụ:

- `matched_certified_skill_family`
- `slots_incomplete`
- `broad_analytic_query`
- `follow_up_context_missing`
- `candidate_score_too_low`
- `unsupported_metric`
- `multi_intent_out_of_scope`
- `unsafe_or_invalid_input`

Reason code này rất quan trọng cho debug, hardening và analytics.

## 16. Policy thresholds đề xuất

Có thể bắt đầu với các ngưỡng như sau, rồi tune dần:

- semantic confidence tối thiểu để vào skill path: `>= 0.75`
- top candidate score tối thiểu: `>= 0.80`
- chênh lệch top 1 và top 2 tối thiểu: `>= 0.15`
- broadness = `broad` thì ưu tiên fallback, trừ khi certified family support rất mạnh

Đây là policy config, không hard-code vào logic rải rác.

---

# PHASE 3 - EXECUTION

## 17. Mục tiêu của Phase 3

Phase 3 thực thi quyết định từ Phase 2.

Nếu decision là `skill`, execution không được assume rằng skill chắc chắn thành công.

Execution phải có:

- capability check chi tiết
- fallback nội bộ có kiểm soát
- output validation

## 18. Các nhánh execution

### 18.1. Skill execution

- chọn candidate family tốt nhất
- resolve variant phù hợp
- chạy skill
- validate output
- nếu fail, cân nhắc thử candidate thứ 2 hoặc rơi sang fallback/clarify

### 18.2. Clarify execution

- sinh câu hỏi làm rõ ngắn
- chỉ hỏi đúng phần thiếu
- không hỏi lan man

### 18.3. Fallback execution

- dùng llm_fallback/planner nhẹ
- vẫn nhận `resolved_context`
- không bỏ mất entity/time đã resolve được

### 18.4. Validation execution

- trả lời theo policy từ chối / safe failure

## 19. Capability check bắt buộc trước khi chạy skill

Ví dụ mỗi family/variant phải tự khai báo metadata kiểu:

```json
{
  "family": "seller_metrics",
  "supports": {
    "metrics": ["revenue", "actual_revenue", "conversion_rate", "order_count"],
    "entity_types": ["seller", "team"],
    "time_types": ["day", "week", "month", "range"],
    "follow_up": true,
    "breakdown_by": ["source", "province", "product"]
  },
  "required_slots": ["metric", "entity_type", "entity_value", "time_range"]
}
```

Execution chỉ được chạy nếu capability check pass.

## 20. Output validation sau khi chạy skill

Đây là lớp bắt buộc.

Một skill chạy xong chưa có nghĩa là trả đúng.

Validator phải kiểm tra tối thiểu:

- metric đúng chưa
- entity đúng chưa
- time đúng chưa
- unit/aggregation đúng chưa
- ask hẹp có bị trả rộng quá không

Ví dụ user hỏi:

- “tỉ lệ chuyển đổi của sale A tháng 4”

Nếu skill trả:

- doanh thu tháng 4 -> sai metric
- conversion toàn team -> sai entity
- conversion tháng 3 -> sai time

Thì output phải bị reject.

## 21. Chính sách khi skill fail

Nếu skill fail ở execution hoặc validation, Phase 3 không nên trả thẳng lỗi kỹ thuật.

Thứ tự xử lý:

1. thử candidate thứ 2 nếu còn hợp lý
2. nếu fail vì thiếu slot -> clarify
3. nếu fail vì unsupported capability -> fallback
4. nếu fail vì dữ liệu trống hoặc mismatch -> safe response

---

# SKILL FAMILY DESIGN

## 22. Tại sao phải dùng Skill Family + Skill Variant

Nếu mỗi câu hỏi map vào một skill nhỏ riêng, hệ sẽ rất khó mở rộng:

- route cực dễ nhầm
- follow-up cực khó carry
- thêm metric mới phải thêm skill mới
- skill registry phình ra nhanh
- khó hardening theo intent family

Thiết kế tốt hơn là:

- 1 family đại diện cho 1 nhóm năng lực business
- family nhận input chuẩn hóa
- family tự resolve variant hoặc execution mode bên trong

## 23. Khái niệm

### 23.1. Skill Family

Là nhóm năng lực lớn.

Ví dụ:

- `seller_metrics`
- `team_metrics`
- `order_metrics`
- `lead_metrics`
- `customer_metrics`
- `ranking`
- `comparison`
- `trend_analysis`
- `forecasting`

### 23.2. Skill Variant

Là biến thể xử lý trong cùng family.

Ví dụ trong `seller_metrics` có thể có variant:

- `single_metric_lookup`
- `metric_breakdown`
- `follow_up_resolved_lookup`
- `comparison_mode`

Variant là chi tiết nội bộ của family, không phải thứ route policy phải biết quá sâu.

## 24. Cấu trúc metadata chuẩn cho skill family

```json
{
  "family": "seller_metrics",
  "description": "Trả các metric liên quan seller/team theo thời gian cụ thể",
  "supported_intents": ["metric_lookup", "comparison", "breakdown"],
  "supported_metrics": [
    "revenue",
    "actual_revenue",
    "conversion_rate",
    "lead_count",
    "order_count"
  ],
  "supported_entity_types": ["seller", "team"],
  "supported_time_types": ["day", "week", "month", "range"],
  "required_slots": ["metric", "entity_type", "entity_value", "time_range"],
  "optional_slots": ["breakdown_by", "comparison_target"],
  "supports_follow_up": true,
  "max_complexity": "medium",
  "output_contract": {
    "type": "structured_facts",
    "fields": ["metric", "value", "entity", "time_range", "notes"]
  }
}
```

## 25. Family đề xuất cho CRM chat analytics

### 25.1. `seller_metrics`

Dùng cho:

- doanh thu seller
- doanh thu thực tế seller
- tỉ lệ chuyển đổi seller
- số đơn seller
- lead của seller

### 25.2. `team_metrics`

Dùng cho:

- doanh thu team
- conversion team
- hiệu suất team

### 25.3. `order_metrics`

Dùng cho:

- đơn hàng mới
- đơn theo trạng thái
- đơn theo nguồn
- filtered orders

### 25.4. `lead_metrics`

Dùng cho:

- lead count
- lead conversion
- lead geography
- lead source

### 25.5. `customer_metrics`

Dùng cho:

- customer ranking
- inactive customer
- repeat customer

### 25.6. `ranking`

Dùng cho:

- top seller
- bottom seller
- xếp hạng theo metric

### 25.7. `comparison`

Dùng cho:

- so sánh seller A với B
- so sánh tháng này với tháng trước
- so sánh team

### 25.8. `trend_analysis`

Dùng cho:

- xu hướng doanh thu
- biến động conversion theo thời gian
- tăng/giảm theo giai đoạn

### 25.9. `forecasting`

Dùng cho:

- revenue forecast
- sales forecast

## 26. Nguyên tắc chọn family

Route policy chỉ nên chọn family nếu:

- family đủ support metric + entity + time
- family là abstraction đúng của business ask
- family không quá rộng tới mức đánh mất kiểm soát

Không route trực tiếp vào variant trừ khi rất chắc chắn và rất ổn định.

## 27. Resolve variant ở đâu

Variant nên được resolve trong executor của family.

Ví dụ `seller_metrics` có thể tự chọn:

- lookup thường
- lookup follow-up
- breakdown
- comparison

Dựa trên `resolved_context`.

Điều này giảm gánh nặng cho router.

---

# CONVERSATION STATE

## 28. Vì sao cần structured conversation state

Nếu chỉ dựa vào raw history text, follow-up sẽ rất dễ sai.

Hệ thống cần một state riêng để carry những gì nên carry.

## 29. Schema conversation state đề xuất

```json
{
  "current_topic": "seller_performance",
  "active_entities": {
    "seller": "Nguyen Van A",
    "team": null
  },
  "active_time_range": {
    "type": "month",
    "month": 4,
    "year": 2026
  },
  "last_metric": "revenue",
  "last_intent": "metric_lookup",
  "last_skill_family": "seller_metrics",
  "carry_policy": {
    "entity": "strong",
    "time_range": "strong",
    "topic": "strong",
    "metric": "weak",
    "intent": "weak"
  }
}
```

## 30. Carry policy chuẩn

### Carry mạnh

- entity
- time_range
- topic frame

### Carry yếu

- metric
- intent action
- output mode

### Không carry tự động

- assumptions ngầm không được xác nhận
- view-level bias
- metric cũ khi turn mới đã nêu metric mới

## 31. Ví dụ follow-up đúng

### Turn 1
“Doanh thu thực tế của sale A tháng 4 là bao nhiêu?”

State sau turn 1:

- topic = seller_performance
- seller = A
- month = 4
- metric = actual_revenue

### Turn 2
“Còn tỉ lệ chuyển đổi thì sao?”

Resolve đúng:

- giữ seller = A
- giữ month = 4
- đổi metric = conversion_rate
- intent vẫn là metric_lookup/breakdown tùy format hỏi

### Turn 3
“So với tháng 3?”

Resolve đúng:

- seller = A
- metric = conversion_rate
- time_range = compare(month 4 vs month 3)
- intent = comparison

---

# CLARIFY VS FALLBACK

## 32. Khi nào nên clarify

Clarify khi chỉ thiếu một hoặc vài slot rõ ràng và user có thể trả lời ngắn.

Ví dụ:

- “doanh thu của Hùng” -> thiếu thời gian
- “tỉ lệ chuyển đổi tháng 4” -> thiếu entity

Clarify tốt là:

- ngắn
- trúng chỗ thiếu
- không hỏi lại mọi thứ

## 33. Khi nào nên fallback

Fallback khi bản chất câu hỏi không phù hợp deterministic path hiện tại.

Ví dụ:

- “đánh giá xem team nào đang có vấn đề”
- “vì sao doanh thu giảm mạnh”
- “phân tích tổng quan chất lượng sale tháng này”

Đây không phải câu hỏi thiếu slot đơn thuần.
Đây là câu hỏi rộng hơn năng lực skill hiện tại.

---

# OBSERVABILITY VÀ HARDENING

## 34. Log bắt buộc

Mỗi request nên log:

- semantic intent
- semantic confidence
- slots extracted
- broadness
- follow_up_flag
- candidate families
- decision
- reason_code
- selected family
- selected variant
- capability check result
- output validation result
- final route
- fallback reason nếu có

## 35. Metric nên đo

### 35.1. Semantic quality

- intent accuracy
- slot completeness rate
- follow-up resolution accuracy

### 35.2. Route quality

- deterministic route rate
- clarify rate
- fallback rate
- forced_skill_rate
- wrong_family_selection_rate

### 35.3. Execution quality

- capability check fail rate
- post-validation fail rate
- candidate-2 recovery rate

### 35.4. Product quality

- widget vs chat_lab route divergence
- reply acceptance rate
- manual correction rate

## 36. Forced skill rate là gì

Đây là metric rất quan trọng.

Định nghĩa:

> tỷ lệ request bị route vào skill path nhưng review sau đó cho thấy đáng ra nên clarify hoặc fallback

Metric này phản ánh đúng bệnh “route ép vào skill quá sớm”.

---

# PSEUDO FLOW CHO CODEX IMPLEMENT

## 37. Pseudo code tổng thể

```ts
function handleChatTurn(input: ChatInput): ChatResponse {
  const conversationState = loadConversationState(input.sessionId)

  const semantic = semanticClassifier({
    message: input.message,
    history: input.history,
    state: conversationState,
    selectedFilters: input.selectedFilters,
    viewContext: input.viewId
  })

  const routeDecision = routePolicy({
    semantic,
    state: conversationState,
    selectedFilters: input.selectedFilters,
    viewContext: input.viewId,
    skillRegistry: skillRegistryMetadata
  })

  switch (routeDecision.decision) {
    case "clarify":
      return buildClarifyReply(routeDecision)

    case "validation":
      return buildValidationReply(routeDecision)

    case "fallback":
      return executeFallback(routeDecision)

    case "skill":
      return executeSkillPath(routeDecision)
  }
}
```

## 38. Pseudo code cho skill path

```ts
function executeSkillPath(routeDecision: RouteDecision): ChatResponse {
  const candidates = routeDecision.candidateExecutors

  for (const candidate of candidates) {
    const capability = checkCapability(candidate, routeDecision.resolvedContext)
    if (!capability.ok) continue

    const result = runSkillFamily(candidate.family, routeDecision.resolvedContext)
    const validation = validateSkillOutput(result, routeDecision.resolvedContext)

    if (validation.ok) {
      return formatSkillReply(result)
    }
  }

  if (routeDecision.reasonCode === "slots_incomplete") {
    return buildClarifyReply(routeDecision)
  }

  return executeFallback(routeDecision)
}
```

---

# QUY TẮC THỰC THI CHO CODEX

## 39. Những điều Codex phải tuân thủ khi implement

### 39.1. Không hard-code keyword trực tiếp ra skill

### 39.2. Không để Phase 2 re-parse raw text nếu Phase 1 đã parse xong

### 39.3. Mọi skill family phải có metadata capability

### 39.4. Mọi quyết định route phải có reason code

### 39.5. Mọi output skill phải qua validator trước khi trả user

### 39.6. Conversation state phải được cập nhật sau mỗi turn thành công

### 39.7. Explicit ask của turn hiện tại luôn ưu tiên cao nhất

### 39.8. selected_filters và view_id chỉ là context phụ trợ, không được override explicit ask

---

# ROADMAP IMPLEMENTATION KHUYẾN NGHỊ

## 40. Thứ tự làm an toàn

### Bước 1
Implement semantic output schema chuẩn.

### Bước 2
Implement conversation state chuẩn.

### Bước 3
Tách route policy thành module riêng dùng semantic object.

### Bước 4
Refactor skill registry sang family metadata.

### Bước 5
Thêm capability check.

### Bước 6
Thêm output validator.

### Bước 7
Thêm logging + metrics.

## 41. Thứ tự ưu tiên family ban đầu

Nên bắt đầu với các family hay dùng nhất:

1. `seller_metrics`
2. `order_metrics`
3. `ranking`
4. `team_metrics`
5. `trend_analysis`

Sau khi ổn mới mở rộng thêm.

---

# MIGRATION SQLITE -> POSTGRES/SUPABASE/MCP KHÔNG LÀM HỎNG HỆ THỐNG

## 42. Vấn đề thực tế khi migrate

Hệ local đang chạy với SQLite, còn môi trường online sẽ đi qua Postgres/Supabase, thậm chí thêm cả MCP tool surface. Nếu migrate theo kiểu thay thẳng connector ở dưới mà giữ nguyên kỳ vọng output ở trên, hệ rất dễ hỏng theo các kiểu sau:

- cùng một intent nhưng query chạy ra kết quả khác vì khác SQL dialect
- local pass nhưng online fail do placeholder, hàm date, case-sensitivity hoặc null behavior khác nhau
- skill cũ ngầm phụ thuộc vào đặc tính của SQLite
- llm_fallback hoặc text-to-SQL sinh câu query hợp SQLite nhưng sai trên Postgres
- route/skill đúng nhưng timeout online cao hơn local
- MCP làm tăng một lớp abstraction mới, khiến debug khó hơn nếu không có contract rõ

Vì vậy, migrate đúng không phải là “đổi database”, mà là **tách data plane thành contract ổn định** rồi để từng backend tự implement.

## 43. Nguyên tắc migrate an toàn

### 43.1. Runtime phía trên không được biết chi tiết database

Tất cả Phase 1, Phase 2, Phase 3 và skill family chỉ làm việc với:

- semantic object
- resolved context
- connector contract
- structured facts

Chúng không được biết trực tiếp:

- đang là SQLite hay Postgres
- placeholder là `?` hay `$1`
- dùng hàm date nào
- đang query trực tiếp DB hay đi qua MCP

### 43.2. Chỉ migrate data access layer, không migrate toàn bộ runtime cùng lúc

Nếu vừa đổi database, vừa đổi planner, vừa đổi route, vừa đổi skill thì bạn sẽ không biết lỗi nằm ở đâu.

Thứ tự đúng là:

1. khóa semantic + route + skill behavior
2. tách connector contract
3. implement backend mới bám đúng contract
4. chạy parity test
5. bật online theo cờ cấu hình

### 43.3. MCP không phải business logic layer

MCP chỉ nên là **transport/tool surface**.

Không được để business logic cốt lõi nằm rải rác trong prompt gọi MCP.

Business logic vẫn phải nằm ở:

- semantic classifier
- route policy
- skill family executor
- output validator

MCP chỉ là một cách gọi data/tool an toàn hơn ở online.

---

## 44. Kiến trúc migrate nên dùng

```text
Phase 1 Semantic
  -> Phase 2 Route Policy
  -> Phase 3 Execution
       -> Skill Family Executor
            -> DataConnector Contract
                 -> SQLiteConnector (local)
                 -> PostgresConnector (online direct)
                 -> SupabaseConnector (online HTTP/client)
                 -> MCPConnector (online via tool surface)
```

Ý quan trọng nhất:

**Skill không query DB trực tiếp. Skill chỉ gọi DataConnector contract.**

---

## 45. DataConnector contract chuẩn hóa

### 45.1. Mục tiêu

DataConnector phải là lớp ổn định để mọi skill family gọi vào.

Nó phải che hết khác biệt giữa:

- SQLite
- Postgres
- Supabase
- MCP transport

### 45.2. Không expose raw SQL toàn hệ nếu chưa cần

Thay vì để skill nào cũng tự build SQL raw, nên có 2 lớp API:

#### Lớp 1: domain methods

Ví dụ:

- `getSellerMetric()`
- `getTeamMetric()`
- `getTopEntities()`
- `getOrdersByFilter()`
- `getTrendSeries()`
- `getForecastBaseSeries()`

Đây là lớp ưu tiên cho critical-path skills.

#### Lớp 2: constrained query/spec layer

Dùng cho fallback hoặc use case rộng hơn.

Ví dụ:

- `runMetricQuery(spec)`
- `runReadOnlyQuery(queryPlan)`

Lớp này vẫn phải constrained, không phải raw SQL tự do.

### 45.3. Interface gợi ý

```ts
export interface DataConnector {
  kind: "sqlite" | "postgres" | "supabase" | "mcp";

  getSchemaSummary(): Promise<SchemaSummary>;

  getSellerMetric(input: SellerMetricInput): Promise<SellerMetricResult>;
  getTeamMetric(input: TeamMetricInput): Promise<TeamMetricResult>;
  getTopEntities(input: RankingInput): Promise<RankingResult>;
  getOrdersByFilter(input: OrdersFilterInput): Promise<OrderListResult>;
  getTrendSeries(input: TrendInput): Promise<TrendResult>;

  runReadOnlyQuery?(input: QuerySpec): Promise<QueryResult>;
}
```

Nếu contract này ổn, Phase 1-2-3 không cần sửa khi đổi từ local sang online.

---

## 46. SQL dialect strategy: không viết một đống query chung rồi cầu may

## 46.1. Vấn đề thường gặp

SQLite và Postgres khác nhau ở nhiều điểm:

- placeholder: `?` vs `$1`
- date/time functions
- string functions
- boolean handling
- null sorting
- case sensitivity
- type casting
- limit/offset edge cases
- aggregation behavior ở một số case

Nếu skill đang build SQL inline, migrate rất dễ âm thầm sai số.

## 46.2. Cách làm đúng

Có 3 hướng, theo mức độ an toàn:

### Hướng A - Domain methods trước, ít SQL lộ ra ngoài nhất

Mỗi connector tự implement logic query cho từng method.

Ví dụ:

- `SQLiteConnector.getSellerMetric(...)`
- `PostgresConnector.getSellerMetric(...)`

Ưu điểm:

- an toàn nhất
- dễ kiểm soát correctness
- dễ parity test

Nhược điểm:

- phải viết 2 implementation

### Hướng B - QuerySpec trung gian

Skill không sinh SQL, skill sinh **query spec chuẩn hóa**, connector compile spec sang dialect riêng.

Ví dụ:

```json
{
  "table": "orders",
  "filters": [
    {"field": "seller_name", "op": "=", "value": "Hung"},
    {"field": "order_month", "op": "=", "value": "2026-04"}
  ],
  "metrics": ["actual_revenue"],
  "group_by": [],
  "limit": 1
}
```

Connector tự compile sang SQLite SQL hoặc Postgres SQL.

Đây là hướng rất hợp cho fallback có kiểm soát.

### Hướng C - Raw SQL per dialect

Chỉ nên dùng ở một số query đặc biệt và phải tách file riêng theo dialect.

Không nên để raw SQL inline rải rác trong skill code.

---

## 47. Semantic layer cho metric để tránh migrate xong ra sai số

Vấn đề lớn hơn cả SQL là **định nghĩa business metric**.

Ví dụ các metric như:

- doanh thu
- doanh thu thực tế
- paid amount
- approved revenue
- conversion rate

nếu không có semantic layer chuẩn thì SQLite đúng một kiểu, Postgres đúng kiểu khác, nhưng business lại thấy sai.

### 47.1. Cần có metric registry

```ts
export const MetricRegistry = {
  actual_revenue: {
    source: "orders",
    aggregation: "sum",
    field: "actual_revenue_amount",
    null_policy: "zero",
    description: "Doanh thu thực tế đã chốt"
  },
  conversion_rate: {
    formula: "converted_leads / total_leads",
    numerator: "converted_leads",
    denominator: "total_leads",
    null_policy: "safe_divide_zero"
  }
}
```

Skill family chỉ gọi metric name.
Connector và query layer đọc registry này để build query đúng.

### 47.2. Lợi ích

- tránh skill tự hiểu metric theo cảm tính
- migrate DB không làm đổi meaning của metric
- fallback/planner cũng dùng chung semantics

---

## 48. MCP nên được chèn vào đâu

## 48.1. Không để MCP thay thế semantic/router

MCP không được dùng kiểu:

- model tự nghĩ phải gọi tool nào
- tool surface quá rộng
- business logic bị rơi vào prompt

Cách đó rất khó debug khi migrate.

## 48.2. Cách dùng đúng

MCP nên là một backend implementation của `DataConnector` hoặc `ToolConnector`.

Ví dụ:

```ts
class MCPConnector implements DataConnector {
  async getSellerMetric(input: SellerMetricInput): Promise<SellerMetricResult> {
    return this.callTool("get_seller_metric", input)
  }
}
```

Skill family vẫn gọi:

- `connector.getSellerMetric(...)`

chứ không gọi MCP trực tiếp từ route hay prompt ở nhiều nơi.

## 48.3. Tool surface MCP nên hẹp

Chỉ expose tool thật sự cần cho runtime:

- `get_seller_metric`
- `get_team_metric`
- `get_orders_by_filter`
- `get_top_entities`
- `get_trend_series`
- `get_schema_summary`

Không nên mở tool kiểu query SQL tự do cho user-facing runtime, trừ lane riêng có kiểm soát rất chặt.

---

## 49. Chiến lược migrate theo từng bước

## Step 1 - Khóa contract trước

Trước khi migrate online, cần khóa:

- semantic output schema
- route decision schema
- skill family input/output contracts
- connector interface

Nếu các contract này chưa khóa, migrate sẽ loạn.

## Step 2 - Tạo connector song song

Giữ local:

- `SQLiteConnector`

Thêm online:

- `PostgresConnector` hoặc `SupabaseConnector`
- nếu cần thêm `MCPConnector`

Nhưng không đổi code phase trên.

## Step 3 - Chạy parity suite

Với cùng một `resolved_context`, chạy qua 2 connector và so:

- facts
- row counts liên quan
- metric value
- empty/not-found behavior
- null handling
- sorting/ranking

Ví dụ:

- seller revenue tháng 4
- top sellers tháng 4
- conversion rate team A
- recent orders theo filter
- trend 6 tháng

## Step 4 - Shadow mode

Trên online, có thể cho hệ chạy:

- connector chính = SQLite/local behavior cũ hoặc current prod path
- connector phụ = Postgres/Supabase shadow

Không trả kết quả shadow cho user, chỉ log diff.

Đây là cách bắt mismatch rất tốt.

## Step 5 - Feature flag rollout

Dùng cờ cấu hình:

- `DATA_CONNECTOR=sqlite`
- `DATA_CONNECTOR=postgres`
- `DATA_CONNECTOR=supabase`
- `DATA_CONNECTOR=mcp`

Hoặc rollout theo phần trăm traffic / internal only.

## Step 6 - Rollback dễ dàng

Rollback phải chỉ là đổi config, không phải revert hàng loạt code.

---

## 50. Capability metadata nên bổ sung trường backend support

Skill family ngoài support metric/entity/time còn nên biết backend nào đã certified.

Ví dụ:

```json
{
  "family": "seller_metrics",
  "certified_backends": ["sqlite", "postgres", "supabase"],
  "mcp_ready": false
}
```

Nếu một family chưa certified trên MCP thì route policy có thể:

- không dùng MCP path cho family đó
- hoặc ép fallback an toàn

Điều này tránh chuyện migrate xong một số skill âm thầm hỏng.

---

## 51. Parity test nên test ở level nào

Không chỉ test SQL.
Phải test ở 4 level.

### 51.1. Connector parity test

Cùng input spec -> cùng facts.

### 51.2. Skill family parity test

Cùng resolved context -> cùng structured output.

### 51.3. End-to-end route parity test

Cùng user message + state -> cùng route decision.

### 51.4. Widget parity test

Cùng widget payload -> cùng final answer behavior.

Nếu chỉ test SQL query pass mà skill output khác format hoặc null policy khác, user vẫn thấy sai.

---

## 52. Những thứ tuyệt đối không nên làm khi migrate

### 52.1. Không cho text-to-SQL sinh SQL trực tiếp cho cả SQLite lẫn Postgres mà không có dialect guard

### 52.2. Không để skill build SQL inline trong từng file business logic

### 52.3. Không trộn migrate DB với refactor route trong cùng một đợt lớn

### 52.4. Không mở MCP tool surface quá rộng ngay từ đầu

### 52.5. Không dùng selected_filters/view context như business truth thay cho backend semantic layer

---

## 53. Cấu trúc module khuyến nghị

```text
src/
  ai/
    semantic/
      classifier.ts
      schema.ts
    routing/
      route-policy.ts
      thresholds.ts
      reason-codes.ts
    execution/
      executor.ts
      capability-check.ts
      output-validator.ts
    state/
      conversation-state.ts
      carry-policy.ts
    skills/
      registry.ts
      families/
        seller-metrics/
          index.ts
          variants.ts
          contract.ts
        order-metrics/
          index.ts
          contract.ts
        ranking/
          index.ts
    data/
      contract.ts
      metric-registry.ts
      query-spec.ts
      connectors/
        sqlite-connector.ts
        postgres-connector.ts
        supabase-connector.ts
        mcp-connector.ts
    tests/
      parity/
      integration/
      widget/
```

Cấu trúc này giúp Codex không trộn nhầm giữa business logic và transport.

---

## 54. Rule bổ sung cho Codex khi implement migration

### 54.1. Mọi skill family chỉ được gọi qua connector contract

### 54.2. Không import thư viện database trực tiếp vào route policy hoặc semantic classifier

### 54.3. Mọi connector phải trả về cùng một output contract cho cùng một method

### 54.4. Mọi backend mới phải pass parity tests trước khi được bật production

### 54.5. MCPConnector phải giữ tool surface hẹp và read-only

### 54.6. Fallback/query planner không được assume SQL dialect; phải đi qua QuerySpec hoặc connector abstraction

---

## 55. Kết luận migration

Hướng migrate an toàn là:

- giữ nguyên 3-phase architecture
- thêm một lớp `DataConnector contract` thật chặt
- gom business logic vào skill family
- tách SQL dialect khỏi skill logic
- dùng parity/shadow/feature-flag để rollout
- xem MCP như transport layer có kiểm soát, không phải nơi nhét business logic

Công thức nên là:

**Semantic ổn định + Route ổn định + Skill family ổn định + Connector thay được + Backend parity rõ ràng**

thì mới migrate từ SQLite lên Postgres/Supabase/MCP mà không làm hỏng hệ thống.

# KẾT LUẬN

Kiến trúc đúng cho CRM AI Chat không phải là:

- intent đúng là đủ
- route đúng là đủ
- có skill là đủ

Mà phải là:

- hiểu đúng câu hỏi
- resolve đúng context
- chọn đúng family có năng lực thật
- validate output trước khi trả

Công thức nên được chuẩn hóa là:

**Phase 1: Semantic Classifier**  
hiểu câu hỏi và chuẩn hóa semantic object

**Phase 2: Route Policy**  
ra quyết định skill / clarify / fallback / validation dựa trên policy

**Phase 3: Execution**  
chạy candidate phù hợp, kiểm tra capability, validate output

Kết hợp với:

**Skill Family + Skill Variant**  
để giảm route nhầm, giảm taxonomy vụn, tăng khả năng follow-up và mở rộng lâu dài.

---

# Phụ lục A - Ví dụ end-to-end

## Example 1

User: “Doanh thu thực tế của sale Hùng tháng 4 là bao nhiêu?”

### Phase 1
- intent = metric_lookup
- metric = actual_revenue
- entity = seller:Hùng
- time = month 4
- broadness = narrow
- candidate_skill_families = [seller_metrics]

### Phase 2
- decision = skill
- resolved_context = seller Hùng, month 4, actual_revenue
- candidate_executors = seller_metrics

### Phase 3
- capability check pass
- run seller_metrics variant single_metric_lookup
- validator check metric/entity/time pass
- reply

## Example 2

User: “Còn tỉ lệ chuyển đổi thì sao?”

### Phase 1
- follow_up_flag = true
- metric = conversion_rate
- entity/time chưa explicit

### Phase 2
- merge state từ turn trước
- resolved_context = seller Hùng, month 4, conversion_rate
- decision = skill
- candidate = seller_metrics

### Phase 3
- capability check pass
- run seller_metrics variant follow_up_resolved_lookup
- validator pass
- reply

## Example 3

User: “Đánh giá xem sale Hùng tháng 4 có vấn đề gì không”

### Phase 1
- intent = diagnostic
- broadness = broad
- candidate families = [seller_metrics, trend_analysis]

### Phase 2
- decision = fallback
- reason = broad_analytic_query

### Phase 3
- execute llm_fallback với resolved_context = seller Hùng, tháng 4
- reply có grounding phù hợp

