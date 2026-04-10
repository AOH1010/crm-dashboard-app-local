# Deep Audit: AI Chat Module

> Auditor review duoc viet lai sau khi doi chieu voi code hien tai trong repo.
> Muc tieu cua file nay la tach ro:
> - nhan dinh nao dung
> - nhan dinh nao dung mot phan nhung ket luan sai tang
> - bug nao nen uu tien sua truoc

## Verdict

Claude chi ra dung huong o nhieu diem quan trong:
- classifier legacy van la diem yeu lon
- mot so pattern regex hien tai qua hep
- follow-up handling con brittle
- formatter co the lam hong cau tra loi du route da dung

Nhung file audit goc cung co mot so ket luan sai hoac khong con dung voi implementation hien tai:
- khong dung khi noi "Intent Classifier van chay regex 100%"
- khong dung khi noi `SkillRegistry` se roi ve fallback vi `canHandle()` fail
- khong dung khi goi formatter fallback la "silent" fallback theo nghia runtime khong lo ra

Noi ngan:
- huong audit goc la dung
- mot so bug goc la co that
- nhung can viet lai cho dung voi luong runtime hien tai

---

## 1. Ket luan dung

### 1.1 Legacy classifier la diem yeu that su

File:
- `modules/ai-chat/src/runtime/intent-classifier.js`

LLM classifier khong phai luc nao cung la nguon ket luan cuoi. Runtime hien tai:
- se goi LLM classifier neu `useIntentClassifier = true`
- va `CRM_INTENT_ENABLED` khong bi tat
- va provider key duoc coi la hop le

Nhung neu:
- timeout
- invalid JSON
- provider error

thi runtime se roi ve `classifyIntentLegacy(context)`.

Dieu nay duoc xac nhan trong code:
- `classifyIntent()` co `catch` -> `classifyIntentLegacy(context)`
- metadata tra ve `intent_source = "legacy_rules"`

Ket luan:
- audit goc dung khi coi legacy classifier la path quan trong
- nhung sai khi ket luan no "chay regex 100%"

### 1.2 TC03 co bug that trong legacy classifier

Prompt:
- `Ai dang dan dau doanh thu thang nay?`

Trong legacy classifier:
- `topMatch` co the dung
- `revenueMatch` co the dung
- nhung `top_sellers_period` hien chi match khi:
  - `topMatch && SELLER_PATTERN.test(foldedQuestion)`

Van de:
- cau hoi tu nhien nhat lai khong nhat thiet chua `seller`, `sale`, `nhan vien`, `nguoi ban`

He qua:
- neu LLM classifier loi va roi ve legacy
- case top seller rat de bi route sai sang `llm_fallback`

Day la bug that.

### 1.3 TC04 / "tinh hinh chung" hien dang bi hardcode sang clarify

Trong legacy classifier:
- `/tinh hinh chung/` dang day ve `unknown + ambiguity_flag = true`
- route sau do thanh `clarify_required`

Nen neu classifier roi ve legacy path:
- `Tinh hinh chung the nao roi?`
- se khong tu nhien route sang `kpi_overview`

Day la bug that.

### 1.4 Follow-up handling hien tai qua hep

Trong legacy classifier:
- carry-over follow-up hien chi co mot nhanh rat hep
- chu yeu dua vao pattern `thang X`
- va do dai prompt ngan

Nghia la:
- `Con thang 4?` co the hoat dong
- nhung follow-up entity hoac follow-up tu nhien hon se rat de fail

Vi du:
- `Con Hien thi sao?`
- `The seller do thi sao?`
- `So voi thang truoc?`

Day la mot bug kien truc that, khong phai chi bug testcase.

### 1.5 Prompt classifier hien tai qua mong

File:
- `modules/ai-chat/prompts/intent-classifier.md`

Prompt hien tai:
- co list intent
- co schema key
- co rule co ban

Nhung thieu:
- few-shot examples
- mapping ro hon cho action / metric / dimension
- quy tac time window / entity extraction
- negative examples cho ambiguity

