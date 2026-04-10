# Continuity

## Required Reading

Agent moi vao repo nay, sau khi doc file nay, phai doc tiep theo dung thu tu:

1. [docs/ai-chat-architecture.md](./ai-chat-architecture.md)
   - Doc de hieu runtime AI chat dang van hanh nhu the nao.
2. [docs/eval/chat-lab-testing-guide.md](./eval/chat-lab-testing-guide.md)
   - Doc neu cong viec lien quan den Chat Lab, testcase, batch run, scorer, manual review, export CSV.
3. [docs/eval/chat-lab-know-how.md](./eval/chat-lab-know-how.md)
   - Doc neu can triage testcase fail, manual review fail, hoac sua runtime theo feedback test.
4. [code_audit_ai_chat.md](../code_audit_ai_chat.md)
   - Doc neu cong viec lien quan den huong sua theo audit, debt hien tai, va cac diem yeu da duoc doi chieu voi code.
5. [sub_plan.md](../sub_plan.md)
   - Doc de biet roadmap da chot va pham vi Round 1.

Quy tac:
- Neu task la sua AI chat theo testcase fail: doc ca 5 file tren.
- Neu task la van hanh local hoac chay app: doc them `skills/local-development/SKILL.md`.
- Khong nhay vao sua code AI chat chi sau khi doc rieng `docs/continuity.md`.

## Current Objective

- Ship Round 1 of the AI chat upgrade as an intent-first runtime while keeping `/api/agent/chat` compatible for the current frontend app.
- Provide an internal Chat Lab route in the frontend so the team can inspect route quality, intent extraction, clarification behavior, formatter output, and SQL logs on each testcase.

## Current State

- Frontend app: `apps/frontend`
- Backend app: `apps/backend`
- AI chat module: `modules/ai-chat`
- Runtime entrypoint: `modules/ai-chat/src/runtime/chat-runtime.js`
- Legacy baseline kept at: `modules/ai-chat/src/server/legacy-agent-chat.js`
- Prompt registry now serves 3 prompt types:
  - intent classifier
  - skill formatter
  - fallback prompt
- Runtime routes now include:
  - `skill`
  - `clarify_required`
  - `llm_fallback`
  - `validation`
- Request contract now supports:
  - `use_intent_classifier`
  - `use_skill_formatter`
- Debug payload now exposes:
  - `intent`
  - `intent_source`
  - `intent_confidence`
  - `ambiguity_flag`
  - `clarification_question`
  - `matched_skill_candidates`
  - `fallback_reason`
  - `formatter_source`
  - `execution_timeline`
- Frontend Chat Lab route lives inside the main app as `chat-lab`
- Chat Lab now includes an export-to-CSV action for the current single result or the latest batch run
- AI chat eval assets now include:
  - `docs/eval/questions.json`
  - `docs/eval/intent-questions.json`
  - `docs/eval/clarify-questions.json`

## Recent Changes

- Reworked the AI chat runtime from regex-first routing toward intent-first routing.
- Added `IntentClassifier` with structured intent output and legacy compatibility fallback when live model classification is unavailable.
- Added `clarify_required` route and clarification-question support for ambiguous prompts.
- Updated `SkillRegistry` to map intent to skill directly while keeping the old regex path only as compatibility behavior.
- Added `SkillResponseFormatter` and moved the first 3 deterministic skills toward structured facts + formatter output:
  - `seller-month-revenue`
  - `team-performance-summary`
  - `kpi-overview`
- Expanded telemetry response shape so Chat Lab and debug mode can inspect the full route chain.
- Added new prompt files:
  - `modules/ai-chat/prompts/intent-classifier.md`
  - `modules/ai-chat/prompts/skill-formatter.md`
- Added eval scripts:
  - `npm run eval:intent --workspace @crm/ai-chat-module`
  - `npm run eval:clarify --workspace @crm/ai-chat-module`
- Added frontend Chat Lab view and scenario dataset for single-run and batch-run testing.
- Added CSV export from Chat Lab so test results can be preserved without rerunning.
- Updated backend `/api/agent/chat` to accept request-level toggles for classifier and formatter.
- Hardened legacy intent inference for high-volume natural prompts:
  - top seller phrasing such as `Ai dang dan dau doanh thu thang nay?`
  - view-aware overview prompts such as `Tinh hinh chung` and `Tong quan`
  - short follow-up prompts now reuse the previous turn more broadly than only `thang X`
