# Chat Lab Know-How

## Muc dich

File nay dung de dong goi tri thuc thuc chien rut ra trong qua trinh:
- chay testcase
- manual review
- sua code
- chay lai regression

No khac voi `chat-lab-testing-guide.md`:
- `chat-lab-testing-guide.md` giai thich he thong dang van hanh nhu the nao
- file nay ghi lai nhung bai hoc da duoc xac minh bang testcase va code fix

Muc tieu sau cung:
- bien file nay thanh nguon de dong goi thanh 1 skill tong cho agent
- dung nhu bo loc truoc khi agent lao vao cac huong sua sau va mo rong sau hon

## Cach dung file nay

Moi entry nen tra loi du 6 cau hoi:
- symptom la gi
- root cause that nam o tang nao
- fix da ap dung la gi
- rule rut ra la gi
- testcase nao dai dien
- regression nao da duoc them

## Format entry chuan

### Entry template

- `Date`:
- `Cases`:
- `Symptom`:
- `True root cause`:
- `Fix applied`:
- `Rule learned`:
- `Regression added`:
- `Applies to`:

## Da xac minh

### KH-001: Route dung chua co nghia la answer dung

- `Date`: 2026-04-10
- `Cases`: `tc01`, `tc02`
- `Symptom`: route va intent xanh, nhung reply cuoi van sai, thieu so, sai ngon ngu, hoac doc nghe rat "ngu"
- `True root cause`: scorer ban dau chi cham `route`, `intent`, `clarify`; khong cham quality cua reply cuoi
- `Fix applied`: mo manual review cho moi testcase, cho phep reviewer override `pass/fail`, va dua thong tin review vao CSV export
- `Rule learned`: khong bao gio ket luan testcase dat chi vi route dung; phai tach ro `auto-score` va `review ket qua cuoi`
- `Regression added`: Chat Lab scorer va manual review flow duoc sua
- `Applies to`: tat ca testcase, dac biet case co grounding, formatting, va business wording

### KH-002: Case nhom A de nhat van co the fail o formatter, khong phai o classifier

- `Date`: 2026-04-10
- `Cases`: `tc01`, `tc09`
- `Symptom`: classifier dung, route dung, skill dung, nhung cau tra loi cuoi bi tieng Anh, cut so, hoac khong dung y nghia kinh doanh
- `True root cause`: `SkillResponseFormatter` duoc chen o tang cuoi va co the lam hong deterministic facts neu prompt qua mong
- `Fix applied`: tang guardrail formatter va uu tien deterministic reply cho mot so skill business-critical nhu `seller-month-revenue`, `team-performance-summary`
- `Rule learned`: neu route dung + SQL dung + reply do thi nghi formatter truoc, khong nghi classifier truoc
- `Regression added`: spot-check cho seller revenue va top sellers
- `Applies to`: skill path co formatter

### KH-003: Natural query khong duoc phu thuoc keyword may moc

- `Date`: 2026-04-10
- `Cases`: `tc03`
- `Symptom`: `Ai dang dan dau doanh thu thang nay?` bi day vao `llm_fallback` du day la 1 ranking question rat tu nhien
- `True root cause`: legacy classifier bat `top_sellers_period` qua hep, doi cau hoi phai chua token kieu `seller`, `sale`, `nhan vien`, `nguoi ban`
- `Fix applied`: mo rong top-seller intent de chap nhan `topMatch + revenueMatch` ngay ca khi prompt khong noi tuong minh `seller`
- `Rule learned`: natural ranking prompt khong duoc buoc phai khai bao entity keyword theo kieu schema
- `Regression added`: test `natural top seller query routes to top sellers skill`
- `Applies to`: ranking intents, seller/team/source leaderboard

### KH-004: "Tinh hinh chung" phai duoc giai nghia theo view

- `Date`: 2026-04-10
- `Cases`: `tc04`, `renew overview`
- `Symptom`: prompt overview informal bi route sang `clarify_required` hoac route sai domain
- `True root cause`: legacy classifier coi `tinh hinh chung` la `unknown` hoac `kpi` chung chung, khong dung `viewId` de chon domain overview
- `Fix applied`: them `view-aware overview inference` cho `dashboard`, `renew`, `team`, `conversion`, `operations`
- `Rule learned`: prompt overview mo ho khong nen xu ly bang regex chung; phai dung context view truoc
- `Regression added`: test `dashboard 'tinh hinh chung' defaults to kpi overview` va `renew overview in renew view`
- `Applies to`: overview, tong quan, tom tat, tinh hinh chung

### KH-005: Follow-up carry-over neu qua hep se lam hong trai nghiem chat

