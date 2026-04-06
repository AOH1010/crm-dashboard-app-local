import argparse
import json
import os
import sqlite3
import time
from pathlib import Path

import requests

# --- CONFIGURATION ---
NOCODB_API_KEY = os.environ.get("NOCODB_API_KEY", "Bm0lNQAfXf-_eyVjaP-oLwegiXGSrr3HFNPCGO_j")
NOCODB_BASE_URL = "https://db02.clik.vn"
TABLE_ID = "mjsyzrplt6vl2mp"
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DB_FILE = str(PROJECT_ROOT / "data" / "crm.db")

HEADERS = {
    "xc-token": NOCODB_API_KEY,
    "Content-Type": "application/json",
}

MAPPING = {
    "title": "Ten khach hang",
    "id_1": "ID Getfly",
    "phone_office": "So dien thoai",
    "email": "Email",
    "industry_name": "Nganh nghe",
    "mgr_display_name": "Sale phu trach",
    "total_revenue": "Tong doanh thu",
    "relation_name": "Moi quan he",
    "account_source_full_name": "Nguon KH Day du",
    "latest_interaction": "Lich su trao doi",
    "description": "Ghi chu",
    "created_at_1": "Ngay tao",
    "province_name": "Tinh/thanh pho",
}


def get_existing_ids():
    print("[1/3] Dang kiem tra du lieu hien co tren NocoDB...")
    existing_ids = set()
    url = f"{NOCODB_BASE_URL}/api/v2/tables/{TABLE_ID}/records"
    offset = 0
    limit = 1000
    while True:
        try:
            params = {"fields": "ID Getfly", "limit": limit, "offset": offset}
            response = requests.get(url, headers=HEADERS, params=params)
            if response.status_code != 200:
                break
            records = response.json().get("list", [])
            if not records:
                break
            for record in records:
                if record.get("ID Getfly"):
                    existing_ids.add(str(record["ID Getfly"]))
            offset += limit
            if len(records) < limit:
                break
        except Exception:
            break
    print(f"=> Da ton tai: {len(existing_ids)} khach hang.")
    return existing_ids


def chunk_data(data_list, batch_size=100):
    for index in range(0, len(data_list), batch_size):
        yield data_list[index:index + batch_size]


def get_data_from_db():
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
    source_data = []

    if file_path and os.path.exists(file_path):
        print(f"--- BAT DAU UPLOAD (FILE: {file_path}) ---")
        try:
            with open(file_path, "r", encoding="utf-8") as handle:
                source_data = json.load(handle)
        except Exception as exc:
            print(f"Loi doc file: {exc}")
            return
    else:
        print(f"--- BAT DAU UPLOAD (DATABASE: {DB_FILE}) ---")
        source_data = get_data_from_db()
        if not source_data:
            print("Khong co du lieu trong database.")
            return

    mapped_data = []
    for item in source_data:
        new_item = {}
        for key, value in item.items():
            if key in MAPPING:
                new_item[MAPPING[key]] = value
        mapped_data.append(new_item)

    target_records = mapped_data
    if skip_duplicates:
        existing_ids = get_existing_ids()
        target_records = [
            record for record in mapped_data if str(record.get("ID Getfly")) not in existing_ids
        ]

    if limit:
        target_records = target_records[:limit]

    total_to_upload = len(target_records)
    print(f"San sang day {total_to_upload} khach hang.")

    if total_to_upload == 0:
        print("Khong co du lieu moi.")
        return

    url = f"{NOCODB_BASE_URL}/api/v2/tables/{TABLE_ID}/records"
    success_count = 0
    for batch in chunk_data(target_records, 100):
        try:
            response = requests.post(url, headers=HEADERS, json=batch)
            if response.status_code in [200, 201]:
                success_count += len(batch)
                print(f"\rTien do: {success_count}/{total_to_upload}...", end="", flush=True)
            else:
                print(f"\n[!] Loi: {response.text}")
            time.sleep(0.1)
        except Exception as exc:
            print(f"\n[!] Exception: {exc}")

    print(f"\nHOAN TAT! Da them {success_count} khach hang moi.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", help="Duong dan file JSON neu muon upload tu file")
    parser.add_argument("--no-check", action="store_true", help="Bo qua kiem tra trung")
    parser.add_argument("--limit", type=int, help="Gioi han so ban ghi day len de test")
    args = parser.parse_args()

    upload_to_nocodb(args.file, skip_duplicates=not args.no_check, limit=args.limit)
