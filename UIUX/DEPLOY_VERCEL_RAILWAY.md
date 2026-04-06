# Deploy Vercel + Railway

Muc tieu hien tai:
- `Vercel` chi chay frontend React/Vite.
- `Railway` chay backend API va giu `crm.db` trong volume persistent.
- Crawler khong con dua DB moi len Git.
- Railway cron/trigger se goi backend tu sync Getfly truc tiep vao volume.

## Kien truc muc 2

- `Vercel`: giao dien web.
- `Railway service 1`: backend API, AI agent, SQLite volume.
- `Railway service 2`: cron trigger, chi goi `POST /api/admin/sync`.
- `crm.db`: nam trong volume `/app/data`.
- `dashboard_sales.db`: duoc backend build lai tren cung volume sau moi lan sync.

Luot chay:
1. Volume trong thi backend tu seed `crm.db` tu `data/crm.db.gz`.
2. Backend nghe `/api/admin/sync` va tu chay crawler Python tren chinh host Railway.
3. Crawler cap nhat `crm.db`, sau do build lai `dashboard_sales.db`.
4. Frontend refetch du lieu moi tu backend.

## 1. Railway backend service

Repo da co san:
- `Dockerfile` cai Node + Python.
- `railway/start-backend.mjs` de seed volume neu can.
- `UIUX/server/lib/sync-runner.js` de trigger sync.

Trong Railway:
1. Dung service backend hien tai `crm-dashboard-app`.
2. Attach volume vao mount path: `/app/data`
3. O `Settings`, nen de `Custom Start Command` trong hoac dat:

```text
node railway/start-backend.mjs
```

4. Set variables cho backend:

```env
GEMINI_API_KEY=...
CRM_AGENT_MODEL=gemini-2.5-flash
GETFLY_API_KEY=...
GETFLY_BASE_URL=https://jega.getflycrm.com/
PREBUILD_DASHBOARD_DB=true
SYNC_ADMIN_TOKEN=mot_chuoi_bi_mat_rat_dai
SYNC_DEFAULT_MODE=incremental
SYNC_LOOKBACK_HOURS=24
CRM_DATA_DIR=/app/data
CRM_DB_PATH=/app/data/crm.db
DASHBOARD_DB_PATH=/app/data/dashboard_sales.db
```

5. Redeploy backend.

Kiem tra:

```text
https://your-backend.up.railway.app/api/health
https://your-backend.up.railway.app/api/debug/env-status
```

## 2. Trigger sync service tren Railway

Tao them mot service moi tu cung repo, vi du `crm-sync-trigger`.

Service nay:
- khong can public domain
- khong can volume
- chi can `Custom Start Command`:

```text
node railway/run-sync-trigger.mjs
```

Variables:

```env
SYNC_TRIGGER_URL=https://your-backend.up.railway.app/api/admin/sync
SYNC_ADMIN_TOKEN=giong_backend
SYNC_TRIGGER_MODE=incremental
SYNC_TRIGGER_SOURCE=railway-cron
```

Sau do bat `Cron` cho service nay theo lich ban muon.

Vi du:
- moi 30 phut: `*/30 * * * *`
- moi 1 gio: `0 * * * *`

## 3. Endpoint quan tri sync

Backend da co san 2 endpoint moi:

- `GET /api/admin/sync/status`
- `POST /api/admin/sync`

Request trigger:

```bash
curl -X POST "https://your-backend.up.railway.app/api/admin/sync" \
  -H "Authorization: Bearer YOUR_SYNC_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"mode\":\"incremental\",\"trigger\":\"manual\"}"
```

Request status:

```bash
curl "https://your-backend.up.railway.app/api/admin/sync/status" \
  -H "Authorization: Bearer YOUR_SYNC_ADMIN_TOKEN"
```

## 4. Deploy frontend Vercel

Frontend van giong truoc:

```powershell
cd "d:\Project\CRM 1\UIUX"
npx vercel env add VITE_API_BASE_URL production --value "https://your-backend.up.railway.app" --yes
npx vercel --prod
```

## 5. Hanh vi cap nhat du lieu

Sau khi muc 2 da xong:
- ban khong can nen lai `crm.db.gz` moi lan crawl
- ban khong can commit data moi len Git
- Railway backend se tu cap nhat `crm.db` trong volume
- UI se thay data moi o lan refetch tiep theo

Repo chi can push khi:
- sua giao dien
- sua backend
- sua crawler

## 6. Muc do gan real-time

Hien tai frontend dang refetch du lieu moi moi 60 giay o cac view chinh.

Do tre thuc te se la:
- thoi gian crawler lay du lieu tu Getfly
- thoi gian build lai `dashboard_sales.db`
- toi da khoang 60 giay de frontend tu refetch

Neu can nhanh hon nua:
- giam cron interval
- giam front-end polling
- hoac them WebSocket/SSE o buoc sau