Audit goc dung o diem:
- prompt nay chua du de tao classifier on dinh cho beta testing nghiem tuc

### 1.6 Token usage cho classifier / formatter chua duoc plumbing dung

File lien quan:
- `modules/ai-chat/src/runtime/model-runtime.js`
- `modules/ai-chat/src/runtime/intent-classifier.js`
- `modules/ai-chat/src/runtime/skill-response-formatter.js`

`model-runtime` tra ve `usageMetadata`, nhung:
- classifier hien dang tra `createUsage("intent_classifier")`
- formatter hien dang tra `createUsage("skill_formatter")`

ma khong convert usageMetadata that vao payload.

He qua:
- Chat Lab co the hien `Token = 0`
- debug panel khong cho thay chi phi that

Day la bug instrumentation that.

---

## 2. Ket luan dung mot phan nhung audit goc noi sai tang

### 2.1 "Intent classifier van chay regex 100%" la sai

Code hien tai khong nhu vay.

Classifier flow thuc te la:
- uu tien LLM classifier
- neu LLM classifier fail moi roi ve legacy regex

Cach debug dung:
- xem `intent_source`
  - `classifier`
  - `legacy_rules`

Nen ket luan dung phai la:
- "legacy regex van la fallback quan trong va co the gay fail neu LLM classifier loi"

khong phai:
- "he thong dang chay regex 100%"

### 2.2 Van de TC31 / renew view co that, nhung root cause trong audit goc sai

Audit goc noi:
- classifier route sang `kpi_overview`
- `kpi-overview.canHandle()` fail vi view khac `dashboard`
- roi runtime fallback

Nhan dinh nay khong dung voi `SkillRegistry` hien tai.

`SkillRegistry.findMatch()` khi da co intent mapping:
- khong con dua vao `canHandle()` de quyet dinh route chinh
- no co the tra thang skill theo `ROUTABLE_SKILL_INTENTS`

Nghia la root cause that khong phai:
- "`canHandle()` fail nen roi fallback"

Ma la:
- classifier co the chon sai intent cho prompt tong quan o view khac
- va runtime co the van chay skill do du semantic context sai

Noi cach khac:
- bug la `intent selection / view awareness`
- khong phai `SkillRegistry fallback because canHandle false`

### 2.3 "SkillRegistry OK neu intent OK" la chua du

Audit goc cho rang `SkillRegistry` gan nhu on va van de nam upstream.

Nhan dinh nay chi dung mot phan.

Dung o cho:
- phan lon route sai hien nay bat dau tu classifier / legacy intent

Nhung chua du o cho:
- `SkillRegistry` hien map intent -> skill rat truc tiep
- view semantics va capability nuance cua tung skill chua duoc gate chat

Nen neu classifier tra ve mot intent "duoc map":
- runtime co the van chay skill sai semantic context

Vi vay:
- upstream la nguon bug chinh
- nhung registry cung chua du tinh phong thu

### 2.4 "Formatter silent fallback" la cach noi khong chinh xac

Formatter fallback hien la hanh vi chu dong:
- neu tat formatter
- neu khong co key
- neu formatter fail

thi runtime tra `formatter_source = "template_fallback"`.

Nghia la:
- fallback khong "silent" theo nghia debug metadata che giau no
- nhung no "silent" theo nghia UI scorer hien tai khong coi day la mot canh bao chat luong

Ket luan dung hon:
- fallback co lo ra trong debug
- nhung chat luong va scoring chua dung de phan biet day la degredation nghiem trong

---

## 3. Nhung diem audit goc chua duoc chung minh

### 3.1 TC09 false positive seller detection

Audit goc neu kha nang:
- `detectSellerName()` co the false positive

Day la mot gia thuyet hop ly de investigate, nhung chua du evidence trong file audit goc.

Voi classifier legacy hien tai:
- `teamMatch && revenueMatch` da du de route `team_revenue_summary`

Nen truoc khi ket luan TC09 fail do seller false positive, can doc them:
- implementation cua `detectSellerName()`
- trace thuc te trong Chat Lab

