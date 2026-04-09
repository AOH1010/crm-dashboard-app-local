# Local Run Checklist

## Canonical Paths

- Frontend: `apps/frontend`
- Backend: `apps/backend`
- Data: `data/`
- Local scripts: `tools/local-development/`
- AI chat module: `modules/ai-chat`

## Preconditions

- Node.js available on PATH
- npm available on PATH
- Optional: Python available if you plan to run sync scripts later
- Repo root contains `.env` or app-level defaults are acceptable for the current task

## Safe Local Flow

1. Check local prerequisites with `verify-local-environment.ps1`.
2. Seed `data/crm.db` from `data/crm.db.gz` if the database file is missing.
3. Install workspace dependencies once at repo root when `node_modules` is absent.
4. Start the stack with `npm run dev` from repo root.
5. Open the local frontend and let Vite proxy `/api` to the local backend server.

## Notes

- The dashboard can start without AI keys as long as the AI endpoint is not exercised.
- Python is not required just to open the dashboard locally.
- `apps/frontend` is the frontend app.
- `apps/backend` is the backend app.
