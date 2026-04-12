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

### KH-021: Nhung analytical ask co SQL shape rat ro nen nang thanh deterministic skill som

- `Date`: 2026-04-12
- `Cases`: `tc21`, `tc22`, `tc23`, `tc25`
- `Symptom`: customer ranking, recent orders, lead geography, va order filter deu roi vao clarify/fallback du query shape qua obvious
- `True root cause`: classifier / skill catalog chua cover nhung ask co template on dinh du du lieu de tra loi bang SQL deterministic
- `Fix applied`: them skill `customer-revenue-ranking`, `recent-orders-list`, `lead-geography`, `orders-filtered-list`; map classifier intent truc tiep vao cac skill nay
- `Rule learned`: neu testcase co the viet thanh 1 query on dinh voi 1-2 bang va rule ro, uu tien nang thanh skill thay vi tiep tuc fallback
- `Regression added`: smoke + unit regressions cho `tc21`, `tc22`, `tc23`, `tc25`
- `Applies to`: ranking, list, filter, group-by asks co schema ro rang

### KH-022: Near-match source group khong duoc tu y xem nhu exact match

- `Date`: 2026-04-12
- `Cases`: `tc24`
- `Symptom`: prompt `Tele sale outbound` bi runtime tu map thang thanh nhom `Sale` va tra revenue ngay
- `True root cause`: detect source group dang coi substring `sale` la exact match, trong khi day chi la alias gan dung
- `Fix applied`: tach `exact` va `suggested` source-group detection; chi coi la exact khi user noi ro kieu `nguon Sale`; con near-match thi reply goi y cac nhom hop le va hoi lai co phai `Sale` khong
- `Rule learned`: entity normalization phai giu 2 muc `grounded exact` va `suggested`, khong duoc nhay thang sang query khi entity chua du chac chan
- `Regression added`: smoke regression cho `tc24`
- `Applies to`: source group, category alias, near-match business labels

### KH-023: Validation route phai cat som prompt injection, khong de roi sang fallback

- `Date`: 2026-04-12
- `Cases`: `tc26`
- `Symptom`: prompt co `DELETE FROM` van di vao `llm_fallback`
- `True root cause`: guardrail chi ton tai o connector SQL, den luc do runtime da route sai va ton token fallback roi
- `Fix applied`: them deterministic intent `injection_attempt`; router dua thang ve `validation` va tra copy chan som
- `Rule learned`: SQL safety o connector la hang phong thu cuoi; runtime van can co tang validation de chan prompt injection truoc khi classifier/fallback ton chi phi
- `Regression added`: test `prompt injection routes to validation before fallback`
- `Applies to`: delete/update/insert/truncate/drop, ignore-rules prompts, malicious tool steering

### KH-024: Seller khong ton tai van nen giu intent seller lookup va tra grounded not-found

- `Date`: 2026-04-12
- `Cases`: `tc27`
- `Symptom`: `Doanh thu cua Elon Musk thang 3` bi clarify thay vi route vao seller skill
- `True root cause`: seller detection cu chi hoat dong khi ten seller da ton tai trong DB; entity extraction khong giu duoc ten seller raw tu prompt
- `Fix applied`: bo sung explicit seller candidate extraction tu cau hoi; `seller-month-revenue` v2 nhan entity nay, check seller ton tai hay khong, va tra copy `khong tim thay seller ...`
- `Rule learned`: not-found la mot ket qua hop le; khong nen bien not-found thanh ambiguity neu intent va entity van ro
- `Regression added`: test `nonexistent seller still routes to seller skill and returns not-found copy`
- `Applies to`: seller lookup, customer lookup, entity-based metrics voi raw named entity

### KH-025: Forecast request nen vao guarded fallback thay vi clarify

