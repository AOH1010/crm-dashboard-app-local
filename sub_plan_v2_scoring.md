# Đánh giá sub_plan.md v2 — So sánh với bản review trước

> **Reviewer:** Antigravity (Claude Opus 4.6)  
> **Ngày:** 2026-04-10  
> **Verdict:** ✅ Codex đã tiếp thu đúng hướng. Plan mới giải quyết **gốc rễ** thay vì chỉ triệu chứng. Vẫn có điểm cần bổ sung nhưng đây là một bước tiến lớn.

---

## 1. So sánh trước/sau: Plan cũ vs Plan mới

| Tiêu chí | Plan cũ (bản bị phản biện) | Plan mới (v2) | Verdict |
|---|---|---|---|
| Cách hiểu prompt | Regex keyword matching | **LLM Intent Classifier** | ✅ Thay đổi cốt lõi |
| `primary_ask` populate bởi | Không nói (implicit regex) | **Classifier LLM call** rõ ràng | ✅ Trả lời đúng câu hỏi tôi đặt |
| Skill routing | Scored regex (weighted boolean) | **Intent-based mapping** (intent → skill) | ✅ Paradigm shift |
| Clarification question | Không nói nguồn | **Classifier trả về luôn** từ structured output | ✅ Giải pháp thực tế |
| Skill reply formatting | Giữ nguyên hardcode | **SkillResponseFormatter** layer mới | ✅ Pain point #2 được giải quyết |
| Conversation carry-over | "Chuẩn bị shape, chưa làm" | Classifier đọc **recent turns** trong messages | ✅ Follow-up cơ bản hoạt động |
| Fallback khi classifier fail | Không đề cập | **Rơi về regex cũ** + log `intent_classifier_failed` | ✅ An toàn |
| Pain point #1 (ép skill theo keyword) | ❌ Không giải quyết | ✅ **Classifier phân biệt semantic intent** | ✅ |
| Pain point #2 (skill bypass prompt) | ❌ Không giải quyết | ✅ **Formatter layer dùng answer-style** | ✅ |
| Pain point #3 (chọn nhầm khi mơ hồ) | ⚠️ Một phần | ✅ **confidence + ambiguity_flag → clarify route** | ✅ |

> [!TIP]
> Plan mới tiếp thu **cả 3 đề xuất thay thế** trong review trước: Intent Classifier, Skill Response Formatter, và LLM-based clarification.

---

## 2. Chấm điểm chi tiết từng giai đoạn

### Giai đoạn 0: Baseline và hạ tầng đánh giá — 9/10

**Điểm mạnh:**
- ✅ Thêm `intent eval` và `clarify eval` riêng — plan cũ chỉ có route eval
- ✅ Thêm case cho pain points thật (seller vs team, follow-up, prompt mơ hồ)
- ✅ Đo 3 chỉ số rõ ràng: route accuracy, intent accuracy, clarify accuracy
- ✅ Chưa đổi runtime logic — chỉ set up đo lường

**Thiếu (nhẹ):**
- Chưa nói format cụ thể của `intent eval` dataset (JSON schema? test fixture? prompt-expected pairs?)
- Chưa nói ai viết eval cases — tự viết hay extract từ `docs/eval/questions.json` hiện có

### Giai đoạn 1: IntentClassifier — 8.5/10

**Điểm mạnh:**
- ✅ Nói rõ classifier là **LLM call riêng**, không phải regex nâng cấp
- ✅ Output schema chuẩn hóa: `primary_intent`, `action`, `metric`, `dimension`, `entity_scope`, `entities`, `time_window`, `confidence`, `ambiguity_flag`, `clarification_question`
- ✅ Fallback về regex cũ khi classifier fail — backward compatible
- ✅ Debug metadata rõ: `intent_source = classifier | legacy_rules`
- ✅ Env toggle: `CRM_INTENT_ENABLED`, `CRM_INTENT_MODEL`, `CRM_INTENT_TIMEOUT_MS`
- ✅ Classifier đọc conversation history gần nhất — xử lý follow-up

