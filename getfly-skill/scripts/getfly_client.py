import sys
import json
import requests
import argparse
import os

# -------------------------------------------------------------
# CẤU HÌNH NGƯỜI DÙNG:
# -------------------------------------------------------------
# Lưu ý: Thay thế các phần "YOUR_..." theo thông tin doanh nghiệp.
API_KEY = os.environ.get("GETFLY_API_KEY", "biagyVJ9WhDnkLQi72a0hIzDvRWl6z")
BASE_URL = os.environ.get("GETFLY_BASE_URL", "https://jega.getflycrm.com/")

HEADERS = {
    "X-API-KEY": API_KEY,
    "Content-Type": "application/json"
}

def main():
    parser = argparse.ArgumentParser(description="Universal Getfly REST API Client for Gemini CLI")
    parser.add_argument("action", choices=["request"], help="Chỉ định hành động: request")
    parser.add_argument("--method", help="HTTP Method (GET, POST, PUT, DELETE)", default="GET")
    parser.add_argument("--endpoint", help="Vị trí endpoint (Hỗ trợ v6, v6.1. Ví dụ: /api/v6/accounts)", required=True)
    parser.add_argument("--data", help="Dữ liệu JSON (để truyền vào body với POST/PUT)")
    parser.add_argument("--params", help="Tham số dạng dict trên URL (truy vấn với GET)")

    args = parser.parse_args()

    if API_KEY == "YOUR_API_KEY_HERE":
        print(json.dumps({"error": "MISSING_API_KEY", "message": "Vui lòng cấu hình GETFLY_API_KEY."}))
        sys.exit(1)

    if BASE_URL in ["https://yourcompany.getflycrm.com", ""]:
        print(json.dumps({"error": "MISSING_BASE_URL", "message": "Vui lòng cấu hình GETFLY_BASE_URL."}))
        sys.exit(1)

    # Đảm bảo url không thừa dấu gạch chéo
    base_endpoint = args.endpoint if args.endpoint.startswith("/") else f"/{args.endpoint}"
    full_url = f"{BASE_URL.rstrip('/')}{base_endpoint}"

    try:
        req_method = args.method.upper()
        
        # Xử lý thông số JSON
        req_data = None
        if args.data:
            req_data = json.loads(args.data)
            
        req_params = None
        if args.params:
             req_params = json.loads(args.params)

        response = requests.request(
            method=req_method,
            url=full_url,
            headers=HEADERS,
            json=req_data,
            params=req_params,
            timeout=30 # Thời gian chờ API phản hồi
        )

        if 200 <= response.status_code < 300:
            print(json.dumps(response.json(), indent=2, ensure_ascii=False))
        else:
            print(json.dumps({
                "error": f"API Error {response.status_code}",
                "message": response.text,
                "url": full_url
            }, indent=2, ensure_ascii=False))

    except Exception as e:
        print(json.dumps({"error": "Exception", "message": str(e), "url": full_url}))

if __name__ == "__main__":
    main()