- `Date`: 2026-04-12
- `Cases`: `tc28`
- `Symptom`: user hoi du bao doanh thu nhung runtime lai hoi lai, trong khi y dinh da ro
- `True root cause`: classifier khong co intent rieng cho forecast va coi day la ask mo ho
- `Fix applied`: them intent `forecast_request`; route ve `llm_fallback` co guard text tach `actual` va `forecast`, nhac ro pham vi grounded den ngay du lieu cuoi
- `Rule learned`: voi ask ma business intent ro nhung he thong chua co skill an toan, fallback co guardrail se dung hon clarify
- `Regression added`: test `forecast request stays on guarded fallback path`
- `Applies to`: forecast, projection, scenario planning asks

### KH-026: Long prompt nen route theo routing slice / ask cuoi, khong route theo cum domain som hon

- `Date`: 2026-04-12
- `Cases`: `tc30`
- `Symptom`: prompt dai nhieu domain nhung ask cuoi ro la `top 3 seller thang 3`; runtime lai route sang renew
- `True root cause`: legacy classifier va skill date parsing doc toan bo prompt, nen bi bat boi domain / month xuat hien som hon
- `Fix applied`: them `routingQuestion` slice uu tien doan sau cue nhu `truoc mat`; legacy classifier doc `routingQuestion`; `top-sellers-period` va `seller-month-revenue` uu tien parse thoi gian tu routing slice
- `Rule learned`: trong long prompt, "ask duoc uu tien thi hanh ngay" can co lop rut gon rieng cho router, khong de parser metric/time doc toan bo context ke chuyen
- `Regression added`: test `very long prompt prefers the last explicit ask for top sellers`
- `Applies to`: long prompts, meeting-context asks, prompts co nhieu domain nhung 1 actionable ask cuoi

### KH-027: Neu testcase can bang/list grounded thi deterministic reply phai duoc uu tien hon formatter

- `Date`: 2026-04-12
- `Cases`: `tc21`, `tc22`, `tc25`
- `Symptom`: route va SQL dung nhung Chat Lab review van fail vi bang xep hang / danh sach bi mat hoac bi lam mem qua muc
- `True root cause`: skill formatter LLM co xu huong tom tat lai thay vi giu bang deterministic, trong khi nhung testcase nay can output co cau truc de review
- `Fix applied`: dua `customer-revenue-ranking`, `recent-orders-list`, `orders-filtered-list` vao nhom `prefer deterministic reply`
- `Rule learned`: voi ranking/list/filter ask ma bang la phan chinh cua dap an, formatter la optional polish, khong phai default path
- `Regression added`: replay `tc21`, `tc22`, `tc25` voi `useSkillFormatter=true` van ra `template_fallback` va giu bang
- `Applies to`: top-N, list recent items, filtered order lists, any manual-review-heavy output

### KH-028: Group-by text field phai normalize sau query neu raw source co nhieu cach viet

- `Date`: 2026-04-12
- `Cases`: `tc23`
- `Symptom`: `Hồ Chí Minh` bi lap 2 dong do raw data co mixed casing / spelling gan nhau
- `True root cause`: SQL group theo raw province value, nen `HỒ CHÍ MINH` va `Hồ CHí MINH` thanh 2 bucket khac nhau
- `Fix applied`: `lead-geography` query lay raw value, sau do collapse bang normalized province key va format lai display label
- `Rule learned`: voi dimension text den tu data nhap tay, `GROUP BY raw text` la chua du; can co lop canonicalization sau query neu chua co dimension table sach
- `Regression added`: test `lead geography uses deterministic skill instead of clarify` nay assert `Hồ Chí Minh` chi xuat hien 1 lan
- `Applies to`: province, source label, customer type, team alias, free-text dimension

### KH-029: Near-match business label nen map co kiem soat, va neu du chac chan thi tra luôn fact da map

- `Date`: 2026-04-12
- `Cases`: `tc24`
- `Symptom`: goi y nhom `Sale` la dung huong, nhung van chua du gia tri vi user phai hoi them moi lay duoc so
- `True root cause`: runtime dung lai o buoc suggest label, khong tan dung du certainty de tra luon metric cho nhom de xuat
- `Fix applied`: `source-revenue-drilldown-v2` giu ro day la map tam / suggested, nhung neu du lieu cho phep thi tra luon doanh thu cua nhom de xuat kem danh sach nhom chuan
- `Rule learned`: near-match khong nhat thiet phai ket thuc bang clarify; neu agent biet day la map tam va noi ro assumption, co the tra luon fact grounded de giam 1 turn
- `Regression added`: test `source revenue drilldown maps near-match groups and still returns grounded revenue`
- `Applies to`: source group, category alias, informal internal naming

