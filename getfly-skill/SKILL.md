---
name: getfly-rest-api
description: Tương tác với hệ thống Getfly CRM thông qua REST API tiêu chuẩn (v6/v6.1). Hỗ trợ các nghiệp vụ quản lý Khách hàng, Đơn hàng, Sản phẩm, Liên hệ, v.v.
---

# Getfly CRM REST API Skill

Skill này cho phép trợ lý AI kết nối trực tiếp với hệ thống Getfly CRM của bạn thông qua giao thức REST API tiêu chuẩn.

## Cài đặt bắt buộc
Trước khi sử dụng, bạn cần cung cấp (hoặc cấu hình) 2 thông tin cốt lõi trong tệp `scripts/getfly_client.py`:

1. **API_KEY**: Mã API Key (gồm 30 ký tự do Getfly cấp). 
   - *Cách lấy*: Đăng nhập tài khoản quản trị Getfly CRM > Cài đặt > Tích hợp > Tích hợp phần mềm khác > Getfly API Key.
2. **BASE_URL**: Tên miền hệ thống Getfly của doanh nghiệp bạn (Ví dụ: `https://tencongty.getflycrm.com`).

## Quy trình làm việc của AI Agent
AI sẽ sử dụng script Python `scripts/getfly_client.py` để gửi các yêu cầu chuẩn HTTP đến máy chủ Getfly. Mọi tương tác dữ liệu từ việc kết nối đều hỗ trợ dạng JSON.

### Các lệnh phổ biến:

#### 1. Gọi API linh hoạt (Universal Request)
Hỗ trợ gọi bất kỳ endpoint nào trong danh sách API của Getfly (Hỗ trợ tốt nhất v6/v6.1). Gửi nội dung qua tham số `--data` đối với các phương thức như POST/PUT.

- **Lấy danh sách khách hàng (GET v6)**:
```bash
python scripts/getfly_client.py request --method GET --endpoint "/api/v6/accounts"
```

- **Lấy thông tin một khách hàng cụ thể (GET v6)**:
```bash
python scripts/getfly_client.py request --method GET --endpoint "/api/v6/accounts/12345"
```

- **Tạo mới khách hàng (POST)**:
```bash
python scripts/getfly_client.py request --method POST --endpoint "/api/v6/account" --data "{\"account_name\": \"Nguyễn Văn A\", \"account_phone\": \"0987654321\"}"
```

- **Tạo đơn hàng mới (POST)**:
```bash
python scripts/getfly_client.py request --method POST --endpoint "/api/v6/sale_orders" --data "{\"account_id\": \"12345\", \"amount\": 1000000}"
```

#### 2. Các Endpoint đặc thù từ Google Script của bạn
- **Lấy chi tiết đơn hàng (GET v6.1)**
```bash
python scripts/getfly_client.py request --method GET --endpoint "/api/v6.1/sale_order" --params "{\"order_code\": \"MÃ_ĐƠN\"}"
```

### Lưu ý quan trọng
- Headers bắt buộc trên mỗi yêu cầu: `X-API-KEY: <Key>` và `Content-Type: application/json`.
- Tất cả các endpoint gốc của Getfly bắt đầu bằng `/api/v6/` hoặc `/api/v6.1/`.
- Xem thêm chi tiết tài liệu API tại: https://developer.getfly.vn/docs/intro