- Expanded the intent-classifier prompt with explicit enums, time-window rules, and few-shot examples.
- Added usage plumbing for classifier and formatter so token instrumentation can be surfaced instead of always returning zeroed placeholders.
- Added formatter guardrails so low-quality LLM replies can be rejected in favor of deterministic fallback text.
- Opened manual review UI for every Chat Lab testcase while keeping some scenarios marked as mandatory review.
- Added packaged Chat Lab review know-how and a draft repo-local skill scaffold:
  - `docs/eval/chat-lab-know-how.md`
  - `skills/chat-lab-review/SKILL.md`
- Normalized continuity and Chat Lab markdown links to repo-relative paths so docs stay portable across machines and drive letters.
- Added repo-local Chat Lab CSV artifact export flow:
  - artifact directory: `artifacts/chat-lab-exports`
  - backend export endpoint: `POST /api/agent/chat-lab/export`
  - frontend `Xuat CSV` now saves into the artifact directory instead of depending on browser download placement.
  - artifact filenames are now version-preserving: frontend includes a full UTC timestamp and backend appends `-vN` if the requested filename already exists.
- Fixed Chat Lab manual review button states so `pass`, `fail`, and `bo review` now update button colors based on the active review selection.
- Applied Chat Lab review-driven runtime fixes for groups `B` and `C`:
  - generic revenue asks such as `Doanh thu nhu the nao?` now route to `clarify_required`
  - bare summary asks such as `Tom tat cho toi` now route to `clarify_required`
  - clear multi-intent asks now route to `llm_fallback` instead of `clarify_required`
  - seller alias detection now avoids generic false positives such as `thu` / `thang`
  - team follow-up now carries team entity into `team-performance-summary`
  - operations summary now defaults to the system current month and returns a richer status/category snapshot
- Tightened Vietnamese output quality:
  - deterministic skill replies and runtime fallback strings now use Vietnamese with diacritics
  - formatter prompt now explicitly requires Vietnamese with full diacritics
  - formatter rejects low-quality replies that come back in ASCII-only Vietnamese
- Updated Chat Lab knowledge and datasets:
  - added verified entries `KH-010` to `KH-015` in `docs/eval/chat-lab-know-how.md`
  - updated `docs/eval/eval-50-chat-lab.json` so `tc12` now expects `clarify_required`
- Added a repo-local `evaluate_test` skill scaffold and first Chat Lab evaluator flow:
  - skill path: `skills/evaluate_test`
  - backend endpoint: `POST /api/agent/chat-lab/evaluate`
  - evaluator reads `docs/eval/chat-lab-know-how.md` on each request and returns a recommendation layer, summary, and matched `KH-xxx` entries
  - Chat Lab now has a `Bat Evaluate_test` checkbox and an evaluator recommendation box beside manual review
  - evaluator output is cached locally in the frontend and included in CSV export columns
- Applied the next Chat Lab hardening pass from the reviewed CSV artifacts:
  - upgraded deterministic skill wording for `seller-month-revenue`, `top-sellers-period`, `kpi-overview`, `renew-due-summary`, `operations-status-summary`, `team-performance-summary`, and `conversion-source-summary`
  - added deterministic skill `revenue-trend-analysis` for trend / anomaly / why-revenue asks
  - added compound deterministic orchestration for clear 2-domain asks that map to two existing skills
  - updated Chat Lab eval dataset so `tc16`, `tc18`, `tc19`, and `tc20` now reflect the hardened expected behavior
  - chat widget token/cost footer now renders as `[... token | ~... đ]`

## Validation

- `npm run test --workspace @crm/ai-chat-module` passed with 21/21 tests after adding route regressions for top-sellers, dashboard overview, renew overview, explicit month comparison, and system-month semantics.
- `npm run eval --workspace @crm/ai-chat-module` passed for 23/23 automated route cases and 2/2 legacy parity smoke cases.
- `npm run eval:intent --workspace @crm/ai-chat-module` passed for the current intent eval dataset.
- `npm run eval:clarify --workspace @crm/ai-chat-module` is currently blocked by a local SQLite `database is locked` condition in this workspace, not by a code assertion failure.
- `npm run lint --workspace @crm/frontend` passed after adding Chat Lab.
- `npm run build --workspace @crm/frontend` passed after adding Chat Lab.
- `npm run check` passed.
- `rg -n "/d:/CRM/crm-dashboard-app-local|\\(\\/d:/CRM/crm-dashboard-app-local" docs skills code_audit_ai_chat.md sub_plan.md PLAN.md sub_plan_v2_scoring.md plan_v2_review.md` returned no matches after normalizing markdown links to repo-relative paths.
- `npm run lint --workspace @crm/frontend` passed after wiring Chat Lab CSV export to repo-local artifacts.
- `npm run build --workspace @crm/frontend` passed after wiring Chat Lab CSV export to repo-local artifacts.
- `npm run lint --workspace @crm/frontend` passed after fixing Chat Lab manual review button state styling.
- `npm run lint --workspace @crm/frontend` passed after making Chat Lab CSV artifact exports version-preserving.
- `npm run test --workspace @crm/ai-chat-module` passed with 26/26 tests after applying Chat Lab review fixes for groups `B` and `C`.
- Spot-check via `node --experimental-sqlite -` confirmed:
  - `tc11` -> `clarify_required`
  - `tc12` -> `clarify_required`
  - `tc13` -> `team-performance-summary` with `Team Fire`
  - `tc15` -> richer `operations-status-summary` snapshot for `04/2026`
