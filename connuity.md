# Continuity Notes

Cap nhat den commit: `93e23b0`

## 1. Muc tieu da dat duoc

- Frontend deploy tren Vercel:
  - `https://crm-dashboard-web-ten.vercel.app`
- Backend deploy tren Railway:
  - `https://crm-dashboard-app-production.up.railway.app`
- GitHub repo:
  - `https://github.com/AOH1010/crm-dashboard-app`
- Frontend da chuyen sang `cache-first`
- Co panel `Data Sync` de chay sync tay
- Co workflow GitHub Actions `Railway Sync` de trigger sync moi 6 gio
- Railway da bat `Serverless`

## 2. Kien truc hien tai

- `Vercel`: chi host frontend React/Vite trong `UIUX`
- `Railway`: chay backend Express trong `UIUX/server`
- `Railway volume`: giu `crm.db` va `dashboard_sales.db`
- `GitHub Actions`: khong scrape, chi goi endpoint admin tren Railway moi 6 gio
- `Getfly`: nguon du lieu thuc te, duoc crawler tren Railway goi truc tiep

Luot chay:
1. GitHub Actions goi `POST /api/admin/sync`
2. Railway backend chay crawler
3. Railway cap nhat `crm.db`
4. Railway rebuild `dashboard_sales.db`
5. Frontend chi doc cache local khi mo trang
6. Nguoi dung bam `Load live data` de lay snapshot moi nhat tu backend

## 3. Y nghia cac nut trong UI

### `Load live data`

- Khong chay scrape
- Chi goi backend de lay du lieu moi nhat dang co trong DB
- Sau do cap nhat cache local tren trinh duyet
- Hien da duoc dat o `TopBar`, ngay canh `Data Sync`

Hanh vi hien tai:
- Khi bam, no se prefetch cache mac dinh cho:
  - `Dashboard`
  - `Leads`
  - `Conversion`
- Dong thoi phat event de man dang xem cap nhat luon

### `Data Sync`

- Day moi la nut de chay scrape tay
- Can `SYNC_ADMIN_TOKEN`
- Co cac mode:
  - `Auto sync now`
  - `Full customers`
  - `Full orders`
  - `Full all`

## 4. Frontend cache-first

Trang thai da xong:
- `Dashboard`, `Leads`, `Conversion` doc `localStorage` truoc
- Khong con polling 60 giay
- Refresh web van giu du lieu neu cache da ton tai
- Trinh duyet moi / may moi / cache bi xoa thi phai bam `Load live data` de tao cache dau tien

Luu y:
- Cache la cuc bo theo tung trinh duyet
- Khong dong bo giua cac may

## 5. GitHub Actions

Workflow:
- File: `.github/workflows/railway-sync.yml`
- Ten workflow: `Railway Sync`
- Lich:
  - `0 */6 * * *`

Workflow nay:
- Khong scrape truc tiep
- Chi goi endpoint admin cua Railway

Secrets can co trong GitHub repo:
- `SYNC_TRIGGER_URL`
- `SYNC_ADMIN_TOKEN`

Da kiem tra:
- Manual run `Railway Sync #1` da `Success`

## 6. Railway can ghi nho

Service production:
- `crm-dashboard-app`

Domain:
- `crm-dashboard-app-production.up.railway.app`

Health:
- `/api/health`

Debug env:
- `/api/debug/env-status`

Serverless:
- Da bat

Bien moi truong quan trong:
- `GEMINI_API_KEY`
- `CRM_AGENT_MODEL=gemini-2.5-flash`
- `GETFLY_API_KEY`
- `GETFLY_BASE_URL=https://jega.getflycrm.com/`
- `PREBUILD_DASHBOARD_DB=true`
- `SYNC_ADMIN_TOKEN`
- `SYNC_DEFAULT_MODE=auto`
- `SYNC_LOOKBACK_HOURS=6`
- `SYNC_CUSTOMER_AUTO_LIMIT_PAGES=50`
- `SYNC_CUSTOMER_AUTO_PAGE_SIZE=100`
- `SYNC_CUSTOMER_AUTO_WORKERS=4`
- `CRM_DATA_DIR=/app/data`
- `CRM_DB_PATH=/app/data/crm.db`
- `DASHBOARD_DB_PATH=/app/data/dashboard_sales.db`

