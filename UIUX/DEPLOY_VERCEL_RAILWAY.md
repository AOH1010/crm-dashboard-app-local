# Deploy Vercel + Railway

Mục tiêu:
- `Railway` chạy backend API Node/Express và mang theo snapshot hiện tại của `crm.db`.
- `Vercel` chạy frontend Vite/React.

## Kiến trúc sau khi deploy

- Frontend: `Vercel`
- Backend API: `Railway`
- Frontend gọi backend qua `VITE_API_BASE_URL`
- Railway image hiện tại đã đóng gói sẵn:
  - `data/crm.db`
  - `data/dashboard_sales.db`

Ghi chú:
- Cách này cho bạn lên web nhanh nhất từ code hiện tại.
- Khi bạn scrape/update dữ liệu nhiều về sau, nên nâng cấp Railway sang volume riêng và trỏ `CRM_DATA_DIR=/data`.

## 1. Deploy Railway Backend

Thực hiện ở thư mục repo gốc:

```powershell
cd "d:\Project\CRM 1"
npx @railway/cli login
npx @railway/cli init
npx @railway/cli up
```

Sau đó vào Railway dashboard và đặt các variables:

- `GEMINI_API_KEY`
- `CRM_AGENT_MODEL=gemini-2.5-flash`
- `PREBUILD_DASHBOARD_DB=true`

Tiếp theo:
- mở service backend
- vào `Settings`
- bấm `Generate Domain`

Kết quả bạn sẽ có URL dạng:

```text
https://your-backend-name.up.railway.app
```

Kiểm tra nhanh:

```text
https://your-backend-name.up.railway.app/api/health
```

Nếu thấy `{"ok":true}` là backend đã chạy.

## 2. Deploy Vercel Frontend

Thực hiện trong thư mục `UIUX`:

```powershell
cd "d:\Project\CRM 1\UIUX"
npx vercel login
```

Set environment variable cho frontend:

```powershell
npx vercel env add VITE_API_BASE_URL production
npx vercel env add VITE_API_BASE_URL preview
```

Giá trị cần nhập là domain Railway ở bước 1, ví dụ:

```text
https://your-backend-name.up.railway.app
```

Deploy:

```powershell
npx vercel
npx vercel --prod
```

## 3. Kiểm tra sau deploy

- Mở domain Vercel
- Vào các tab `Dashboard`, `Leads`, `Conversion`
- Mở DevTools nếu cần và kiểm tra các request `/api/...` đang đi tới domain Railway

## 4. Luồng cập nhật khi bạn build tiếp

- Sửa UI: deploy lại Vercel
- Sửa backend/API: deploy lại Railway
- Nếu update snapshot DB trong repo: deploy lại Railway để backend dùng snapshot mới

## 5. Nâng cấp sau này

Khi bạn muốn Railway giữ DB bền vững hơn thay vì dùng snapshot trong image:

1. Tạo Railway Volume
2. Mount vào ví dụ `/data`
3. Set env:

```text
CRM_DATA_DIR=/data
CRM_DB_PATH=/data/crm.db
DASHBOARD_DB_PATH=/data/dashboard_sales.db
```

4. Copy `crm.db` lên volume
5. Redeploy backend

Lúc đó bạn không còn phụ thuộc vào DB được bake sẵn trong image nữa.