- Spot-check via `node --experimental-sqlite -` also confirmed `tc16`, `tc18`, `tc19`, and `tc20` now route to `llm_fallback` under legacy routing; final analytical answer quality still depends on valid model API keys in the local environment.
- `npm run lint --workspace @crm/frontend` passed after wiring the `Evaluate_test` checkbox, recommendation box, and CSV export fields into Chat Lab.
- `npm run build --workspace @crm/frontend` passed after wiring the `Evaluate_test` flow into Chat Lab.
- `node --check apps/backend/src/index.js` passed after adding the Chat Lab evaluator endpoint.
- `node --check apps/backend/src/lib/chat-lab-evaluator.js` passed after adding the know-how-driven evaluator module.
- Smoke check via `node --input-type=module -` confirmed `tc12-generic-summary` is evaluated as a route failure with matched know-how `KH-010`.
- `npm run test --workspace @crm/ai-chat-module` passed with 29/29 tests after adding deterministic trend analysis, compound multi-skill orchestration, and narrower business wording for renew / operations / seller / team skills.
- `npm run lint --workspace @crm/frontend` passed after updating the widget token + cost footer format.
- `npm run build --workspace @crm/frontend` passed after the widget token + cost footer format update.
- Spot-check via `node --experimental-sqlite --input-type=module -` confirmed:
  - `tc03` now answers top seller directly in Vietnamese with diacritics
  - `tc06` no longer dumps sample renew accounts by default
  - `tc07` answers only `Active` and `Ghost` instead of the full operations snapshot
  - `tc16` now returns one compound reply from two deterministic skills
  - `tc18` now stays on `team-performance-summary`
  - `tc19` now uses the last 6 closed months and flags `01/2026` as the outlier low month
  - `tc20` now quantifies the revenue drop and points to lead / conversion / team deltas before suggesting drill-down

## Open Issues

- Live classifier, live formatter, and fallback quality still depend on valid model API keys; without them the runtime falls back to legacy intent rules and template formatting.
- Only the first 3 representative deterministic skills have been migrated to structured facts + formatter flow; the remaining skills still rely mostly on legacy reply shaping.
- Several richer intents still fall through to `llm_fallback`, including customer lookup, lead geography, cohort summary, and custom analytical queries.
- Group `C` trend / causal revenue cases no longer need `llm_fallback`, but broader customer / geography / cohort analytics still do.
- Frontend per-view selected filters are still not fully wired into the production widget; Chat Lab can send explicit filters but the normal widget still depends mostly on `viewId`.
- `npm audit` still reports dependency risk and has not been addressed in this round.

## Next Steps

- Expand structured-facts + formatter migration to the remaining deterministic skills.
- Add more real beta prompts to the intent and clarify eval datasets.
- Decide whether the frontend production widget should expose a lighter version of the new debug metadata or keep that visibility exclusive to Chat Lab.
- Extend intent coverage or dedicated skills for:
  - customer lookup
  - lead geography
  - cohort summary
  - richer team/source drill-down
- Continue the next Chat Lab review batch from groups `D` onward, using `artifacts/chat-lab-exports/` as the source of reviewed CSV artifacts and appending only verified lessons to `docs/eval/chat-lab-know-how.md`.
- Decide whether `evaluate_test` should remain heuristic-only or later upgrade to an LLM-backed reviewer once enough know-how coverage exists for groups `E` onward.
- Keep `docs/ai-chat-architecture.md` and `sub_plan.md` aligned with the actual runtime as Round 1 hardening continues.