### KH-030: Forecast revenue co the la deterministic skill neu khoa chat phuong phap va assumption

- `Date`: 2026-04-12
- `Cases`: `tc28`
- `Symptom`: guarded fallback an toan nhung chua dap ung nhu cau business review
- `True root cause`: runtime truoc day coi forecast la vung qua mo, nen chi nhac lai guardrail thay vi thuc thi phuong phap forecast co kiem soat
- `Fix applied`: them skill `revenue-forecast`; dung YTD growth nam hien tai vs cung ky nam truoc, bo qua thang mo neu du lieu chua chot, tach ro `actual months`, `forecast months`, `full-year total`, `growth vs last year`
- `Rule learned`: forecast chi nen nang thanh skill khi cong thuc da duoc khoa, khong tu y bo sung bien ngoai du lieu, va assumption partial month duoc noi thang trong answer
- `Regression added`: test `forecast request uses deterministic forecast skill`
- `Applies to`: forecast revenue trong nam hien tai, projection co baseline lich su ro

### KH-031: Top-N parser phai di theo ask cuoi, khong hardcode Top 5

- `Date`: 2026-04-12
- `Cases`: `tc30`
- `Symptom`: route dung nhung answer van tra `Top 5` du user hoi `Top 3`
- `True root cause`: `top-sellers-period` hardcode row limit = 5 va label `Top 5 seller`
- `Fix applied`: parse `top N` / `N seller` tu routing question, query va render dung so luong do
- `Rule learned`: mot long prompt co the route dung nhung van fail manual review neu post-route parameter extraction con hardcode
- `Regression added`: test `very long prompt prefers the last explicit ask for top sellers` nay assert `Top 3`, khong con `Top 5`
- `Applies to`: ranking asks, long prompts, any skill co tham so implicit trong user wording

### KH-032: Prompt tong quan qua mo ho thi phai clarify, khong duoc bind theo view hien tai

- `Date`: 2026-04-12
- `Cases`: `tc31`, `tc32`
- `Symptom`: cung mot cau `Cho toi tong quan` nhung runtime auto route theo `view_id`, lam user bi ep vao renew / operations du y cua ho chua ro
- `True root cause`: classifier dang co view-scoped overview fallback qua som, trong khi prompt nay thieu domain ro rang
- `Fix applied`: mo rong generic summary detection de bat ca dang `Cho toi tong quan` va `Tom tat cho toi`; route ve `clarify_required`
- `Rule learned`: `view_id` chi la soft hint. Neu user chua noi ro phan nao can tong quan, phai hoi lai thay vi doan y theo trang hien tai
- `Regression added`: test `generic overview in renew view now asks for clarification instead of binding to the view`
- `Applies to`: tong quan, overview, tom tat, recap prompts khong co domain

### KH-033: Operations ask mo ho co the van giu deterministic path neu mo dau noi ro limitation

- `Date`: 2026-04-12
- `Cases`: `tc33`
- `Symptom`: prompt `Account nao dang ghost nhieu nhat?` khong du dinh nghia de tra loi exact, nhung fallback rong cung khong can thiet
- `True root cause`: skill operations chi co hai mode: tra loi exact hoac tong hop thang. Chua co tang giao tiep cho nhom cau hoi mo ho nhung van nam trong domain operations
- `Fix applied`: `operations-status-summary` them soft clarify line o dau, noi ro chua hieu dinh nghia `ghost nhieu nhat`, sau do moi tra snapshot operations cua thang hien tai
- `Rule learned`: co nhung prompt khong can clarify route rieng; mot deterministic answer co caveat ngắn o đầu se thuc dung hon
- `Regression added`: replay `tc33` phai co limitation line + snapshot operations
- `Applies to`: operations detail asks, category asks, under-specified domain questions