Cho den khi co trace, day chi la risk, chua phai finding da xac minh.

---

## 4. Van de lon ma audit goc bo sot

### 4.1 Score cua Chat Lab da tung cham sai tang

Chat Lab scorer ban dau chi cham:
- route
- intent
- clarify

nen case route dung nhung reply sai van co the hien `Dat`.

Van de nay rat quan trong vi no lam nhieu testcase nhin qua co ve pass trong khi business answer fail.

Trang thai hien tai da duoc cai tien:
- moi case deu co manual review
- case mandatory review khong duoc auto-pass
- case optional review van co the bi reviewer override

Day la mot phan cua test harness, khong phai runtime core, nhung no anh huong truc tiep den chat luong audit.

### 4.2 Formatter la nguon bug that cho nhieu case "de"

Ngay ca khi:
- classifier dung
- route dung
- skill SQL dung

thi reply cuoi van co the do vi:
- `SkillResponseFormatter` prompt qua mong
- formatter khong bi rang buoc du chat

Day giai thich vi sao:
- nhom A van co the fail du route dung

Audit goc co cham den formatter, nhung can nhan manh hon:
- day la bug o tang cuoi cua pipeline
- khong phai bug "AI khong hieu cau hoi"

---

## 5. Muc uu tien sua de xep lai

### P1. Sua legacy classifier cho cac natural query hay gap

Can sua ngay:
- top seller natural phrase
- `tinh hinh chung` theo view
- follow-up carry-over rong hon
- carry entity tu turn truoc, khong chi carry time

Fix nay co impact cao vi no bao ve khi LLM classifier fail.

### P2. Tang chat luong prompt cho LLM classifier

Can bo sung vao `intent-classifier.md`:
- few-shot examples
- positive / negative examples
- output schema ro hon
- huong dan ambiguity
- huong dan entity va time window

### P3. Bo sung usage plumbing cho classifier va formatter

Can convert `usageMetadata` that ve:
- `prompt_tokens`
- `completion_tokens`
- `total_tokens`

Neu khong, Chat Lab se tiep tuc cho team mot buc tranh sai ve chi phi va so lan goi model.

### P4. Tang guardrail cho formatter

Can them:
- prompt formatter chi tiet hon
- validator cho reply qua ngan / qua mo ho / sai ngon ngu
- fallback co canh bao chat luong ro hon

### P5. Them view-aware gate truoc khi chay skill

Khong nen tin hoan toan vao intent mapping.

Can co them:
- check skill capability theo view
- hoac route reason ro hon neu prompt tong quan cua renew / operations dang bi map sang KPI dashboard

---

## 6. Debug checklist dung

Khi mot testcase fail, khong duoc nhin moi reply cuoi. Phai doc dung 4 tang:

1. `intent_source`
   - `classifier` hay `legacy_rules`

2. `intent.primary_intent`
   - classifier hieu sai hay dung

3. `route` + `skill_id`
   - router chon nhanh nao

4. `formatter_source`
   - `llm_formatter` hay `template_fallback`

5. `sql_logs`
   - skill / fallback query co dung khong

6. `reply`
   - loi nam o reasoning, SQL, hay formatting

Neu:
- route dung
- intent dung
- SQL dung
- reply do

thi bug kha nang cao nam o formatter, khong phai classifier.

---

## 7. Ket luan cuoi

Claude da bat trung nhieu van de that:
- legacy classifier qua mong
- follow-up logic brittle
- prompt classifier yeu
- formatter co the lam hong answer

Nhung de sua dung huong, can bo ket luan qua tay sau:
- khong phai luc nao he thong cung dang chay regex
- khong phai bug cua renew view nam o `canHandle()`
- khong phai formatter fallback hoan toan "silent"

Ket luan chinh xac hon la:
- runtime hien tai da co intent-first scaffold dung huong
- nhung fallback classifier, prompt quality, formatter quality, va observability van chua dat muc beta on dinh
- nhung case fail de nhat hien nay da khong con nam o "co route dung hay khong" ma nam o "co hieu du va dien dat dung hay khong"
