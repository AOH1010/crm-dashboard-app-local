# Round 1 Handoff

Cap nhat den commit gan nhat truoc khi ngu:
- `376aadb` `Optimize operations sync with CSV imports`

## 1. Da xong trong round 1

### Sales side
- Dashboard, Conversion, Leads, Team da co data that tren local.
- Team view da co:
  - filter theo date range
  - card team + member breakdown
  - trend month/week
  - legend toggle tren chart
- Vercel frontend live da deploy duoc.

### Operations side
- Da chot flow du lieu tu Google Sheet vao SQLite analytics rieng:
  - `data/dashboard_operations.db`
- Da implement 4 view van hanh:
  - `User Map`
  - `Active Map`
  - `Cohort Active User`
  - `Renew`
- Da them backend API:
  - `/api/operations/user-map`
  - `/api/operations/active-map`
  - `/api/operations/cohort-active`
  - `/api/operations/renew`
- Da mo rong AI chat backend de co the query `operations.*` tables khi DB ton tai.

## 2. Sync operations hien tai

Script:
- [sync_operations_workbook.py](/f:/Antigravity/CRM/tasks/01_scrap/sync_operations_workbook.py)

Huong xu ly moi:
1. Download CSV tung sheet can dung tu Google Sheets
2. Parse:
   - `Activation`
   - `JCD hết hạn`
   - `Raw Data`
   - `Check_Active`
   - `Check_Categories`
   - `Definition`
3. Build `dashboard_operations.db`
4. Xoa file tam

Log da doi thanh ro hon:
- `downloaded workbook`
- `parsed activation`
- `parsed raw data`
- `building sqlite`
- `completed`

Ly do doi:
- Ban `.xlsx + openpyxl` bi nang va co kha nang bi Railway kill do RAM
- Ban `CSV per sheet` nhe hon va nhanh hon ro ret

Ket qua test local:
- build operations DB thanh cong
- thoi gian thuc te khoang hon 20 giay

## 3. Dieu kien de Railway co data van hanh

Can co env tren Railway:

```env
OPERATIONS_WORKBOOK_URL=https://docs.google.com/spreadsheets/d/1dDAgd1sDUn4_4gCVKNtztyy1uPh25YuXZGco495qflc/export?format=xlsx
OPERATIONS_DB_PATH=/app/data/dashboard_operations.db
```

Luu y:
- Script moi thuc te khong con parse `.xlsx`, nhung van co the nhan link workbook goc va tu suy ra CSV export tung sheet.
- Sau moi lan deploy backend, can chay `Data Sync` de build lai operations DB neu file chua ton tai.

## 4. Rule business da chot

### Root operations
- Root account chinh thuc = `Activation`
- `Raw Data` khong map duoc vao `Activation/JCD` thi khong dua vao KPI/chart chinh

### Cohort Active User
- Co rule dong theo:
  - `open`
  - `create`
  - `update`
  - `render`
- Co `threshold`
- Rule invalid:
  - neu `open = 0`
  - nhung `create/update/render > 0`
  - thi danh dau invalid va canh bao do

### Renew
- Batch den han = lay tu `JCD hết hạn`
- Renew thanh cong = cung `user_name/account` xuat hien trong `Activation` voi `contract_term` co chu `RENEW`

## 5. File quan trong cho round tiep theo

### Backend
- [index.js](/f:/Antigravity/CRM/UIUX/server/index.js)
- [operations-data.js](/f:/Antigravity/CRM/UIUX/server/lib/operations-data.js)
- [sync-runner.js](/f:/Antigravity/CRM/UIUX/server/lib/sync-runner.js)
- [agent-chat.js](/f:/Antigravity/CRM/UIUX/server/lib/agent-chat.js)
- [agent-skill.js](/f:/Antigravity/CRM/UIUX/server/lib/agent-skill.js)

### Frontend
- [operationsApi.ts](/f:/Antigravity/CRM/UIUX/src/lib/operationsApi.ts)
- [UserMapView.tsx](/f:/Antigravity/CRM/UIUX/src/views/UserMapView.tsx)
- [ActiveMapView.tsx](/f:/Antigravity/CRM/UIUX/src/views/ActiveMapView.tsx)
- [CohortActiveUserView.tsx](/f:/Antigravity/CRM/UIUX/src/views/CohortActiveUserView.tsx)
- [RenewView.tsx](/f:/Antigravity/CRM/UIUX/src/views/RenewView.tsx)

## 6. De bai ngay mai

### UI
- Fine-tune UI cua 4 tab van hanh cho dep va de doc hon
- Chinh spacing, hierarchy, chart readability, empty/error states
- Lam cho ton va chat lieu visual dong nhat hon voi cac tab Sales

### Tool chat
- Nang cap AI chat de hoi du lieu van hanh ngon hon
- Can xem lai:
  - prompt cho operations context
  - table/schema hint
  - cau hoi pho bien can fast-path neu can
  - cach tra loi de user hoi ve active/cohort/renew tu nhien hon

## 7. Note nho

- Root `package-lock.json` dang untracked, chua can commit.
- `connuity.md` da duoc cap nhat xuyen suot, nhung file nay la handoff ngan cho round 1 de mai mo ra la vao viec ngay.
