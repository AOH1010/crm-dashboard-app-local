import requests
import time

# --- CONFIGURATION ---
NOCODB_API_KEY = "Bm0lNQAfXf-_eyVjaP-oLwegiXGSrr3HFNPCGO_j"
NOCODB_BASE_URL = "https://db02.clik.vn"
TABLE_ID = "mjsyzrplt6vl2mp"

HEADERS = {
    "xc-token": NOCODB_API_KEY,
    "Content-Type": "application/json"
}

def clear_all_records():
    """Xóa toàn bộ bản ghi trong bảng NocoDB (Chia batch 100)"""
    print(f"--- ĐANG DỌN DẸP BẢNG {TABLE_ID} ---")
    url = f"{NOCODB_BASE_URL}/api/v2/tables/{TABLE_ID}/records"
    
    deleted_total = 0
    
    while True:
        # 1. Lấy danh sách ID hiện có (lấy tối đa 100 cái để xóa luôn cho tiện)
        try:
            params = {"fields": "Id", "limit": 100}
            response = requests.get(url, headers=HEADERS, params=params)
            if response.status_code != 200:
                print(f"Lỗi khi lấy dữ liệu: {response.text}")
                break
                
            records = response.json().get('list', [])
            if not records:
                print("=> Bảng đã sạch hoàn toàn!")
                break
            
            # 2. Xóa theo Batch 100
            ids_to_delete = [{"Id": r['Id']} for r in records]
            del_res = requests.delete(url, headers=HEADERS, json=ids_to_delete)
            
            if del_res.status_code in [200, 201]:
                deleted_total += len(records)
                print(f"\rĐã xóa tổng cộng {deleted_total} bản ghi...", end='', flush=True)
            else:
                print(f"\nLỗi khi xóa: {del_res.status_code} - {del_res.text}")
                break
                
            time.sleep(0.1) # Nghỉ xíu
        except Exception as e:
            print(f"\nLỗi Exception: {e}")
            break

    print(f"\n--- HOÀN TẤT! ---")

if __name__ == "__main__":
    clear_all_records()
