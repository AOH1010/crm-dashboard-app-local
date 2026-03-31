import requests

# --- CONFIGURATION ---
NOCODB_API_KEY = "Bm0lNQAfXf-_eyVjaP-oLwegiXGSrr3HFNPCGO_j"
NOCODB_BASE_URL = "https://db02.clik.vn"
TABLE_ID = "mjsyzrplt6vl2mp"

HEADERS = {
    "xc-token": NOCODB_API_KEY,
    "Content-Type": "application/json"
}

def setup_columns():
    url = f"{NOCODB_BASE_URL}/api/v2/meta/tables/{TABLE_ID}/columns"
    
    # Danh sách cột cần tạo (với UIDT - User Interface Data Type của NocoDB)
    columns = [
        {"column_name": "id", "title": "ID Getfly", "uidt": "Number"},
        {"column_name": "account_code", "title": "Mã KH", "uidt": "SingleLineText"},
        {"column_name": "account_name", "title": "Tên khách hàng", "uidt": "SingleLineText"},
        {"column_name": "phone_office", "title": "Số điện thoại", "uidt": "SingleLineText"},
        {"column_name": "email", "title": "Email", "uidt": "SingleLineText"},
        {"column_name": "industry_name", "title": "Ngành nghề", "uidt": "SingleLineText"},
        {"column_name": "mgr_display_name", "title": "Sale phụ trách", "uidt": "SingleLineText"},
        {"column_name": "total_revenue", "title": "Tổng doanh thu", "uidt": "Currency"},
        {"column_name": "relation_name", "title": "Mối quan hệ", "uidt": "SingleLineText"},
        {"column_name": "account_source_full_name", "title": "Nguồn KH Đầy đủ", "uidt": "SingleLineText"},
        {"column_name": "latest_interaction", "title": "Lịch sử trao đổi", "uidt": "LongText"},
        {"column_name": "description", "title": "Ghi chú", "uidt": "LongText"},
        {"column_name": "created_at", "title": "Ngày tạo", "uidt": "DateTime"}
    ]

    print(f"--- Đang thiết lập cấu trúc bảng {TABLE_ID} ---")
    for col in columns:
        res = requests.post(url, headers=HEADERS, json=col)
        if res.status_code in [200, 201]:
            print(f"✅ Đã tạo cột: {col['title']}")
        else:
            # Nếu cột đã tồn tại (Lỗi 400 hoặc 409 tùy version NocoDB), ta cứ bỏ qua
            print(f"⚠️ Cột {col['title']} (Có thể đã tồn tại): {res.status_code}")

if __name__ == "__main__":
    setup_columns()