**Thiếu:**
- ❌ **Chưa có classifier prompt draft hoặc ví dụ**. Đây là phần khó nhất — prompt classifier phải vừa nhẹ vừa chính xác. Plan nên có ít nhất 1 ví dụ prompt + expected output để Codex không phải tự nghĩ ra
- ⚠️ Chưa nói rõ **max token budget** cho classifier call. Nói "nhẹ" nhưng không quantify. Khuyến nghị: input ~500 token, output ~150 token, timeout ~3s
- ⚠️ Chưa có chiến lược cho **classifier hallucination**: model trả intent không có trong catalog → router nhận `unknown_intent` → thế nào? Fallback hay error?

### Giai đoạn 2: SkillRegistry intent-based — 9/10

**Điểm mạnh:**
- ✅ `canHandle()` → `matchIntent(intent, context)` — đổi paradigm đúng
- ✅ Intent-to-skill mapping table rõ ràng (8 mapping cụ thể)
- ✅ Routing rules tường minh: high confidence → skill, ambiguous → clarify, no match → fallback
- ✅ Clarification từ classifier output, không hardcode template
- ✅ Có fallback template khi classifier fail — phòng thủ tốt
- ✅ Legacy regex giữ lại chỉ như compatibility path có log

**Thiếu (nhẹ):**
- ⚠️ Chưa nói threshold cụ thể cho confidence. "Cao" là bao nhiêu? Khuyến nghị: `>= 0.8` → skill, `0.5-0.8` → clarify, `< 0.5` → fallback. Con số cụ thể giúp reproducing và tuning
- ⚠️ Chưa nói xử lý edge case: **classifier trả đúng intent nhưng skill `.run()` fail** (ví dụ: entity resolve sai, query trả 0 rows). Hiện tại runtime check `rawSkillResult` truthy → fallback, nhưng plan nên nói rõ luồng này

### Giai đoạn 3: SkillResponseFormatter — 8/10

**Điểm mạnh:**
- ✅ Tách rõ skill → `data + summary_facts + format_hint` thay vì final reply
- ✅ Formatter dùng `answer-style.md` — thống nhất tone giữa skill và fallback
- ✅ Formatter fail → deterministic template fallback
- ✅ PromptRegistry tách 3 loại prompt: classifier, formatter, fallback
- ✅ Chọn 3 skill đại diện trước, áp dụng dần — incremental

**Thiếu:**
- ❌ **Chưa nói formatter LLM call tốn bao nhiêu token**. Nếu mỗi request tốn: classifier (~200 tok) + formatter (~300 tok) = ~500 tok overhead. So với skill hiện tại (0 tok) thì đây là trade-off lớn. Plan nên quantify và nói rõ chấp nhận hay cần optimize
- ❌ **Chưa nói criteria để quyết định formatter dùng LLM hay template**. Nếu tất cả skill đều qua LLM formatter → chi phí nhân đôi. Có thể skill đơn giản (seller revenue) dùng template, skill phức tạp (team comparison) dùng LLM formatter
- ⚠️ `output_mode` (summary/table/comparison) đến từ classifier — nhưng nếu classifier không extract được output_mode, formatter mặc định là gì?

### Giai đoạn 4: Fallback prompt — 8.5/10

**Điểm mạnh:**
- ✅ Đặt sau khi classifier + formatter đã ổn — đúng thứ tự ưu tiên
- ✅ Fallback nhận resolved intent, không raw history
- ✅ Tool policy rõ: query tối thiểu, tránh lan man, bám metric/dimension
- ✅ Có đo: SQL noise, số vòng tool call, sát intent

**Thiếu (nhẹ):**
- Chưa nói có dùng classifier intent để **hạn chế scope** cho fallback model không. Ví dụ: classifier biết intent là "team revenue" nhưng không đủ confident → fallback vẫn nên biết "đây là câu hỏi về team revenue" thay vì hiểu lại từ đầu

---

## 3. Đánh giá tổng thể theo tiêu chí