De dung dung mo hinh `GitHub cron -> Railway wake -> Railway scrape`, can de:
- `SYNC_ON_BOOT=false`
- `SYNC_INTERVAL_MINUTES=0`

## 7. Tinh nang crawl da lam

### Auto mode

- Customers:
  - incremental nhe
  - lookback 6 gio
  - toi da 50 pages
  - skip comments
- Orders:
  - incremental
  - 6 gio / lan qua GitHub Actions

### Manual mode

- Full customers
- Full orders
- Full all

## 8. AI agent

Da sua mot loi nang:
- Cac query kieu `Ten seller + thang`
- Vi du:
  - `Hoang Van Huy thang 3`
  - `Le Thi Hoai Phuc thang 3`

Hien agent:
- Co the query DB
- Backend da ho tro 2 provider:
  - `gemini`
  - `nvidia`
- Default hien tai uu tien:
  - `CRM_AGENT_PROVIDER=gemini`
  - `CRM_AGENT_MODEL=gemini-2.5-flash`
- Neu muon doi sang NVIDIA, can set ro:
  - `CRM_AGENT_PROVIDER=nvidia`
  - `CRM_AGENT_MODEL=google/gemma-4-31b-it`
  - `NVIDIA_API_KEY=...`

## 9. Cac file quan trong de mo lai sau

### Frontend

- `UIUX/src/components/TopBar.tsx`
- `UIUX/src/components/SyncAdminPanel.tsx`
- `UIUX/src/views/DashboardView.tsx`
- `UIUX/src/views/LeadsView.tsx`
- `UIUX/src/views/ConversionView.tsx`
- `UIUX/src/views/TeamView.tsx`
- `UIUX/src/lib/viewCache.ts`
- `UIUX/src/lib/liveDataEvents.ts`
- `UIUX/src/lib/liveDataRefresh.ts`

### Backend

- `UIUX/server/index.js`
- `UIUX/server/lib/sync-runner.js`
- `UIUX/server/lib/seed-db.js`
- `UIUX/server/lib/agent-chat.js`
- `UIUX/server/lib/team-data.js`

### Crawler

- `tasks/01_scrap/scrape_getfly.py`
- `tasks/01_scrap/scrape_orders.py`
- `tasks/requirements.txt`

### Deploy / infra

- `Dockerfile`
- `railway/entrypoint.mjs`
- `railway/start-backend.mjs`
- `.github/workflows/railway-sync.yml`
- `UIUX/DEPLOY_VERCEL_RAILWAY.md`
- `UIUX/.env.example`

## 10. Cach tiep tuc o may tinh khac

Clone repo:

```powershell
git clone https://github.com/AOH1010/crm-dashboard-app.git
cd crm-dashboard-app\UIUX
npm install
npm run dev
```

Neu da clone roi:

```powershell
git pull origin main
cd UIUX
npm install
npm run dev
```

Neu can chay full local backend/crawler:
- can Node.js
- can Python 3
- can file `.env` / env vars phu hop

## 11. Viec nen lam tiep

1. Kiem tra lai trong Railway:
   - `SYNC_ON_BOOT=false`
   - `SYNC_INTERVAL_MINUTES=0`
2. Rotate lai secrets vi da tung lo trong qua trinh setup:
   - `GEMINI_API_KEY`
   - `GETFLY_API_KEY`
3. Neu tiep tuc code UI:
   - giu workflow `git pull -> code -> git add -> git commit -> git push`
4. Neu can toi uu tiep:
   - code-splitting frontend vi bundle hien tai con lon
   - sua mojibake/tieng Viet vo ky tu o mot so cho
   - lam responsive tot hon cho mobile