### KH-034: Parser thoi gian dung chung phai hieu slang va tieng Anh, neu khong deterministic skill se tray sang fallback

- `Date`: 2026-04-12
- `Cases`: `tc35`, `tc38`
- `Symptom`: `t3` bi hieu sai thanh thang hien tai; `March 2026` khong duoc parse nen prompt tieng Anh roi vao clarify
- `True root cause`: parser thang chi hieu dang `thang 3`, khong hieu shorthand `t3` hoac month name tieng Anh
- `Fix applied`: `extractMonthYear` nay hieu `t3`, `this month`, `last month`, va month names nhu `March 2026`
- `Rule learned`: parser time nen duoc harden o lop dung chung thay vi sua tung skill
- `Regression added`: tests cho `DT team Fire t3...` va `What's the revenue for March 2026?`
- `Applies to`: slang prompts, English prompts, mixed-language prompts

### KH-035: Prompt rhetoric ve doanh thu co the deterministic neu so sanh thang lien ke va them 1 goc nhin mua vu

- `Date`: 2026-04-12
- `Cases`: `tc36`
- `Symptom`: prompt `Thang 2 lai thap the a?` roi vao fallback rong, ton token va de fail neu local khong co key
- `True root cause`: classifier va skill trend chi bat khi user noi ro `doanh thu`, `trend`, `tai sao`; cau rhetoric doi thuong thi khong
- `Fix applied`: classifier map dang `thap the a / lai thap / sao thap` + month reference sang `revenue_trend_analysis`; skill trend them mode `single_month_probe` de so sanh thang duoc hoi voi thang truoc va thang sau, kem note mua vu khi phu hop
- `Rule learned`: nhieu prompt nghe nhu cam than nhung thuc chat la ask phan tich. Neu quy tac so sanh da ro, deterministic skill van dat chat luong tot hon fallback
- `Regression added`: test `rhetorical low-month prompt routes to deterministic trend analysis`
- `Applies to`: rhetoric asks, conversational analysis prompts, business review language

### KH-036: Menh lenh xuat bang seller va verify so lieu sai deu la deterministic asks

- `Date`: 2026-04-12
- `Cases`: `tc37`, `tc39`
- `Symptom`: `Xuat cho toi bang seller thang 3 di` va `Hoang Van Huy co phai dat 200 trieu thang 3 khong?` deu roi vao fallback du query shape rat ro
- `True root cause`: classifier dang can keyword qua hep; khong hieu imperative export tone va khong nhan ra verify amount prompt la seller revenue check
- `Fix applied`: them rule map `export/xuat ... bang seller` sang `top_sellers_period`; map `co phai / verify` + seller + amount sang `seller_revenue_month`; seller skill moi con so sanh va noi ro `dung / khong` theo con so claim
- `Rule learned`: verify/correction prompts la mot lop deterministic rat quan trong vi user thuong chat theo kieu nay trong thuc te
- `Regression added`: tests cho imperative export va seller verification correction
- `Applies to`: export asks, correction asks, confirm-deny data prompts

### KH-037: Follow-up chain phai tim "anchor turn", khong duoc chi copy user turn ngay truoc

- `Date`: 2026-04-12
- `Cases`: `tc40`, `tc41`
- `Symptom`: turn dau follow-up co the dung, nhung sang turn tiep theo kieu `Hoang thi sao?` hoac `thang 1 thi sao` lai roi ve fallback hoac mat context
- `True root cause`: follow-up inference dang suy nguoc tu user turn ngay truoc, trong khi turn do co the chinh no cung la mot follow-up rat ngan va khong con domain cue ro rang
- `Fix applied`: them co che tim `anchor turn` trong history: di nguoc den user turn gan nhat con giu duoc intent xac dinh, roi moi carry intent/entity/time tu do
- `Rule learned`: voi multi-turn chain, "turn ngay truoc" va "turn goc cua chu de" la hai khái niệm khác nhau; neu khong tach ra thi carry-over se vo sau 2-3 luot
- `Regression added`: tests cho `Con Hien thi sao?`, `Hoang thi sao?`, `thang 1 thi sao`, `thang 5/2026 thi sao`
- `Applies to`: group `H`, follow-up ngan, session stress test