| Tiêu chí | Điểm | Ghi chú |
|---|---|---|
| **Giải quyết gốc rễ vấn đề** | 9/10 | LLM classifier thay regex — đúng paradigm |
| **Completeness** | 7.5/10 | Thiếu classifier prompt draft, token budget, confidence thresholds |
| **Feasibility** | 8/10 | Khả thi nhưng cần model API ổn định + token cost awareness |
| **Test strategy** | 9/10 | Baseline → eval mới → gate giữa stage — chặt chẽ |
| **Backward compatibility** | 9.5/10 | Fallback về regex cũ, API contract không đổi, graceful degradation |
| **Risk management** | 8.5/10 | Có fallback paths, nhưng thiếu rollback strategy rõ ràng |
| **Thứ tự triển khai** | 9/10 | Classifier → Router → Formatter → Fallback — đúng dependency chain |
| **ROI (effort vs impact)** | 8.5/10 | Effort lớn hơn plan cũ nhưng impact thay đổi thật sự user experience |

---

## 4. Điểm tổng hợp

### **8.5 / 10**

> [!IMPORTANT]
> Đây là một bước tiến **đáng kể** so với bản plan cũ (mà tôi sẽ cho ~5.5/10). Codex đã tiếp thu đúng hướng và viết lại plan theo paradigm mới — LLM-in-the-loop cho understanding, deterministic cho execution.

### Vì sao không phải 10/10:

1. **Thiếu classifier prompt artifact** — Đây là phần khó nhất và rủi ro nhất của toàn bộ plan. Không có prompt draft → Codex sẽ tự viết → rủi ro hallucination cao, output không consistent, phải iterate nhiều
2. **Thiếu token budget analysis** — 2 LLM calls mới (classifier + formatter) trên mỗi request. Plan chưa quantify tổng chi phí token/request so với baseline. Nếu tăng từ 0 → ~500 token overhead, cần user biết và chấp nhận
3. **Thiếu concrete confidence thresholds** — "Confidence cao" và "ambiguity flag" cần con số cụ thể để implement và test
4. **Thiếu rollback plan** — Nếu classifier làm tệ hơn regex ở một số edge case, plan nên có A/B toggle ở request level, không chỉ env-level `CRM_INTENT_ENABLED`

---

## 5. Khuyến nghị trước khi approve cho Codex implement

> [!IMPORTANT]
> Plan này **đủ tốt để approve**, nhưng tôi khuyến nghị bổ sung 4 thứ trước khi Codex bắt tay code:

### 5.1 Viết classifier prompt draft trước
- Ít nhất 1 system prompt cho classifier
- Ít nhất 3 ví dụ input/output
- Định nghĩa rõ danh sách `primary_intent` hợp lệ (enum, không free-form)

### 5.2 Định nghĩa token budget
```
Classifier: input ≤ 600 tok, output ≤ 200 tok, timeout ≤ 3s
Formatter: input ≤ 800 tok, output ≤ 400 tok, timeout ≤ 5s
Total overhead per request: ≤ 1000 tokens
```

### 5.3 Lock confidence thresholds
```
confidence ≥ 0.85 → route: skill
0.5 ≤ confidence < 0.85 → route: clarify_required
confidence < 0.5 → route: llm_fallback
ambiguity_flag = true → route: clarify_required (bất kể confidence)
```

### 5.4 Per-request intent toggle (không chỉ env)
```js
// Request contract mở rộng:
{
  messages,
  view_id,
  use_intent_classifier: true  // default true, client có thể tắt
}
```
Điều này cho phép A/B testing ở frontend mà không cần redeploy.

---

## 6. Comparison: Plan cũ vs Plan mới (final)

```
Plan cũ: 5.5/10  — "Tốt cho engineering, sai kiến trúc"  
Plan mới: 8.5/10 — "Đúng kiến trúc, cần bổ sung chi tiết implement"  

Improvement: +3.0 điểm — chất lượng plan thay đổi đáng kể
```

> [!TIP]
> **Kết luận:** Approve plan mới. Bổ sung 4 khuyến nghị trên rồi cho Codex implement từ Giai đoạn 0. Plan mới là nền tảng đúng để AI chat thật sự thông minh hơn thay vì chỉ "gọn hơn".
