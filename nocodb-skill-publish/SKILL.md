---
name: nocodb-rest-api
description: Tương tác với bất kỳ cơ sở dữ liệu NocoDB nào thông qua REST API tiêu chuẩn. Sử dụng để Query, Create, Update, Delete records. Yêu cầu Table ID cho mọi thao tác.
---

# Universal NocoDB REST API Skill

Skill này cho phép Gemini CLI kết nối trực tiếp với các instance NocoDB thông qua giao thức REST API tiêu chuẩn.

## Cài đặt quan trọng
Trước khi sử dụng, người dùng cần cấu hình các thông tin sau trong file `scripts/nocodb_client.py`:
1. **TOKEN**: Mã API Key (xc-token).
2. **HOST_URL**: URL của server NocoDB (Ví dụ: `https://app.nocodb.com` hoặc server riêng của bạn).
3. **BASE_ID**: Cần thiết nếu muốn dùng tính năng liệt kê hoặc tạo bảng.

## Quy trình làm việc của AI Agent
1. **Xác nhận Table ID**: Luôn yêu cầu Table ID trước khi thực hiện lệnh Data (Query/Create/Update/Delete). Nếu người dùng chưa cung cấp, hãy hỏi họ hoặc đề xuất dùng `list_tables` để tìm.
2. **Sử dụng Script**: Luôn gọi thông qua `scripts/nocodb_client.py`.

### Các lệnh hỗ trợ:

#### 0. Quản lý Bảng (Meta)
- Liệt kê các bảng hiện có:
```bash
python scripts/nocodb_client.py list_tables
```
- Tạo bảng mới:
```bash
python scripts/nocodb_client.py create_table --tableName "Tên Bảng Mới"
```

#### 1. Truy vấn Dữ liệu (Query)
Sử dụng tham số `--params` để gửi các điều kiện lọc (where), sắp xếp (sort), hoặc giới hạn (limit).
- **Lọc (Where)**: Cú pháp `(fieldName,operator,value)`. Các toán tử: `eq`, `neq`, `gt`, `lt`, `like`.
- **Sắp xếp (Sort)**: Tên cột (mặc định tăng dần), thêm dấu `-` phía trước để giảm dần.
```bash
python scripts/nocodb_client.py query --tableId "TABLE_ID" --params "{\"limit\": 10, \"where\": \"(Title,eq,Báo cáo)\"}"
```

#### 2. Thêm Dữ liệu (Create)
Gửi mảng dữ liệu qua tham số `--data`.
```bash
python scripts/nocodb_client.py create --tableId "TABLE_ID" --data "[{\"Title\": \"New Record\", \"Url\": \"...\"}]"
```

#### 3. Cập nhật Dữ liệu (Update)
Yêu cầu phải có trường `Id` bên trong object dữ liệu.
```bash
python scripts/nocodb_client.py update --tableId "TABLE_ID" --data "{\"Id\": 1, \"Title\": \"Updated Title\"}"
```

#### 4. Xóa Dữ liệu (Delete)
Gửi mảng các ID cần xóa.
```bash
python scripts/nocodb_client.py delete --tableId "TABLE_ID" --data "[1, 2, 3]"
```

## Lưu ý về NocoDB API
- **Phân biệt chữ hoa chữ thường**: Tên các cột (Fields) phải khớp chính xác tuyệt đối với Schema trong NocoDB (Ví dụ: `Title` khác với `title`).
- **Giới hạn API**: Các thao tác số lượng lớn nên được chia nhỏ để tránh lỗi timeout của server.
