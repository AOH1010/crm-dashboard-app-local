# Continuity

## Current Objective

- Ship the V1 AI chat core refactor as a hybrid prompt + skills runtime for a limited beta while keeping the existing `/api/agent/chat` contract and current widget intact.
- Preserve a clean local workflow so frontend, backend, and AI chat can still be started and verified from the repo root.

## Current State

- Frontend app: `apps/frontend`
- Backend app: `apps/backend`
- AI chat module: `modules/ai-chat`
- Data/scrape pipeline: `tasks`
- Active AI chat refactor target: `modules/ai-chat`
- Runtime source of truth for V1: local SQLite databases under `data/`
- Legacy chat baseline kept at `modules/ai-chat/src/server/legacy-agent-chat.js`
- New runtime entrypoint: `modules/ai-chat/src/runtime/chat-runtime.js`
- Prompt files live under `modules/ai-chat/prompts`
- Skill manifests live under `modules/ai-chat/skills`
- Connector config lives at `modules/ai-chat/config/schema-registry.json`
- Deterministic skill coverage now includes dashboard, team, renew, operations, and conversion source summary flows
- Local verification: `npm run check`
- Local start: `npm run dev`
- Local stop: `npm run stop`
- Local cleanup: `npm run clean`

## Recent Changes

- Finalized and stored the V1 AI chat refactor spec in `PLAN.md`.
- Chose a hard-reset internal refactor for `modules/ai-chat` while preserving the current API route and frontend widget.
- Decided V1 will use hybrid prompt files + skill manifests + code handlers, with no cloud DB or MCP runtime yet.
- Preserved the pre-refactor chat runtime at `modules/ai-chat/src/server/legacy-agent-chat.js` for baseline and parity testing.
- Added a new hybrid runtime with `PromptRegistry`, `SkillRegistry`, `SQLiteConnector`, telemetry, canonical table mapping, and LLM fallback under `modules/ai-chat/src/`.
- Added initial V1 skills: seller month revenue, top sellers period, KPI overview, compare periods, renew due summary, and operations status summary.
- Added deterministic `conversion-source-summary` and `team-performance-summary` skills to reduce fallback usage for conversion and team beta flows.
- Added long-prompt routing analysis so skill matching now uses a condensed `routingQuestion`, and multi-intent prompts prefer fallback instead of forcing the first keyword match.
- Fixed frontend chat table rendering so plain numeric cells such as `revenue_amount` are formatted with `vi-VN` thousands separators instead of showing raw ungrouped digits.
- Fixed frontend debug-mode syncing so `localStorage.crmAgentDebug = "true"` is picked up without needing a full page reload; the widget now refreshes the flag on focus and on each submit.
- Tightened seller-name detection so short unique aliases like `Huy` resolve to the correct seller without misrouting generic prompts such as `Team nao dang dan dau doanh thu?`.
- Added prompt fragments under `modules/ai-chat/prompts/`, schema registry config under `modules/ai-chat/config/`, and eval questions under `docs/eval/questions.json`.
- Extended `/api/agent/chat` to accept optional `selected_filters`, `session_id`, and `debug`, while remaining backward compatible.
- Extended frontend agent API typing and widget debug support without changing the current widget entrypoint.
- Added `docs/ai-chat-architecture.md` as the high-level architecture and long-prompt handling reference for the AI chat runtime.

## Validation

- Read `skills/continuity/SKILL.md` and `docs/continuity.md` before starting substantial work.
- Audited current AI chat/backend/frontend entrypoints and confirmed the existing `/api/agent/chat` flow remains the compatibility target.
- Captured the current chat runtime into `modules/ai-chat/src/server/legacy-agent-chat.js` for later parity checks.
- `npm run lint --workspace @crm/frontend` passed.
- `npm run test --workspace @crm/ai-chat-module` passed with 12/12 tests after adding long-prompt routing coverage.
- `npm run eval --workspace @crm/ai-chat-module` still passed for 23/23 automated new-runtime eval cases and 2/2 legacy baseline smoke cases after the long-prompt routing patch.
- `npm run check` still passed after the long-prompt routing patch and architecture documentation update.
- `npm run lint --workspace @crm/frontend` passed after the frontend table-number formatting fix.
- `npm run lint --workspace @crm/frontend` passed after the frontend debug-sync fix.
- `npm run test --workspace @crm/ai-chat-module` passed with 13/13 tests after the seller-alias routing fix.
- Direct local API verification for `doanh thu Huy thang 1` returned `route=skill`, `skill_id=seller-month-revenue`, and `total_tokens=0`.
- Smoke-tested a fallback request via the new runtime and confirmed `route=llm_fallback`, `hasReply=true`, and non-empty SQL logs.

## Open Issues

- `UIUX` still appears in the worktree as historical/deleted content and may remain on disk until Windows releases handles.
- `npm audit` still reports dependency risk; no dependency-upgrade pass has been done yet.
- Frontend debug mode is hidden behind `localStorage.crmAgentDebug === "true"` and selected view filters are not yet wired from individual views.
- The fallback route still depends on configured model API keys for non-skill questions.
- Several richer questions still rely on fallback, including lead geography, cohort summaries, detailed customer lookup, and custom team/source drill-downs.
- Prompt routing is safer for long prompts now, but V1 still does not split one long user request into multiple deterministic sub-tasks.
- The worktree contains many unrelated historical deletions from earlier repo restructuring; avoid treating that repo-wide diff as part of the AI chat refactor.

## Next Steps

- Expand deterministic skill coverage next for lead geography, richer conversion drill-downs, cohort-active summary, and customer/order lookup if beta traffic shows those intents are frequent.
- If long analytical prompts become common, consider a small intent-extraction layer before skill routing or a clarifying-question path for multi-intent requests.
- Decide whether to remove or archive the legacy runtime once the team is comfortable with the new parity baseline.
- If selected filters become important for accuracy, wire current dashboard/view filters into `CrmAgentWidget`.
- Keep `docs/continuity.md` updated as AI chat moves from limited beta hardening toward V2 connector and deployment work.