### KH-038: Skill can giu month tu history, neu khong follow-up doi entity se troi ve thang moi nhat

- `Date`: 2026-04-12
- `Cases`: `tc40`, `tc42`
- `Symptom`: route dung seller/KPI skill nhung thoi gian lai nhay ve thang hien tai hoac latest month trong data
- `True root cause`: nhieu skill van resolve month chi tu `latestQuestion`; khi follow-up chi doi seller hoac yeu cau drill-down thi month cue nam o turn truoc nen bi mat
- `Fix applied`: bo sung helper `resolveMonthlyWindowFromContext()` de uu tien month hien trong turn hien tai, roi den `intent.time_window`, roi den user history gan nhat co cue ve thang
- `Rule learned`: carry-over khong chi nam o classifier; skill layer cung phai doc context lich su neu khong answer van sai nghia hoi thoai
- `Regression added`: tests cho seller follow-up giu `03/2026` va KPI drill-down giu thang 3
- `Applies to`: seller revenue, top sellers, team summary, KPI follow-up

### KH-039: Off-topic ngoai CRM phai bi chan bang validation re token, khong duoc roi fallback rong

- `Date`: 2026-04-12
- `Cases`: `tc43`
- `Symptom`: cau kieu `Thoi tiet hom nay the nao?` van tieu ton token fallback du khong lien quan den CRM
- `True root cause`: classifier khong co lop guardrail cho out-of-domain request; cau hoi ngoai CRM bi coi la `custom_analytical_query`
- `Fix applied`: them nhan dien out-of-domain nhu weather/news va route thang sang `validation`, tra loi ngay rang khong co quyen truy cap du lieu/dich vu ngoai CRM noi bo
- `Rule learned`: nhung cau hoi ngoai pham vi he thong can bi cat o tang route som nhat de tranh ton token va tranh lam loang session context
- `Regression added`: test `out-of-domain weather follow-up is blocked by validation without fallback`
- `Applies to`: off-topic reset, session stress test, guardrail group `E/H`

### KH-040: Group H khong the harden ben vung neu chi nhin `recent turns`; can coi hoi thoai nhu mot topic dang mo

- `Date`: 2026-04-12
- `Cases`: `tc40`, `tc41`, `tc42`
- `Symptom`: doi nhe 1 bien nhu `thang 4 cua Hien thi sao`, `thang 12 2025 thi sao`, hoac drill sang `lead moi` la runtime mat chu de va roi vao fallback hoac tra lai snapshot cu
- `True root cause`: carry-over cu van mang tu duy "nhin vai turn gan nhat"; no chua luu duoc `topic dang mo` gom intent, entity, time, metric/focus cua cuoc hoi thoai
- `Fix applied`: deterministic follow-up nay uu tien scan toan transcript hien co de tim `anchor turn`, sau do patch entity/time/focus moi len topic do; `kpi-overview` cung duoc nang cap de drill theo hạng muc thay vi lap lai reply tong quan
- `Rule learned`: muon hoi thoai nuot thi phai co notion of `conversation topic state`; neu khong he thong se luon "thong minh gia" trong 1-2 turn dau roi sap sau do
- `Regression added`: tests cho `thang 4 cua Hien thi sao`, `thang 12 2025 thi sao`, `phan tich them ve lead moi`
- `Applies to`: nhom `H`, conversation stress mode, future compound orchestration

### KH-041: Long-session QA phai co state theo turn, khong chi xem text reply

