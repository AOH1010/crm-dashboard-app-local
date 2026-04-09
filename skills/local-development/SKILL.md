---
name: local-development
description: Start, validate, and troubleshoot this CRM repository on localhost after the repo restructure. Use when Codex needs to run the frontend and backend locally, verify required files and env, seed the local SQLite database from `data/crm.db.gz`, or follow the project-safe local workflow without touching removed hosting infrastructure.
---

# CRM Local Dev

Use the repo-local scripts instead of improvising commands.

## Workflow

1. Run `tools/local-development/verify-local-environment.ps1` from repo root.
2. Fix any blocking issue it reports.
3. Run `tools/local-development/start-local-environment.ps1` from repo root.
4. Treat `apps/frontend` as the frontend-only app path.
5. Treat `apps/backend` as the API runtime path.
6. Pair this skill with `continuity` for any substantial repo work so `docs/continuity.md` stays current.

## Guardrails

- Do not reintroduce hosting-specific settings while solving localhost issues.
- Do not move frontend code out of `apps/frontend`.
- Do not move backend code out of `apps/backend`.
- Keep SQLite data under `data/` unless the user explicitly changes env paths.
- If `data/crm.db` is missing and `data/crm.db.gz` exists, seed from the gzip archive first.
- Prefer checking local prerequisites before editing application code.

## Commands

```powershell
powershell -ExecutionPolicy Bypass -File .\tools\local-development\verify-local-environment.ps1
powershell -ExecutionPolicy Bypass -File .\tools\local-development\start-local-environment.ps1
```

## References

- For the local run checklist: `references/local-run.md`
