# Round 1 Implemented: Intent-first AI Chat + Chat Lab

## Summary

Round 1 has been implemented around 4 concrete upgrades:

1. Intent-first routing in the AI chat runtime
2. `clarify_required` route for ambiguous asks
3. Skill response formatting for the first 3 representative deterministic skills
4. A dedicated frontend `chat-lab` route for testcase-driven inspection

The runtime now follows this high-level flow:

`normalizeMessages -> buildRequestContext -> IntentClassifier -> Intent Router -> skill | clarify_required | llm_fallback`

If the route is `skill`, the runtime executes deterministic SQL and then applies a skill formatter when enabled.

If the live classifier is unavailable, the runtime degrades to a legacy intent fallback path and records that in debug metadata.

## Implemented Changes

### Runtime and routing

- Added structured intent output with:
  - `primary_intent`
  - `action`
  - `metric`
  - `dimension`
  - `entities`
  - `time_window`
  - `output_mode`
  - `ambiguity_flag`
  - `clarification_question`
  - `confidence`
- Added request-level toggles:
  - `use_intent_classifier`
  - `use_skill_formatter`
- Added route:
  - `clarify_required`
- Locked thresholds:
  - `ambiguity_flag = true` -> `clarify_required`
  - `confidence >= 0.85` -> `skill` when a skill exists for the intent
  - `0.50 <= confidence < 0.85` -> `clarify_required`
  - `confidence < 0.50` -> `llm_fallback`
  - `custom_analytical_query` -> `llm_fallback`
- Added compatibility fallback:
  - classifier fail / invalid JSON / timeout -> legacy intent rules

### Skill routing and formatting

- Intent-to-skill mapping is now explicit for the current deterministic catalog.
- `SkillRegistry` can route from intent directly instead of relying only on regex-first `canHandle()`.
- Added `SkillResponseFormatter` for the first 3 migrated skills:
  - `seller-month-revenue`
  - `team-performance-summary`
  - `kpi-overview`
- These 3 skills now expose structured facts for formatting instead of only relying on hardcoded final reply strings.
- Formatter falls back safely to deterministic reply text if model formatting is unavailable.

### Prompts and debug payload

- `PromptRegistry` is now split by purpose:
  - intent classifier prompt
  - skill formatter prompt
  - fallback prompt
- Added prompt files:
  - `modules/ai-chat/prompts/intent-classifier.md`
  - `modules/ai-chat/prompts/skill-formatter.md`
- Debug payload now includes:
  - `intent`
  - `intent_source`
  - `intent_confidence`
  - `ambiguity_flag`
  - `clarification_question`
  - `matched_skill_candidates`
  - `fallback_reason`
  - `formatter_source`
  - `execution_timeline`

### Chat Lab

- Added a dedicated frontend route: `chat-lab`
- Chat Lab supports:
  - scenario selection
  - single testcase run
  - batch run
  - route/intention scoring
  - execution timeline view
  - reasoning snapshot
  - SQL inspector
  - expected vs actual reply comparison
- Chat Lab uses the same `/api/agent/chat` endpoint with `debug=true` and request-level toggles.

## Evaluation and Verification

### Commands

- `npm run check`
- `npm run test --workspace @crm/ai-chat-module`
- `npm run eval --workspace @crm/ai-chat-module`
- `npm run eval:intent --workspace @crm/ai-chat-module`
- `npm run eval:clarify --workspace @crm/ai-chat-module`
- `npm run lint --workspace @crm/frontend`
- `npm run build --workspace @crm/frontend`

### Current status

- AI chat runtime test suite: passing
- Route eval suite: passing
- Intent eval suite: passing
- Clarify eval suite: passing
- Frontend type-check: passing
- Frontend production build: passing

## Remaining Gaps

- Live classifier and live formatter still require valid model API keys; otherwise the runtime falls back to legacy intent rules and deterministic templates.
- Only 3 deterministic skills have been migrated to structured facts + formatter flow so far.
- Customer lookup, lead geography, cohort summary, and richer custom analytical asks still go through fallback.
- Production widget still does not expose the full testing/debug surface; that remains intentionally isolated in Chat Lab.
