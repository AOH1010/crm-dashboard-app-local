import json
import argparse
import os
import sqlite3
import time
from datetime import date, datetime, timedelta
from pathlib import Path
import requests
from dotenv import load_dotenv
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
load_dotenv()
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DB_FILE = PROJECT_ROOT / "data" / "crm.db"
GETFLY_API_KEY = os.environ.get("GETFLY_API_KEY")
GETFLY_BASE_URL = os.environ.get("GETFLY_BASE_URL") or "https://jega.getflycrm.com/"
HEADERS = {
    "X-API-KEY": GETFLY_API_KEY,
    "Content-Type": "application/json",
}
SYNC_JOB_NAME = "getfly_orders"
TIMESTAMP_FORMAT = "%Y-%m-%d %H:%M:%S"


def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn
def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS customers (
        id_1 TEXT PRIMARY KEY,
        title TEXT,
        phone_office TEXT,
        email TEXT,
        industry_name TEXT,
        mgr_display_name TEXT,
        total_revenue REAL,
        relation_name TEXT,
        account_source_full_name TEXT,
        latest_interaction TEXT,
        description TEXT,
        created_at_1 TEXT,
        updated_at_1 TEXT,
        province_name TEXT
    )
    ''')
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS orders (
        order_id INTEGER PRIMARY KEY,
        order_code TEXT,
        account_id INTEGER,
        id_1 TEXT,
        account_phone TEXT,
        saler_name TEXT,
        real_amount REAL,
        discount_amount REAL,
        vat_amount REAL,
        status_label TEXT,
        payment_status INTEGER,
        order_date TEXT,
        created_at TEXT,
        updated_at TEXT,
        products_json TEXT
    )
    ''')
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS sync_state (
        job_name TEXT PRIMARY KEY,
        last_successful_updated_at TEXT,
        last_started_at TEXT,
        last_completed_at TEXT,
        last_status TEXT
    )
    ''')
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_customers_relation_name ON customers(relation_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_customers_industry_name ON customers(industry_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_customers_source ON customers(account_source_full_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_customers_province ON customers(province_name)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_customers_updated_at ON customers(updated_at_1)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_id_1 ON orders(id_1)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_updated_at ON orders(updated_at)")
    conn.commit()
    conn.close()
def get_session():
    session = requests.Session()
    retry = Retry(
        total=5,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


def require_getfly_config():
    if not HEADERS.get("X-API-KEY"):
        raise RuntimeError("Thieu GETFLY_API_KEY trong .env")
    if not GETFLY_BASE_URL:
        raise RuntimeError("Thieu GETFLY_BASE_URL trong .env")


def now_str():
    return datetime.now().strftime(TIMESTAMP_FORMAT)


def format_dt(value):
    return value.strftime(TIMESTAMP_FORMAT) if value else None


def parse_getfly_datetime(value):
    if not value:
        return None
    raw = str(value).strip()
    for fmt in (TIMESTAMP_FORMAT, "%Y-%m-%d"):
        try:
            return datetime.strptime(raw, fmt)
        except ValueError:
            continue
    return None


def get_sync_state(job_name):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT job_name, last_successful_updated_at, last_started_at, last_completed_at, last_status FROM sync_state WHERE job_name = ?",
        (job_name,),
    )
    row = cursor.fetchone()
    conn.close()
    return row


def mark_sync_started(job_name):
    conn = get_db_connection()
    cursor = conn.cursor()
    started_at = now_str()
    cursor.execute(
        """
        INSERT INTO sync_state (job_name, last_successful_updated_at, last_started_at, last_completed_at, last_status)
        VALUES (?, NULL, ?, NULL, 'running')
        ON CONFLICT(job_name) DO UPDATE SET
            last_started_at = excluded.last_started_at,
            last_status = excluded.last_status
        """,
        (job_name, started_at),
    )
    conn.commit()
    conn.close()


def mark_sync_finished(job_name, status, checkpoint_value=None):
    conn = get_db_connection()
    cursor = conn.cursor()
    completed_at = now_str()
    cursor.execute("SELECT last_successful_updated_at FROM sync_state WHERE job_name = ?", (job_name,))
    row = cursor.fetchone()
    effective_checkpoint = checkpoint_value if checkpoint_value is not None else (row[0] if row else None)
    cursor.execute(
        """
        INSERT INTO sync_state (job_name, last_successful_updated_at, last_started_at, last_completed_at, last_status)
        VALUES (?, ?, NULL, ?, ?)
        ON CONFLICT(job_name) DO UPDATE SET
            last_successful_updated_at = excluded.last_successful_updated_at,
            last_completed_at = excluded.last_completed_at,
            last_status = excluded.last_status
        """,
        (job_name, effective_checkpoint, completed_at, status),
    )
    conn.commit()
    conn.close()


def get_latest_order_updated_at():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """
        SELECT MAX(updated_value)
        FROM (
            SELECT MAX(TRIM(updated_at)) AS updated_value
            FROM orders
            WHERE TRIM(COALESCE(updated_at, '')) != ''

            UNION ALL

            SELECT MAX(TRIM(created_at)) AS updated_value
            FROM orders
            WHERE TRIM(COALESCE(created_at, '')) != ''

            UNION ALL

            SELECT MAX(TRIM(order_date)) AS updated_value
            FROM orders
            WHERE TRIM(COALESCE(order_date, '')) != ''
        )
        """,
    )
    row = cursor.fetchone()
    conn.close()
    return row[0] if row and row[0] else None


def get_run_filter(order_code=None, since_today=False, since_date=None, full_sync=False, lookback_hours=0):
    if order_code:
        return {
            "filter_value": None,
            "message": f"Dang sync rieng don hang: {order_code}",
            "mode": "single",
            "checkpoint_candidate": None,
        }

    if since_date:
        filter_value = f"{since_date} 00:00:00"
        return {
            "filter_value": filter_value,
            "message": f"Dang sync don hang co updated_at tu ngay chi dinh: {filter_value}",
            "mode": "explicit_date",
            "checkpoint_candidate": filter_value,
        }

    if since_today:
        filter_value = date.today().strftime(TIMESTAMP_FORMAT.replace("%H:%M:%S", "00:00:00"))
        return {
            "filter_value": filter_value,
            "message": f"Dang sync don hang co updated_at tu hom nay: {filter_value}",
            "mode": "today",
            "checkpoint_candidate": filter_value,
        }

    if full_sync:
        return {
            "filter_value": None,
            "message": "Dang chay full sync toan bo don hang.",
            "mode": "full_sync",
            "checkpoint_candidate": None,
        }

    sync_state = get_sync_state(SYNC_JOB_NAME)
    checkpoint_raw = sync_state["last_successful_updated_at"] if sync_state else None
    checkpoint_dt = parse_getfly_datetime(checkpoint_raw)
    if checkpoint_dt is None:
        fallback_checkpoint_raw = get_latest_order_updated_at()
        checkpoint_dt = parse_getfly_datetime(fallback_checkpoint_raw)
        if checkpoint_dt is None:
            return {
                "filter_value": None,
                "message": "Khong tim thay checkpoint sync_state hay du lieu cu. Se chay full sync.",
                "mode": "bootstrap_full_sync",
                "checkpoint_candidate": None,
            }

    if lookback_hours > 0:
        checkpoint_dt = checkpoint_dt - timedelta(hours=lookback_hours)

    filter_value = format_dt(checkpoint_dt)
    return {
        "filter_value": filter_value,
        "message": f"Dang chay auto incremental don hang theo checkpoint: {filter_value}",
        "mode": "checkpoint",
        "checkpoint_candidate": filter_value,
    }
FIELDS = "id,order_code,account_id,account_code,account_phone,real_amount,discount_amount,vat_amount,order_date,created_at,updated_at,status_label,assigned_user_name,payment_status,has_pay_off,order_details"

def process_order(item):
    """Chuáº©n hÃ³a dá»¯ liá»‡u Ä‘Æ¡n hÃ ng trÆ°á»›c khi chÃ¨n vÃ o SQL"""
    raw_details = item.get('order_details', [])
    products = []
    for p in raw_details:
        products.append({
            "product_code": p.get("product_code"),
            "product_name": p.get("product_name"),
            "quantity": p.get("quantity"),
            "price": p.get("price"),
            "amount": p.get("amount")
        })
    
    return (
        item.get('id'),
        item.get('order_code'),
        item.get('account_id'),
        item.get('account_code'),
        item.get('account_phone'),
        item.get('assigned_user_name'),
        item.get('real_amount'),
        item.get('discount_amount'),
        item.get('vat_amount'),
        item.get('status_label'),
        item.get('payment_status'),
        item.get('order_date'),
        item.get('created_at'),
        item.get('updated_at'),
        json.dumps(products, ensure_ascii=False)
    )

def save_orders_to_db(orders):
    """LÆ°u danh sÃ¡ch Ä‘Æ¡n hÃ ng vÃ o SQLite"""
    if not orders:
        return
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.executemany('''
    INSERT OR REPLACE INTO orders (
        order_id, order_code, account_id, id_1, account_phone, 
        saler_name, real_amount, discount_amount, vat_amount, 
        status_label, payment_status, order_date, created_at, updated_at, products_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', orders)
    conn.commit()
    conn.close()

def scrape_orders(limit_pages=None, order_code=None, since_today=False, since_date=None, full_sync=False, lookback_hours=0):
    """QuÃ©t ÄÆ¡n hÃ ng tá»« Getfly vÃ  lÆ°u vÃ o SQLite"""
    print("--- Báº®T Äáº¦U TRÃCH XUáº¤T ÄÆ N HÃ€NG GETFLY ---")
    require_getfly_config()
    init_db()
    session = get_session()
    total_processed = 0
    url = f"{GETFLY_BASE_URL.rstrip('/')}/api/v6/sale_orders"
    run_filter = get_run_filter(
        order_code=order_code,
        since_today=since_today,
        since_date=since_date,
        full_sync=full_sync,
        lookback_hours=lookback_hours,
    )
    params = {
        'fields': FIELDS,
        'limit': 100,
        'offset': 0
    }
    manages_checkpoint = run_filter["mode"] != "single"
    max_seen_updated_at = parse_getfly_datetime(run_filter["checkpoint_candidate"])
    finished_successfully = False
    stopped_by_limit = False

    if manages_checkpoint:
        mark_sync_started(SYNC_JOB_NAME)

    if order_code:
        print(f"Äang tÃ¬m kiáº¿m Ä‘Æ¡n hÃ ng vá»›i mÃ£ (hoáº·c ID): {order_code}")
        params['filtering[order_code:eq]'] = order_code
        try:
            res = session.get(url, headers=HEADERS, params=params, timeout=15)
            records = res.json().get('data', [])
            if not records:
                if str(order_code).isdigit():
                    print("KhÃ´ng tÃ¬m tháº¥y theo mÃ£ Ä‘Æ¡n, thá»­ tÃ¬m theo ID...")
                    res_id = session.get(f"{url}/{order_code}", headers=HEADERS, params={'fields': FIELDS}, timeout=15)
                    if res_id.status_code == 200 and 'id' in res_id.json():
                        records = [res_id.json()]
            
            if records:
                for record in records:
                    record_updated_dt = parse_getfly_datetime(
                        record.get('updated_at') or record.get('created_at') or record.get('order_date')
                    )
                    if record_updated_dt and (max_seen_updated_at is None or record_updated_dt > max_seen_updated_at):
                        max_seen_updated_at = record_updated_dt
                processed = [process_order(r) for r in records]
                save_orders_to_db(processed)
                total_processed = len(processed)
                print(f"ÄÃ£ xá»­ lÃ½ {total_processed} Ä‘Æ¡n hÃ ng.")
            else:
                print("KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n hÃ ng.")
            finished_successfully = True
        except Exception as e:
            print(f"Lá»—i: {e}")
    else:
        print(run_filter["message"])
        if run_filter["filter_value"]:
            params['filtering[updated_at:gte]'] = run_filter["filter_value"]

        page_count = 0
        try:
            while True:
                if limit_pages and page_count >= limit_pages:
                    stopped_by_limit = True
                    break
                res = session.get(url, headers=HEADERS, params=params, timeout=15)
                if res.status_code != 200:
                    break

                data_json = res.json()
                batch_records = data_json.get('data', [])
                if not batch_records:
                    finished_successfully = True
                    break

                for record in batch_records:
                    record_updated_dt = parse_getfly_datetime(
                        record.get('updated_at') or record.get('created_at') or record.get('order_date')
                    )
                    if record_updated_dt and (max_seen_updated_at is None or record_updated_dt > max_seen_updated_at):
                        max_seen_updated_at = record_updated_dt

                processed = [process_order(r) for r in batch_records]
                save_orders_to_db(processed)
                total_processed += len(processed)

                if not data_json.get('has_more', False):
                    finished_successfully = True
                    break
                params['offset'] += 100
                page_count += 1
                print(f"\rÄÃ£ xá»­ lÃ½ {total_processed} Ä‘Æ¡n hÃ ng...", end='', flush=True)
                time.sleep(0.3)
        except Exception as e:
            print(f"\nLá»—i: {e}")

    if manages_checkpoint:
        if finished_successfully and not stopped_by_limit:
            mark_sync_finished(SYNC_JOB_NAME, "success", format_dt(max_seen_updated_at))
        else:
            mark_sync_finished(SYNC_JOB_NAME, "partial" if stopped_by_limit else "failed")

    print(f"\nHOÃ€N Táº¤T! ÄÃ£ cáº­p nháº­t {total_processed} Ä‘Æ¡n hÃ ng vÃ o SQLite.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Script quÃ©t Ä‘Æ¡n hÃ ng tá»« Getfly vÃ o SQLite")
    parser.add_argument("--limit-pages", type=int, help="Giá»›i háº¡n sá»‘ trang quÃ©t")
    parser.add_argument("--code", help="MÃ£ Ä‘Æ¡n hÃ ng hoáº·c ID cá»¥ thá»ƒ cáº§n quÃ©t")
    parser.add_argument("--since-today", action="store_true", help="Chá»‰ quÃ©t Ä‘Æ¡n hÃ ng cáº­p nháº­t hÃ´m nay")
    parser.add_argument("--since-date", help="Sync don hang co updated_at tu ngay YYYY-MM-DD")
    parser.add_argument("--full-sync", action="store_true", help="Quet toan bo thay vi incremental sync")
    parser.add_argument("--lookback-hours", type=int, default=0, help="Lui checkpoint de quet de phong bo sot, tinh bang gio")
    args = parser.parse_args()
    
    scrape_orders(
        limit_pages=args.limit_pages,
        order_code=args.code,
        since_today=args.since_today,
        since_date=args.since_date,
        full_sync=args.full_sync,
        lookback_hours=max(0, args.lookback_hours),
    )