- `Date`: 2026-04-12
- `Cases`: `tc40`, `tc41`, `tc42`, `tc43`
- `Symptom`: cung mot hoi thoai co luc reply trong co ve dung, nhung rat kho biet runtime dang giu topic, patch entity/time hay da reset topic sai
- `True root cause`: Chat Lab truoc day chi show route/intent/reply, nen review session dai phai doan tay va rat kho noi fail nam o carry-over hay o formatter
- `Fix applied`: runtime tra them `conversation_state`; Chat Lab Conversation tab show `continuity_mode`, active topic label, focus/entity/time, patched fields, anchor question, va export nhung truong nay ra CSV
- `Rule learned`: muon harden nhom `H` ben vung thi phai bien memory thanh metadata quan sat duoc; neu memory van an trong heuristic thi manual review se rat cham va de sua sai tang
- `Regression added`: tests assert `conversation_state` cho seller follow-up patch va out-of-domain topic reset
- `Applies to`: long-session QA, conversation stress mode, handoff review

### KH-042: KPI follow-up nhieu hang muc nen duoc giai quyet trong cung mot deterministic topic

- `Date`: 2026-04-12
- `Cases`: `tc42` va bien the stress prompt
- `Symptom`: user drill them kieu `lead moi va khach moi` de lam runtime chi bat 1 focus hoac lap lai overview, lam hoi thoai bi cut va thieu y
- `True root cause`: `kpi-overview` truoc day chi support mot `drilldown_focus` don le, nen prompt nhieu focus cung topic khong duoc hop nhat
- `Fix applied`: `kpi-overview` nay support `drilldown_focuses[]`, co the tra cung luc phan lead funnel + customer/conversion hoac them revenue/seller trong cung topic KPI
- `Rule learned`: khong phai moi prompt nhieu y deu can planner rieng; trong mot topic deterministic ro, compound follow-up nen duoc giai ngay trong skill de giu hoi thoai nuot va re token
- `Regression added`: test `follow-up KPI drilldown can analyze multiple focuses in the same topic`
- `Applies to`: KPI overview, compound follow-up trong cung domain, V1.5 controlled orchestration

## Quy tac bo loc truoc khi sua case moi

Truoc khi sua mot testcase fail, agent nen di qua bo loc nay:

1. `Route` co sai khong?
2. `Intent` co sai khong?
3. `SQL/data` co sai khong?
4. `Formatter` co dang chen vao va lam hong reply khong?
5. `Expected intent` co can normalize khong?
6. `Manual review note` dang noi ve bug runtime hay bug dataset?

Neu khong qua bo loc nay, agent rat de sua sai tang.

### KH-043: Seller alias heuristic neu mo qua rong se pha huong route cua ca nhom follow-up va cross-view

- `Symptom`: cac cau nhu `Seller nao dang dan dau DT thang nay?`, `What's the revenue for March 2026?`, hoac `Doanh thu he thong hien tai la bao nhieu?` bi route thanh `seller_revenue_month`; follow-up seller ngan thi luc dung luc sai, de bat nham `Dang`, `The`, `Hien`, `Thai` thanh ten nguoi.
- `True root cause`: heuristic seller alias dang match theo token qua tho (`dang`, `the`, `hien`, `tai`...), va history-based seller ranking van chay ca o first turn khong co topic mo.
- `Fix applied`: tach ro `generic query stopwords` ra khoi alias detection; chi cho history-based seller resolution chay khi da co transcript truoc do va current turn thuc su la follow-up ngan; neu prompt mang `system scope` (`he thong`, `tong quan`, `toan cong ty`) thi khong duoc giu seller entity.
- `Rule learned`: alias seller la patch cho follow-up tu nhien, khong phai bo phan route chinh cho moi cau hoi revenue. Neu de heuristic nay chay tu do, no se pha ca `kpi_overview`, `top_sellers_period`, `revenue_trend_analysis`.
- `Regression added`: `top seller shorthand still routes to top sellers skill`, `cross-view revenue ask does not get trapped by operations view context`, `cross-view revenue paraphrase still prefers kpi overview`, `english revenue prompt is understood and stays deterministic`, `rhetorical low-month prompt routes to deterministic trend analysis`, va cac test seller follow-up `Con Hien`, `Hoang`, `Hung`.
- `Applies to`: group `F`, group `G`, group `H`, seller follow-up, cross-view revenue, prompt variation hardening

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
