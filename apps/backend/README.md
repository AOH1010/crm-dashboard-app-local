# Backend App

This app owns the CRM backend runtime.

## Recommended Workflow

- Start from the repo root with `npm run dev`.
- Stop from the repo root with `npm run stop`.
- Use `npm run build:dashboard-db` from the repo root when you need to rebuild analytics marts manually.

## Responsibility

- Serve dashboard and operations APIs.
- Orchestrate sync jobs that call Python scrapers under `tasks/`.
- Bridge the API layer to `modules/ai-chat`.
- Build and read SQLite marts under `data/`.

## Boundary

- Do not add frontend UI code here.
- Keep reusable chat logic in `modules/ai-chat`.
- Keep scraping scripts in `tasks/`.
