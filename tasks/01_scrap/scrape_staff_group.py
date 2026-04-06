import argparse
import json
import os
import sqlite3
from pathlib import Path

import requests
from dotenv import load_dotenv

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DB_FILE = PROJECT_ROOT / "data" / "crm.db"
GETFLY_API_KEY = os.environ.get("GETFLY_API_KEY")
GETFLY_BASE_URL = os.environ.get("GETFLY_BASE_URL") or "https://jega.getflycrm.com/"
HEADERS = {
    "X-API-KEY": GETFLY_API_KEY,
    "Content-Type": "application/json",
}
FIELDS = "id,contact_name,dept_id,dept_name,email,contact_mobile,extensions"


def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS staffs (
            user_id INTEGER PRIMARY KEY,
            contact_id INTEGER,
            contact_name TEXT,
            dept_id INTEGER,
            dept_name TEXT,
            email TEXT,
            contact_mobile TEXT,
            callio_extension TEXT,
            raw_extensions_json TEXT
        )
        """
    )
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_staffs_dept_id ON staffs(dept_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_staffs_dept_name ON staffs(dept_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_staffs_contact_name ON staffs(contact_name)")
    conn.commit()
    conn.close()


def fetch_staff_page(session, limit, offset):
    url = f"{GETFLY_BASE_URL.rstrip('/')}/api/v6/users"
    params = {
        "fields": FIELDS,
        "limit": limit,
        "offset": offset,
    }
    response = session.get(url, headers=HEADERS, params=params, timeout=30)
    response.raise_for_status()
    return response.json()


def save_staffs(rows):
    if not rows:
        return
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.executemany(
        """
        INSERT OR REPLACE INTO staffs (
            user_id, contact_id, contact_name, dept_id, dept_name,
            email, contact_mobile, callio_extension, raw_extensions_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.commit()
    conn.close()


def transform_staff_rows(records):
    rows = []
    for item in records:
        extensions = item.get("extensions") or {}
        rows.append(
            (
                item.get("user_id"),
                item.get("contact_id"),
                item.get("contact_name", ""),
                item.get("dept_id"),
                item.get("dept_name", ""),
                item.get("email", ""),
                item.get("contact_mobile", ""),
                extensions.get("CALLIO", ""),
                json.dumps(extensions, ensure_ascii=False),
            )
        )
    return rows


def scrape_staff_group(page_size=100):
    if not HEADERS["X-API-KEY"]:
        raise RuntimeError("Missing GETFLY_API_KEY in .env")

    init_db()
    session = requests.Session()
    offset = 0
    total = 0

    while True:
        payload = fetch_staff_page(session, page_size, offset)
        records = payload.get("data", [])
        if not records:
            break

        save_staffs(transform_staff_rows(records))
        total += len(records)
        print(f"saved={total} offset={offset}", flush=True)

        if not payload.get("has_more", False):
            break
        offset += page_size

    print(f"completed total_staffs={total}", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--page-size", type=int, default=100, help="So luong nhan su moi trang")
    args = parser.parse_args()
    scrape_staff_group(page_size=max(1, args.page_size))
