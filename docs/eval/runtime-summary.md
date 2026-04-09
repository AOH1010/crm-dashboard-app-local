# AI Chat Runtime Summary

## Scope

- Replaced the old monolithic chat runtime with a hybrid prompt + skills runtime under `modules/ai-chat/src/`.
- Kept the legacy runtime at `modules/ai-chat/src/server/legacy-agent-chat.js` for baseline and parity checks.
- Preserved the public `/api/agent/chat` contract while adding optional beta metadata fields.

## Implemented

- `PromptRegistry` loading prompt fragments from `modules/ai-chat/prompts/`
- `SkillRegistry` loading manifests from `modules/ai-chat/skills/`
- `SQLiteConnector` with canonical table names and schema registry config
- New runtime orchestration in `modules/ai-chat/src/runtime/chat-runtime.js`
- LLM fallback route in `modules/ai-chat/src/runtime/fallback-llm.js`
- Long-prompt routing analysis that condenses `routingQuestion` for skill matching and avoids forcing one deterministic skill on multi-intent prompts
- Deterministic V1 skills:
  - `seller-month-revenue`
  - `top-sellers-period`
  - `kpi-overview`
  - `compare-periods`
  - `renew-due-summary`
  - `operations-status-summary`
  - `conversion-source-summary`
  - `team-performance-summary`

## Validation Run

- `npm run lint --workspace @crm/frontend`
  - Passed
- `npm run test --workspace @crm/ai-chat-module`
  - Passed, 12/12 tests
- `npm run eval --workspace @crm/ai-chat-module`
  - Automated new-runtime eval cases: 23/23 matched expected route + skill
  - Legacy parity smoke cases: 2/2 returned valid replies
- `npm run check`
  - Passed
- Manual fallback smoke
  - Query: "Cho toi bang 5 don hang moi nhat"
  - Result: `route=llm_fallback`, non-empty reply, `sqlLogCount=2`, no error

## Notes

- The new runtime is already cut over via `modules/ai-chat/src/server/agent-chat.js`.
- Conversion source summary and team performance summary are now deterministic.
- Long prompts with one dominant intent can still hit deterministic skills; long prompts with multiple competing intents prefer fallback.
- Richer questions such as lead geography, cohort summary, detailed customer lookup, and custom drill-downs still use LLM fallback.
- Debug metadata is available in API responses and can be shown in the widget when `localStorage.crmAgentDebug` is set to `"true"`.
