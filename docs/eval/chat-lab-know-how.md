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

### KH-010: Prompt summary qua chung chung nen hoi lai, khong nen default vao dashboard KPI

- `Date`: 2026-04-10
- `Cases`: `tc12`
- `Symptom`: prompt kieu `Tom tat cho toi` auto route vao `kpi_overview` du user chua noi ro muon tom tat cai gi
- `True root cause`: classifier dang coi tu `tom tat` la du de map vao overview theo view, trong khi scope summary thuc te van mo ho
- `Fix applied`: them generic-summary rule de route sang `clarify_required`; cap nhat dataset `tc12` theo quyet dinh moi
- `Rule learned`: `summary word != summary intent`; neu user chi noi `tom tat` ma chua ro object thi phai hoi lai
- `Regression added`: test `generic summary prompt asks for clarification`
- `Applies to`: prompt summary ngan, overview mo ho, yeu cau tom tat khong ro object

### KH-011: Multi-intent ro rang nen roi ve fallback, khong nen hoi user chon 1 trong 2

- `Date`: 2026-04-10
- `Cases`: `tc16`
- `Symptom`: user hoi 2 y ro rang trong cung 1 cau, he thong lai route `clarify_required`
- `True root cause`: runtime dang coi `multi_intent` la ambiguity theo nghia can hoi lai, trong khi day la compound analytics ask can fallback
- `Fix applied`: doi route cua `ambiguity_reason = multi_intent` sang `llm_fallback`; cap nhat prompt classifier de coi day la compound ask thay vi "scope unclear"
- `Rule learned`: multi-intent ro rang khong phai la prompt mo ho; neu chua co orchestration da-ky-nang thi fallback tot hon clarify
- `Regression added`: test `multi-intent clear asks route to llm_fallback instead of clarify`
- `Applies to`: prompt 2 domain, prompt compound, prompt can tra loi nhieu phan

### KH-012: Seller alias can false-positive tren token chung va day prompt mo ho vao skill sai

- `Date`: 2026-04-10
- `Cases`: `tc11`, `tc19`
- `Symptom`: cau kieu `Doanh thu nhu the nao?` hoac trend question bi route vao `seller-month-revenue`
- `True root cause`: `detectSellerName()` cho phep match 1 token qua "pho thong" nhu `thu`, `thang`, `nao`, lam classifier hieu nham la ten seller
- `Fix applied`: mo rong stopword cho seller alias va them rule `generic revenue ask -> clarify_required`
- `Rule learned`: alias resolver phai phong thu voi token thong dung trong tieng Viet; neu khong se sinh false positive rat nguy hiem
- `Regression added`: test `seller alias detection does not false-positive on generic revenue wording` va `generic revenue ask requires clarification instead of forcing seller skill`
- `Applies to`: seller lookup, revenue prompts ngan, trend/summary prompts co tu `thu`, `thang`, `nao`

### KH-013: Follow-up team phai giu entity tu history den tan skill execution

- `Date`: 2026-04-10
- `Cases`: `tc13`
- `Symptom`: classifier route dung `team_revenue_summary` nhung reply lai tong hop toan bo team, khong bam `team Fire`
- `True root cause`: follow-up inference co the giu intent family, nhung skill `team-performance-summary` chua filter theo team entity trong context
- `Fix applied`: them detect team entity vao classifier va follow-up inference; nang `team-performance-summary` thanh team-aware skill co the tra 1 team cu the theo ky duoc carry-over
- `Rule learned`: giu duoc intent chua du; skill layer phai tieu thu context entity neu khong answer van sai nghia hoi thoai
- `Regression added`: mo rong test `follow-up prompt can reuse recent turns for intent detection`
- `Applies to`: team follow-up, entity carry-over, prompt ngan kieu `Con thang 4?`

### KH-014: Cross-view operations summary nen mac dinh theo thang hien tai va tra ve snapshot giau hon

- `Date`: 2026-04-10
- `Cases`: `tc15`
- `Symptom`: route dung sang operations skill nhung reply qua mong va de troi sang latest-data semantics thay vi current-month semantics
- `True root cause`: `operations-status-summary` dang dung ky gan nhat trong mart va chi tra mot snapshot rat gon
- `Fix applied`: cho skill uu tien system current month khi user khong noi ro ky; bo sung breakdown `Active/Inactive` va `Best/Value/Noise/Ghost`
- `Rule learned`: voi prompt `tinh hinh operations`, route dung chua du; summary phai giong dashboard snapshot ma user ky vong
- `Regression added`: test `operations summary without explicit period defaults to the system current month`
- `Applies to`: operations summary, cross-view ask, current-month default semantics

### KH-015: User-facing answer cua Chat Lab phai la tieng Viet co dau

