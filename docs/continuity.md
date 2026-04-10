# Continuity

## Required Reading

Agent moi vao repo nay, sau khi doc file nay, phai doc tiep theo dung thu tu:

1. [docs/ai-chat-architecture.md](/d:/CRM/crm-dashboard-app-local/docs/ai-chat-architecture.md)
   - Doc de hieu runtime AI chat dang van hanh nhu the nao.
2. [docs/eval/chat-lab-testing-guide.md](/d:/CRM/crm-dashboard-app-local/docs/eval/chat-lab-testing-guide.md)
   - Doc neu cong viec lien quan den Chat Lab, testcase, batch run, scorer, manual review, export CSV.
3. [docs/eval/chat-lab-know-how.md](/d:/CRM/crm-dashboard-app-local/docs/eval/chat-lab-know-how.md)
   - Doc neu can triage testcase fail, manual review fail, hoac sua runtime theo feedback test.
4. [code_audit_ai_chat.md](/d:/CRM/crm-dashboard-app-local/code_audit_ai_chat.md)
   - Doc neu cong viec lien quan den huong sua theo audit, debt hien tai, va cac diem yeu da duoc doi chieu voi code.
5. [sub_plan.md](/d:/CRM/crm-dashboard-app-local/sub_plan.md)
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

## Validation

- `npm run test --workspace @crm/ai-chat-module` passed with 21/21 tests after adding route regressions for top-sellers, dashboard overview, renew overview, explicit month comparison, and system-month semantics.
- `npm run eval --workspace @crm/ai-chat-module` passed for 23/23 automated route cases and 2/2 legacy parity smoke cases.
- `npm run eval:intent --workspace @crm/ai-chat-module` passed for the current intent eval dataset.
- `npm run eval:clarify --workspace @crm/ai-chat-module` is currently blocked by a local SQLite `database is locked` condition in this workspace, not by a code assertion failure.
- `npm run lint --workspace @crm/frontend` passed after adding Chat Lab.
- `npm run build --workspace @crm/frontend` passed after adding Chat Lab.
- `npm run check` passed.

## Open Issues

- Live classifier, live formatter, and fallback quality still depend on valid model API keys; without them the runtime falls back to legacy intent rules and template formatting.
- Only the first 3 representative deterministic skills have been migrated to structured facts + formatter flow; the remaining skills still rely mostly on legacy reply shaping.
- Several richer intents still fall through to `llm_fallback`, including customer lookup, lead geography, cohort summary, and custom analytical queries.
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
- Keep `docs/ai-chat-architecture.md` and `sub_plan.md` aligned with the actual runtime as Round 1 hardening continues.
