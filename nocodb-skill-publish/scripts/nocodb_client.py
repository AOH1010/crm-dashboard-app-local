import sys
import json
import requests
import argparse
import os

# -------------------------------------------------------------
# CẤU HÌNH NGƯỜI DÙNG:
# -------------------------------------------------------------
TOKEN = os.environ.get("NOCODB_TOKEN", "Bm0lNQAfXf-_eyVjaP-oLwegiXGSrr3HFNPCGO_j")
HOST_URL = os.environ.get("NOCODB_HOST", "https://db02.clik.vn") # URL gốc của NocoDB
BASE_ID = os.environ.get("NOCODB_BASE_ID", "p6j83ka33pv8h5o") # Cần thiết cho list_tables và create_table

HEADERS = {
    "xc-token": TOKEN,
    "Content-Type": "application/json"
}

def main():
    parser = argparse.ArgumentParser(description="Standard NocoDB REST API Client for Gemini CLI")
    parser.add_argument("action", choices=["query", "create", "update", "delete", "list_tables", "create_table", "create_column"], help="Action to perform")
    parser.add_argument("--tableId", help="ID của bảng dữ liệu (Bắt buộc cho CRUD hoặc create_column)")
    parser.add_argument("--tableName", help="Tên bảng mới (Bắt buộc cho create_table)")
    parser.add_argument("--columnName", help="Tên cột mới (Bắt buộc cho create_column)")
    parser.add_argument("--data", help="Dữ liệu JSON (dạng chuỗi)")
    parser.add_argument("--params", help="Tham số query (dạng chuỗi JSON như limit, offset, where, sort)")

    args = parser.parse_args()

    if TOKEN == "YOUR_NOCODB_TOKEN_HERE":
        print(json.dumps({"error": "MISSING_TOKEN: Vui lòng cấu hình NOCODB_TOKEN."}))
        sys.exit(1)

    # --- META OPERATIONS (BASE LEVEL) ---
    if args.action == "list_tables":
        if BASE_ID == "YOUR_BASE_ID_HERE":
            print(json.dumps({"error": "MISSING_BASE_ID: Vui lòng cấu hình NOCODB_BASE_ID để liệt kê bảng."}))
            sys.exit(1)
            
        url = f"{HOST_URL}/api/v2/meta/bases/{BASE_ID}/tables"
        try:
            response = requests.get(url, headers=HEADERS)
            if response.status_code == 200:
                tables = response.json().get("list", [])
                print(json.dumps([{"id": t.get("id"), "title": t.get("title")} for t in tables], indent=2))
            else:
                print(json.dumps({"error": response.status_code, "message": response.text}))
        except Exception as e:
            print(json.dumps({"error": "Exception", "message": str(e)}))
        return

    if args.action == "create_table":
        if BASE_ID == "YOUR_BASE_ID_HERE":
            print(json.dumps({"error": "MISSING_BASE_ID: Vui lòng cấu hình NOCODB_BASE_ID để tạo bảng."}))
            sys.exit(1)
        if not args.tableName:
            print(json.dumps({"error": "MISSING_TABLE_NAME: Bạn phải cung cấp --tableName"}))
            sys.exit(1)
        
        url = f"{HOST_URL}/api/v2/meta/bases/{BASE_ID}/tables"
        # Tạo bảng cơ bản với 1 cột Title
        payload = {
            "table_name": args.tableName,
            "title": args.tableName,
            "columns": [
                {"column_name": "Id", "title": "Id", "uidt": "ID", "pk": True, "ai": True},
                {"column_name": "Title", "title": "Title", "uidt": "SingleLineText"}
            ]
        }
        try:
            response = requests.post(url, headers=HEADERS, json=payload)
            if response.status_code == 200:
                print(json.dumps(response.json(), indent=2))
            else:
                print(json.dumps({"error": response.status_code, "message": response.text}))
        except Exception as e:
            print(json.dumps({"error": "Exception", "message": str(e)}))
        return

    if args.action == "create_column":
        if not args.tableId:
            print(json.dumps({"error": "MISSING_TABLE_ID: Bạn phải cung cấp --tableId"}))
            sys.exit(1)
        if not args.columnName:
            print(json.dumps({"error": "MISSING_COLUMN_NAME: Bạn phải cung cấp --columnName"}))
            sys.exit(1)
        
        url = f"{HOST_URL}/api/v2/meta/tables/{args.tableId}/columns"
        # Mặc định tạo cột SingleLineText
        payload = {
            "column_name": args.columnName,
            "title": args.columnName,
            "uidt": "SingleLineText"
        }
        try:
            response = requests.post(url, headers=HEADERS, json=payload)
            if response.status_code == 200:
                print(json.dumps(response.json(), indent=2))
            else:
                print(json.dumps({"error": response.status_code, "message": response.text}))
        except Exception as e:
            print(json.dumps({"error": "Exception", "message": str(e)}))
        return

    # --- DATA OPERATIONS (TABLE LEVEL) ---
    if not args.tableId:
        print(json.dumps({"error": "MISSING_TABLE_ID: Bạn phải cung cấp --tableId cho các thao tác dữ liệu."}))
        sys.exit(1)

    base_api_url = f"{HOST_URL}/api/v2/tables/{args.tableId}/records"

    try:
        if args.action == "query":
            params = json.loads(args.params) if args.params else {}
            response = requests.get(base_api_url, headers=HEADERS, params=params)
            
        elif args.action == "create":
            data = json.loads(args.data) if args.data else []
            response = requests.post(base_api_url, headers=HEADERS, json=data)
            
        elif args.action == "update":
            data = json.loads(args.data) if args.data else {}
            response = requests.patch(base_api_url, headers=HEADERS, json=data)
            
        elif args.action == "delete":
            ids = json.loads(args.data) if args.data else []
            response = requests.delete(base_api_url, headers=HEADERS, json={"ids": ids} if isinstance(ids, list) else ids)

        if 200 <= response.status_code < 300:
            print(json.dumps(response.json(), indent=2))
        else:
            print(json.dumps({
                "error": f"API Error {response.status_code}",
                "message": response.text
            }, indent=2))

    except Exception as e:
        print(json.dumps({"error": "Exception", "message": str(e)}))

if __name__ == "__main__":
    main()
