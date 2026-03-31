import sys
import json
import requests
import argparse
import os
import time
import sqlite3

# --- CONFIGURATION ---
NOCODB_API_KEY = os.environ.get("NOCODB_API_KEY", "Bm0lNQAfXf-_eyVjaP-oLwegiXGSrr3HFNPCGO_j")
NOCODB_BASE_URL = "https://db02.clik.vn"
TABLE_ID = "mjsyzrplt6vl2mp"
DB_FILE = os.path.join(os.path.dirname(__file__), "data", "crm.db")

HEADERS = {
    "xc-token": NOCODB_API_KEY,
    "Content-Type": "application/json"
}

# BẢN ĐỒ ÁNH XẠ: KEY TRONG SQL/JSON -> TIÊU ĐỀ CỘT NOCODB
MAPPING = {
    "title": "Tên khách hàng",
    "id_1": "ID Getfly",
    "phone_office": "Số điện thoại",
    "email": "Email",
    "industry_name": "Ngành nghề",
    "mgr_display_name": "Sale phụ trách",
    "total_revenue": "Tổng doanh thu",
    "relation_name": "Mối quan hệ",
    "account_source_full_name": "Nguồn KH Đầy đủ",
    "latest_interaction": "Lịch sử trao đổi",
    "description": "Ghi chú",
    "created_at_1": "Ngày tạo",
    "province_name": "Tỉnh/thành phố"
}

def get_existing_ids():
    """Lấy toàn bộ danh sách ID Getfly từ NocoDB để tránh trùng"""
    print("[1/3] Đang kiểm tra dữ liệu hiện có trên NocoDB...")
    existing_ids = set()
    url = f"{NOCODB_BASE_URL}/api/v2/tables/{TABLE_ID}/records"
    offset = 0
    limit = 1000
    while True:
        try:
            params = {"fields": "ID Getfly", "limit": limit, "offset": offset}
            response = requests.get(url, headers=HEADERS, params=params)
            if response.status_code != 200: break
            records = response.json().get('list', [])
            if not records: break
            for r in records:
                if r.get('ID Getfly'): existing_ids.add(str(r['ID Getfly']))
            offset += limit
            if len(records) < limit: break
        except Exception: break
    print(f"=> Đã tồn tại: {len(existing_ids)} khách hàng.")
    return existing_ids

def chunk_data(data_list, batch_size=100):
    for i in range(0, len(data_list), batch_size):
        yield data_list[i:i + batch_size]

def get_data_from_db():
    """Lấy toàn bộ dữ liệu từ SQLite"""
    if not os.path.exists(DB_FILE):
        return []
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM customers")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows

def upload_to_nocodb(file_path=None, skip_duplicates=True, limit=None):
    """Đọc dữ liệu từ SQL (hoặc JSON), ánh xạ và đẩy lên NocoDB"""
    source_data = []
    
    if file_path and os.path.exists(file_path):
        print(f"--- BẮT ĐẦU UPLOAD (FILE: {file_path}) ---")
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                source_data = json.load(f)
        except Exception as e:
            print(f"Lỗi đọc file: {e}")
            return
    else:
        print(f"--- BẮT ĐẦU UPLOAD (DATABASE: {DB_FILE}) ---")
        source_data = get_data_from_db()
        if not source_data:
            print("Không có dữ liệu trong database.")
            return

    # 2. Ánh xạ dữ liệu sang Tiêu đề tiếng Việt
    mapped_data = []
    for item in source_data:
        new_item = {}
        for key, val in item.items():
            if key in MAPPING:
                new_item[MAPPING[key]] = val
        mapped_data.append(new_item)

    # 3. Lọc trùng
    target_records = mapped_data
    if skip_duplicates:
        existing_ids = get_existing_ids()
        target_records = [r for r in mapped_data if str(r.get('ID Getfly')) not in existing_ids]
    
    if limit:
        target_records = target_records[:limit]
        
    total_to_upload = len(target_records)
    print(f"Sẵn sàng đẩy {total_to_upload} khách hàng.")
    
    if total_to_upload == 0: 
        print("Không có dữ liệu mới.")
        return

    # 4. Đẩy Bulk
    url = f"{NOCODB_BASE_URL}/api/v2/tables/{TABLE_ID}/records"
    success_count = 0
    for batch in chunk_data(target_records, 100):
        try:
            response = requests.post(url, headers=HEADERS, json=batch)
            if response.status_code in [200, 201]:
                success_count += len(batch)
                print(f"\rTiến độ: {success_count}/{total_to_upload}...", end='', flush=True)
            else:
                print(f"\n[!] Lỗi: {response.text}")
            time.sleep(0.1)
        except Exception as e:
            print(f"\n[!] Exception: {e}")

    print(f"\n✨ HOÀN TẤT! Đã thêm {success_count} khách hàng mới.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", help="Đường dẫn file JSON (nếu muốn upload từ file)")
    parser.add_argument("--no-check", action="store_true", help="Bỏ qua kiểm tra trùng")
    parser.add_argument("--limit", type=int, help="Giới hạn số bản ghi đẩy lên để test")
    args = parser.parse_args()
    
    upload_to_nocodb(args.file, skip_duplicates=not args.no_check, limit=args.limit)
