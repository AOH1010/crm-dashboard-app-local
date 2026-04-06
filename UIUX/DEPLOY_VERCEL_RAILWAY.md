# Deploy Vercel + Railway (Sleep + GitHub Cron)

Muc tieu moi:
- `Vercel` chi host frontend React/Vite.
- `Railway` host backend API + volume SQLite, nhung bat `Serverless` de co the ngu khi khong co request.
- `GitHub Actions` danh thuc Railway moi 6 gio de chay `auto sync`.
- Frontend chay `cache-first`: mo web len se doc cache local truoc, khong auto wake backend.

## Kien truc cuoi cung

- `Vercel`: UI.
- `Railway`: backend API, AI agent, SQLite volume tai `/app/data`.
- `GitHub Actions`: cron ngoai, goi `POST /api/admin/sync` moi 6 gio.
- `crm.db`: luu tren Railway volume.
- `dashboard_sales.db`: rebuild tren cung volume sau moi lan sync.

Luot chay:
1. Railway volume trong thi backend tu seed `crm.db` tu `data/crm.db.gz`.
2. GitHub Actions goi backend `/api/admin/sync` theo lich 6 gio.
3. Backend chay `auto sync`:
   - customers incremental nhe: `lookback 6h`, `50 pages`, bo qua comments
   - orders incremental
4. Backend rebuild `dashboard_sales.db`.
5. Luc nguoi dung mo web, UI doc cache local truoc.
6. Chi khi nguoi dung bam `Load live data` hoac doi filter, frontend moi goi backend.

## 1. Railway backend

Dung service backend hien tai `crm-dashboard-app`.

Can giu cac variables:

```env
GEMINI_API_KEY=...
CRM_AGENT_MODEL=gemini-2.5-flash
GETFLY_API_KEY=...
GETFLY_BASE_URL=https://jega.getflycrm.com/
PREBUILD_DASHBOARD_DB=true
SYNC_ADMIN_TOKEN=mot_chuoi_bi_mat_rat_dai
SYNC_DEFAULT_MODE=auto
SYNC_LOOKBACK_HOURS=6
SYNC_CUSTOMER_AUTO_LIMIT_PAGES=50
SYNC_CUSTOMER_AUTO_PAGE_SIZE=100
SYNC_CUSTOMER_AUTO_WORKERS=4
CRM_DATA_DIR=/app/data
CRM_DB_PATH=/app/data/crm.db
DASHBOARD_DB_PATH=/app/data/dashboard_sales.db
```

Tat scheduler trong chinh backend de service co the ngu:

```env
SYNC_ON_BOOT=false
SYNC_INTERVAL_MINUTES=0
```

Trong Railway:
1. Attach volume vao `/app/data`
2. `Custom Start Command`: de trong, hoac `npm --prefix UIUX run start`
3. Bat `Serverless` cho service
4. Redeploy

Kiem tra:

```text
https://your-backend.up.railway.app/api/health
https://your-backend.up.railway.app/api/debug/env-status
```

`/api/debug/env-status` nen cho thay:
- `sync_enabled: true`
- `prebuild_dashboard_db: "true"`

## 2. GitHub Actions cron 6 gio

Repo da co san workflow:

```text
.github/workflows/railway-sync.yml
```

Workflow nay:
- chay moi 6 gio
- co nut `Run workflow` de ban bam tay trong GitHub
- goi `POST /api/admin/sync` voi mode mac dinh `auto`

Can them 2 secrets trong GitHub repo:

1. `Settings`
2. `Secrets and variables`
3. `Actions`
4. Them:

```text
SYNC_TRIGGER_URL=https://your-backend.up.railway.app/api/admin/sync
SYNC_ADMIN_TOKEN=gia_tri_giong_tren_Railway
```

Sau khi save secrets:
- workflow se tu chay moi 6 gio
- ban cung co the vao tab `Actions` va bam tay `Run workflow`

## 3. Frontend cache-first tren Vercel

Frontend da duoc doi hanh vi:
- `Dashboard`, `Leads`, `Conversion` doc cache `localStorage` truoc
- khong con polling moi 60 giay
- mo web len khong tu dong goi backend nua
- nut `Load live data` se wake Railway khi ban can snapshot moi

Lan dau tren trinh duyet moi:
- neu chua co cache, man hinh se bao chua co snapshot local
- luc do bam `Load live data` de tao cache dau tien

Sau moi lan sync backend:
- mo lai web van thay cache cu
- bam `Load live data` o man hinh can xem de nap du lieu moi

## 4. Manual sync tu UI

Panel `Data Sync` van giu nguyen cho admin:
- `Auto sync now`
- `Full customers`
- `Full orders`
- `Full all`

Panel nay can `SYNC_ADMIN_TOKEN` de kich tay.

Auto cron 6 gio khong can ban mo web, khong can token trong browser.

## 5. Deploy frontend Vercel

Sau khi pull code moi:

```powershell
cd "d:\Project\CRM 1\UIUX"
npx vercel --prod
```

Neu chua set:

```powershell
npx vercel env add VITE_API_BASE_URL production --value "https://your-backend.up.railway.app" --yes
```

## 6. Cach van hanh thuc te

Hang ngay:
- GitHub Actions tu dong scrape moi 6 gio
- Railway backend ngu khi khong co request
- mo web len xem cache local
- khi can so moi, bam `Load live data`

Khi can scrape day du:
- vao web
- mo `Data Sync`
- nhap `SYNC_ADMIN_TOKEN`
- bam `Full customers`, `Full orders`, hoac `Full all`

## 7. Uoc tinh do tre

Do tre cap nhat du lieu se la:
- toi da gan 6 gio cho lich cron tiep theo
- cong them thoi gian crawl thuc te
- cong them luc nguoi dung bam `Load live data`

Neu muon nhanh hon:
- giam cron tu 6 gio xuong 3 gio
- hoac bam `Auto sync now` thu cong

## 8. Bao mat

Ban da tung de lo `GEMINI_API_KEY` va co the ca `GETFLY_API_KEY` trong qua trinh setup.

Nen lam ngay:
1. Rotate `GEMINI_API_KEY`
2. Rotate `GETFLY_API_KEY`
3. Cap nhat lai Railway variables
4. Cap nhat lai bat ky noi nao dang dung key cu
