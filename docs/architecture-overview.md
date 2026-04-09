# Project Structure

## Canonical Layout

- `apps/frontend/`
  - Frontend-only application.
  - Owns React views, client-side cache, layout, and API client calls.
- `apps/backend/`
  - Backend runtime application.
  - Owns dashboard API, operations API, sync orchestration, and SQLite marts.
- `modules/ai-chat/`
  - Extracted AI chat engine and prompt layer.
  - Backend integration should stay thin and reversible.
- `tasks/`
  - Data ingestion and sync pipeline.
  - Kept in place for now to avoid breaking existing SQLite workflows.
- `tools/local-development/`
  - Deterministic local scripts for validation and localhost startup.
- `skills/`
  - Repo-local operational skills for repeatable workflows.
- `data/`
  - Local SQLite artifacts and seed archives.
- `docs/continuity.md`
  - Shared handoff log for agents working in this repository.

## Transition Rule

- `apps/frontend` is the frontend target path.
- `apps/backend` is the backend target path.
- New architectural work should prefer `modules/*` over `apps/backend/src/lib/*` when the concern is reusable platform logic.

## Practical Boundary

- Frontend work: stay in `apps/frontend` and consume stable APIs only.
- Backend work: stay in `apps/backend` and orchestrate data access, sync, and chat adapters.
- AI chat work: evolve in `modules/ai-chat` first, then expose a narrow adapter back into the backend.
- Data pipeline work: stay under `tasks/` until a dedicated pipeline refactor is planned.