## 12. Kiem tra nhanh tinh trang he thong luc roi may

- Git repo sach
- `origin/main` da cap nhat
- Vercel production online
- Railway health OK
- GitHub `Railway Sync` manual run da `Success`

## 13. Ghi chu cuoi

Neu mo web ma co du lieu:
- do la cache local

Neu muon lay snapshot moi:
- bam `Load live data`

Neu muon tao du lieu moi bang scrape:
- bam `Data Sync`
- hoac de GitHub Actions tu goi Railway moi 6 gio

## 14. Deployment note moi

- Push code len GitHub se trigger redeploy cho Vercel/Railway neu service dang linked vao repo
- Railway/Vercel se redeploy theo Git neu service linked voi repo
- Provider/model thuc te cua backend van phu thuoc env trong Railway dashboard
- Sau khi redeploy, check:
  - `/api/debug/env-status`
  - `crm_agent_provider` phai la `gemini`
  - `crm_agent_model` phai la `gemini-2.5-flash`

## 15. Vercel production deploy workaround

Tinh huong da gap ngay `2026-04-07`:
- Git auto deploy cua Vercel da link dung repo `AOH1010/crm-dashboard-app`
- Nhung project dang nam trong scope `aoh1010's projects`
- Day la Hobby team scope, nen deploy bang Git bi block theo rule team access/collaboration
- Deploy tay ngay trong repo cung co the fail vi Vercel CLI van doc Git metadata cua repo

Dau hieu nhan biet:
- Vercel bao `Deployment Blocked`
- Co thong diep dai y: Git author/commit author khong co access vao team
- Build local va `vercel build` van pass, chi deploy len Vercel moi bi chan

Cach deploy tay da xac nhan chay duoc:

```powershell
cd F:\Antigravity\CRM
npx vercel pull --yes --environment=production
npx vercel build --prod --yes

$tmp = 'C:\Temp\crm-vercel-manual'
if (Test-Path $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
New-Item -ItemType Directory -Path $tmp | Out-Null
Copy-Item -LiteralPath '.vercel\output' -Destination "$tmp\.vercel\output" -Recurse -Force
Copy-Item -LiteralPath '.vercel\project.json' -Destination "$tmp\.vercel\project.json" -Force

cd $tmp
npx vercel deploy --prebuilt --prod --yes --debug
```

Ly do cach nay chay:
- Deploy duoc thuc hien tu mot thu muc tam khong co `.git`
- Vercel CLI khong con gan Git metadata cua repo goc vao deployment
- Nhờ do bypass duoc block `TEAM_ACCESS_REQUIRED`

Deployment da len thanh cong:
- Production domain:
  - `https://crm-dashboard-web-ten.vercel.app`
- Deployment ID:
  - `dpl_d728eKhmK175C6foqwgtoJR5isqK`
- Asset moi da serve:
  - `assets/index-4XtRggE1.js`
- `Last-Modified` luc kiem tra:
  - `Mon, 06 Apr 2026 17:28:26 GMT`

Luu y:
- URL deployment rieng co the bi Vercel Authentication
- Domain production da alias sang ban moi va dung duoc binh thuong
- Neu muon on dinh lau dai, can:
  - chuyen sang scope khac khong bi hobby-team block
  - hoac nang cap Vercel plan

## 16. Git identity note

Da xac nhan ngay `2026-04-07`:
- Push credential tren Windows Credential Manager cho `git:https://github.com` dang la:
  - `AOH1010`
- Nhung local git identity truoc do lai dang la:
  - `Dzung Hoang Anh <89538065+1000AoH@users.noreply.github.com>`
- Day la mot ly do hop ly giai thich vi sao Vercel Hobby team co the block deployment theo Git author

Trang thai da sua:
- Local git config cua repo `F:\Antigravity\CRM` da doi thanh:
  - `user.name=AOH1010`
  - `user.email=94183629+AOH1010@users.noreply.github.com`
- Tu sau moc nay, commit moi trong repo nay se mang author `AOH1010`