- `Date`: 2026-04-10
- `Cases`: nhieu case group B/C
- `Symptom`: route dung nhung reply cuoi van ra tieng Viet khong dau, lam giam chat luong va fail manual review
- `True root cause`: nhieu deterministic reply, fallback message, va formatter prompt chi rang buoc `Vietnamese` nhung khong ep `co dau`
- `Fix applied`: doi cac user-facing deterministic strings sang tieng Viet co dau; them formatter guardrail reject reply khong co dau; cap nhat base/fallback/formatter prompts de yeu cau `Vietnamese with full diacritics`
- `Rule learned`: ngon ngu dau ra la mot phan cua correctness; "dung so nhung khong dau" van co the la fail doi voi UX noi bo
- `Regression added`: route tests van pass sau khi doi toan bo deterministic copy sang tieng Viet co dau
- `Applies to`: skill replies, fallback replies, clarification text, formatter output

### KH-016: Ask hep thi skill khong duoc tra loi du thong tin hon muc can

- `Date`: 2026-04-11
- `Cases`: `tc06`, `tc07`
- `Symptom`: skill route dung nhung reply bi "tham thong tin", vi du renew count lai ke them mau account; operations chi hoi `active va ghost` nhung reply dump ca dashboard snapshot
- `True root cause`: deterministic skill dang tra bo snapshot mac dinh thay vi toi uu theo pham vi cau hoi
- `Fix applied`: them branch wording theo intent hep trong `renew-due-summary` va `operations-status-summary`; chi them mau/list khi user hoi ro danh sach hoac chi tiet
- `Rule learned`: route dung chua du; skill phai ton trong `scope` cua cau hoi, neu khong manual review van fail vi answer khong trong tam
- `Regression added`: route tests cho renew va operations duoc cap nhat de giu reply hep hon
- `Applies to`: count asks, status asks, operations snapshot, renew summary

### KH-017: Team-vs-team comparison ro rang co the giu o deterministic skill

- `Date`: 2026-04-11
- `Cases`: `tc18`
- `Symptom`: team comparison chi gom doanh thu / so don / seller active nhung runtime van roi `llm_fallback`
- `True root cause`: classifier dang coi moi team comparison 2 doi tuong la analytical query qua rong, trong khi `team-performance-summary` thuc te da co du truong du lieu de tra loi
- `Fix applied`: doi intent sang `team_revenue_summary` voi `action=compare` khi prompt so sanh 2 team ro rang; nang `team-performance-summary` de tra comparison deterministic
- `Rule learned`: neu bai toan so sanh van nam trong metric schema cua 1 skill hien co thi uu tien nang skill, khong fallback vo dieu kien
- `Regression added`: test `complex team comparison stays on deterministic team skill`
- `Applies to`: team compare, quarter compare, asks gom revenue + order_count + seller_active

### KH-018: Revenue trend va cau hoi "tai sao" nen co deterministic diagnostic skill rieng

- `Date`: 2026-04-11
- `Cases`: `tc19`, `tc20`
- `Symptom`: trend / why revenue bi day vao fallback SQL rong, ton token va thuong tra loi lan man
- `True root cause`: runtime chua co skill cho phan tich doanh thu theo thang va chuan doan driver co ban
- `Fix applied`: them skill `revenue-trend-analysis`; classifier route revenue trend / causal asks vao skill nay; skill tra loi tu monthly metrics + team delta thay vi broad fallback
- `Rule learned`: recurring analytical asks co schema on dinh nen duoc dong goi thanh diagnostic skill, khong nen de fallback giong ad-hoc query
- `Regression added`: tests `revenue trend analysis uses deterministic trend skill` va `causal why question uses deterministic revenue trend skill`
- `Applies to`: revenue trend, anomaly detection, month-over-month why analysis

### KH-019: Multi-intent ro rang co the orchestration 2 deterministic skills truoc khi dung fallback

- `Date`: 2026-04-11
- `Cases`: `tc16`
- `Symptom`: user hoi 2 y ro rang, moi y deu co skill san, nhung runtime van roi `llm_fallback`
- `True root cause`: router coi multi-intent = conflict va dung lai, du skill registry da nhin thay 2 candidate ro rang
- `Fix applied`: them compound deterministic orchestration cho 2 skill candidate dau tien khi legacy path gap `legacy_multi_intent_conflict`
- `Rule learned`: khong phai multi-intent nao cung can fallback; neu moi sub-ask da co deterministic skill thi nen compose truoc
- `Regression added`: test `runtime can answer clear multi-domain ask by composing deterministic skills`
- `Applies to`: 2-domain prompts kieu team + conversion, 2 sub-asks deu co skill

### KH-020: Prompt dai 1 intent van nen tra loi them 1 insight nho de nghe "thong minh" hon

- `Date`: 2026-04-11
- `Cases`: `tc17`
- `Symptom`: route dung va so lieu dung nhung answer nghe cut lung, khong dua them 1 goc nhin bo tro du context prompt dai
- `True root cause`: deterministic seller reply chi tra metric chinh ma khong co business context bo sung nao
- `Fix applied`: nang `seller-month-revenue` de them average order value va ty trong doanh thu trong thang khi du du lieu
- `Rule learned`: voi long prompt nhung 1 ask ro rang, 1 insight bo tro co the tang chat luong rat nhieu ma van giu answer gon
- `Regression added`: long seller prompt regression van pass tren deterministic skill
- `Applies to`: seller lookup, direct metric asks, long internal meeting prompts

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
