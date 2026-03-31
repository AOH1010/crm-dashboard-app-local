import requests
import json

API_KEY = "biagyVJ9WhDnkLQi72a0hIzDvRWl6z"
BASE_URL = "https://jega.getflycrm.com/api/v6/accounts/custom_fields"
HEADERS = {"X-API-KEY": API_KEY, "Content-Type": "application/json"}

def find_field(search_term):
    print(f"--- Đang quét toàn bộ danh mục trường tùy chỉnh để tìm '{search_term}' ---")
    try:
        res = requests.get(BASE_URL, headers=HEADERS, params={"limit": 200})
        ids = [d['id'] for d in res.json().get('data', [])]
        
        for i in ids:
            r = requests.get(f"{BASE_URL}/{i}", headers=HEADERS).json()
            r_str = json.dumps(r, ensure_ascii=False)
            
            if search_term.lower() in r_str.lower():
                print(f"\n🌟 TÌM THẤY TRƯỜNG PHÙ HỢP!")
                print(f"Mã trường (field_name): {r.get('field_name')}")
                print(f"Tên hiển thị (field_label): {r.get('field_label')}")
                
                options = r.get('field_options', [])
                for opt in options:
                    if search_term.lower() in opt.get('label', '').lower():
                        print(f"  - ID lựa chọn: {opt.get('id')}")
                        print(f"  - Tên lựa chọn: {opt.get('label')}")
                # Không return ngay để quét xem còn trường nào khác không
            
            print(".", end="", flush=True)
            
    except Exception as e:
        print(f"\nLỗi: {e}")

if __name__ == "__main__":
    find_field("JCD")
    print("\n--- Tiếp tục quét tìm 'Visual AI' một lần nữa (case-insensitive) ---")
    find_field("Visual AI")