- `Date`: 2026-04-10
- `Cases`: `tc13`, follow-up ngắn
- `Symptom`: `Con thang 4?`, `So voi thang truoc?`, `Con Hien thi sao?` de fail neu classifier roi ve legacy path
- `True root cause`: legacy carry-over chi support pattern hep, chu yeu `thang X` va prompt ngan
- `Fix applied`: mo rong follow-up detection, reuse previous topic rong hon, va cho phep cap nhat entity/time khi can
- `Rule learned`: follow-up logic khong duoc chi nhin regex token; phai co notion of previous topic
- `Regression added`: test `follow-up prompt can reuse recent turns for intent detection`
- `Applies to`: chat nhieu turn, prompt ngan, prompt bo sung thoi gian hoac entity

### KH-006: "Thang nay" phai theo system date, khong phai latest data month

- `Date`: 2026-04-10
- `Cases`: `tc06`, `tc07`
- `Symptom`: user hoi `thang nay` nhung reply lai tra ve `12/2026` hoac thang moi nhat trong du lieu
- `True root cause`: `resolveMonthlyWindow` dung `latestMonthKey` khi gap `current_month`
- `Fix applied`: doi `current_month` va `previous_month` sang `getSystemTodayDateKey()`
- `Rule learned`: semantics cua user ve `thang nay` la theo thoi gian hien tai cua he thong, khong theo freshness cua dataset
- `Regression added`: test `renew current month question defaults to the system current month`
- `Applies to`: renew, operations, monthly summaries

### KH-007: Compare explicit phai doc thang user noi, khong duoc fallback sang current period

- `Date`: 2026-04-10
- `Cases`: `tc05`
- `Symptom`: user hoi `thang 3 voi thang 2 nam 2026` nhung skill lai so sanh current period va previous period cua data hien tai
- `True root cause`: `compare-periods` chi dung `resolveCurrentPeriod()` va `resolvePreviousPeriod()`, khong parse month pair explicit
- `Fix applied`: them `resolveExplicitMonthlyComparison()` vao skill compare
- `Rule learned`: comparison skill phai uu tien explicit period trong prompt hon moi fallback heuristic
- `Regression added`: test `explicit month comparison uses the months asked by the user`
- `Applies to`: compare-periods va cac analytical compare skill sau nay

### KH-008: Label testcase va label runtime co the lech ten nhung cung 1 y

- `Date`: 2026-04-10
- `Cases`: `tc09` va mot so case trong eval-50
- `Symptom`: route dung, skill dung, nhung auto-score fail vi `expectedIntent` trong dataset khac ten enum runtime
- `True root cause`: dataset co nhieu label giau nghia hon runtime enum, vi du `team_revenue_ranking` vs `team_revenue_summary`
- `Fix applied`: scorer Chat Lab uu tien `normalizedExpectedIntent` neu co
- `Rule learned`: phai co lop normalization giua dataset test va enum runtime; neu khong, dashboard score se bao sai
- `Regression added`: scorer da cap nhat de doc `normalizedExpectedIntent`
- `Applies to`: chat-lab datasets, route/intents eval

### KH-009: Usage = 0 lam mo canh bao chi phi va fail mode

- `Date`: 2026-04-10
- `Cases`: nhieu case group A
- `Symptom`: Chat Lab hien `Token = 0` du classifier/formatter co the da duoc goi
- `True root cause`: `usageMetadata` tu model runtime khong duoc map day du sang `usage`
- `Fix applied`: them helper map usage metadata cho classifier va formatter
- `Rule learned`: observability la mot phan cua test harness; neu token va source sai thi reviewer se chan doan sai
- `Regression added`: usage plumbing o runtime
- `Applies to`: classifier, formatter, fallback

## Quy tac bo loc truoc khi sua case moi

Truoc khi sua mot testcase fail, agent nen di qua bo loc nay:

1. `Route` co sai khong?
2. `Intent` co sai khong?
3. `SQL/data` co sai khong?
4. `Formatter` co dang chen vao va lam hong reply khong?
5. `Expected intent` co can normalize khong?
6. `Manual review note` dang noi ve bug runtime hay bug dataset?

Neu khong qua bo loc nay, agent rat de sua sai tang.

## De xuat dong goi thanh skill sau nay

Khi du so entry, co the tach file nay thanh skill voi 3 phan:

- `SKILL.md`
  - workflow triage testcase fail
  - cach doc CSV export
  - cach map symptom -> runtime layer

- `references/known-fail-patterns.md`
  - copy cac entry know-how da duoc chuan hoa

- `references/checklists.md`
  - checklist route / intent / SQL / formatter / manual review

Ten skill de xuat:
- `chat-lab-review`
- hoac `ai-chat-eval-triage`

## Ghi chu

File nay chi nen them nhung bai hoc da duoc:
- thay trong manual review
- doi chieu voi code
- hoac khoa bang regression test

Khong dua vao day cac cam nhan mo ho chua xac minh.
