import argparse
import html
import os
import re
import sqlite3
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta
from pathlib import Path
from threading import local
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
        customer_group_name TEXT,
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
    cursor.execute("PRAGMA table_info(customers)")
    customer_columns = {row[1] for row in cursor.fetchall()}
    if "customer_group_name" not in customer_columns:
        cursor.execute("ALTER TABLE customers ADD COLUMN customer_group_name TEXT")
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
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_customers_customer_group_name ON customers(customer_group_name)")
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
THREAD_LOCAL = local()
COMMENT_SEPARATOR = "\n---\n"
COMMENT_PAGE_LIMIT = 100
SYNC_JOB_NAME = "getfly_customers"
TIMESTAMP_FORMAT = "%Y-%m-%d %H:%M:%S"


def get_thread_session():
    session = getattr(THREAD_LOCAL, "session", None)
    if session is None:
        session = get_session()
        THREAD_LOCAL.session = session
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


def clean_comment_content(value):
    text = html.unescape(str(value or ""))
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</p\s*>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


def build_old_data_map():
    old_data_map = {}
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT id_1, updated_at_1, latest_interaction FROM customers")
    for row in cursor.fetchall():
        old_data_map[row["id_1"]] = {
            "updated_at_1": row["updated_at_1"],
            "latest_interaction": row["latest_interaction"],
        }
    conn.close()
    return old_data_map


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


def get_source_map():
    session = get_thread_session()
    url = f"{GETFLY_BASE_URL.rstrip('/')}/api/v6/accounts/sources"
    params = {"fields": "id,source_name,parent_id,lvl", "limit": 1000}
    try:
        response = session.get(url, headers=HEADERS, params=params, timeout=20)
        if response.status_code != 200:
            return {}
        sources = {item["id"]: item for item in response.json().get("data", [])}
    except Exception:
        return {}

    def full_name(source_id):
        path = []
        current_id = source_id
        while current_id in sources:
            source = sources[current_id]
            path.append(source.get("source_name", ""))
            current_id = source.get("parent_id")
            if current_id == 0:
                break
        return " > ".join(reversed([part for part in path if part]))

    return {source_id: full_name(source_id) for source_id in sources}


def get_comments(account_id):
    session = get_thread_session()
    all_comments = []
    offset = 0

    while True:
        url = f"{GETFLY_BASE_URL.rstrip('/')}/api/v6/accounts/{account_id}/comments"
        params = {
            "fields": "content,created_at,creator_display_name",
            "limit": COMMENT_PAGE_LIMIT,
            "offset": offset,
        }
        try:
            response = session.get(url, headers=HEADERS, params=params, timeout=20)
            if response.status_code != 200:
                break
            payload = response.json()
            comments = payload.get("data", [])
            if not comments:
                break
            for comment in comments:
                content = clean_comment_content(comment.get("content"))
                created_at = comment.get("created_at", "")
                creator_name = comment.get("creator_display_name", "")
                all_comments.append(f"[{created_at}] {creator_name}: {content}".strip())
            if not payload.get("has_more", False):
                break
            offset += COMMENT_PAGE_LIMIT
        except Exception:
            break

    return COMMENT_SEPARATOR.join(all_comments)


def build_customer_row(account, source_map, old_data_map):
    source_ids = account.get("account_source_details", []) or []
    first_source = source_ids[0] if source_ids else {}
    source_full_name = source_map.get(first_source.get("id"), "") if isinstance(first_source, dict) else ""

    industry_details = account.get("industry_details", []) or []
    first_industry = industry_details[0] if industry_details else {}
    industry_name = first_industry.get("label", "") if isinstance(first_industry, dict) else ""

    account_type_details = account.get("account_type_details", []) or []
    first_account_type = account_type_details[0] if account_type_details else {}
    customer_group_name = first_account_type.get("label", "") if isinstance(first_account_type, dict) else ""

    relation_detail = account.get("account_relation_detail", {})
    relation_name = relation_detail.get("label", "") if isinstance(relation_detail, dict) else ""

    province_detail = account.get("province_detail", {})
    province_name = province_detail.get("label", "") if isinstance(province_detail, dict) else ""

    account_code = str(account.get("account_code", "")).strip()
    if not account_code:
        return None

    current_updated_at = account.get("updated_at", "")
    current_updated_dt = parse_getfly_datetime(current_updated_at)

    previous_row = old_data_map.get(account_code)
    previous_updated_dt = parse_getfly_datetime(previous_row["updated_at_1"]) if previous_row else None

    is_new = previous_row is None
    is_changed = is_new or (current_updated_dt and (previous_updated_dt is None or current_updated_dt > previous_updated_dt))
    if not is_changed:
        return None

    latest_interaction = get_comments(account.get("id"))
    if not latest_interaction and previous_row:
        latest_interaction = previous_row.get("latest_interaction") or ""

    return {
        "status": "inserted" if is_new else "updated",
        "comment_refreshed": 1,
        "row": (
            account_code,
            account.get("account_name", ""),
            account.get("phone_office", ""),
            account.get("email", ""),
            industry_name,
            customer_group_name,
            account.get("mgr_display_name", ""),
            account.get("total_revenue", 0),
            relation_name,
            source_full_name,
            latest_interaction,
            account.get("description", ""),
            account.get("created_at", ""),
            current_updated_at,
            province_name,
        ),
    }


def save_to_db(items):
    rows = [item["row"] for item in items if item]
    if not rows:
        return
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.executemany(
        """
        INSERT OR REPLACE INTO customers (
            id_1, title, phone_office, email, industry_name, customer_group_name,
            mgr_display_name, total_revenue, relation_name,
            account_source_full_name, latest_interaction,
            description, created_at_1, updated_at_1, province_name
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    conn.commit()
    conn.close()


def process_batch(records, source_map, old_data_map, max_workers):
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        results = list(executor.map(lambda acc: build_customer_row(acc, source_map, old_data_map), records))
    save_to_db(results)
    inserted = sum(1 for item in results if item and item["status"] == "inserted")
    updated = sum(1 for item in results if item and item["status"] == "updated")
    comment_refreshed = sum(item.get("comment_refreshed", 0) for item in results if item)
    return {
        "scanned": len(records),
        "changed": inserted + updated,
        "inserted": inserted,
        "updated": updated,
        "comment_refreshed": comment_refreshed,
    }


def fetch_accounts_page(params):
    session = get_thread_session()
    url = f"{GETFLY_BASE_URL.rstrip('/')}/api/v6/accounts"
    response = session.get(url, headers=HEADERS, params=params, timeout=30)
    if response.status_code != 200:
        return {"data": [], "has_more": False, "status_code": response.status_code}
    payload = response.json()
    return {
        "data": payload.get("data", []),
        "has_more": payload.get("has_more", False),
        "status_code": response.status_code,
    }


def get_run_filter(account_code=None, since_today=False, since_date=None, full_sync=False, lookback_hours=0):
    if account_code:
        return {
            "filter_value": None,
            "message": f"Dang sync rieng khach hang: {account_code}",
            "mode": "single",
            "checkpoint_candidate": None,
        }

    if since_date:
        filter_value = f"{since_date} 00:00:00"
        return {
            "filter_value": filter_value,
            "message": f"Dang sync khach hang co updated_at tu ngay chi dinh: {since_date}",
            "mode": "explicit_date",
            "checkpoint_candidate": filter_value,
        }

    if since_today:
        filter_value = date.today().strftime(TIMESTAMP_FORMAT.replace("%H:%M:%S", "00:00:00"))
        return {
            "filter_value": filter_value,
            "message": f"Dang sync khach hang co updated_at tu hom nay: {filter_value}",
            "mode": "today",
            "checkpoint_candidate": filter_value,
        }

    if full_sync:
        return {
            "filter_value": None,
            "message": "Dang chay full sync toan bo khach hang.",
            "mode": "full_sync",
            "checkpoint_candidate": None,
        }

    sync_state = get_sync_state(SYNC_JOB_NAME)
    checkpoint_raw = sync_state["last_successful_updated_at"] if sync_state else None
    checkpoint_dt = parse_getfly_datetime(checkpoint_raw)
    if checkpoint_dt is None:
        raise RuntimeError("Chua co checkpoint auto sync. Hay chay lan dau bang --since-date YYYY-MM-DD.")

    if lookback_hours > 0:
        checkpoint_dt = checkpoint_dt - timedelta(hours=lookback_hours)

    filter_value = format_dt(checkpoint_dt)
    return {
        "filter_value": filter_value,
        "message": f"Dang chay auto incremental theo checkpoint sync_state: {filter_value}",
        "mode": "checkpoint",
        "checkpoint_candidate": filter_value,
    }


def scrape_getfly(
    limit_pages=None,
    account_code=None,
    since_today=False,
    since_date=None,
    full_sync=False,
    workers=12,
    page_size=100,
    sleep_ms=20,
    lookback_hours=0,
):
    print("--- BAT DAU TRICH XUAT DU LIEU GETFLY ---")
    require_getfly_config()
    init_db()
    old_data_map = build_old_data_map()
    print(f"Da tai {len(old_data_map)} ban ghi tu SQLite de doi chieu.")

    run_filter = get_run_filter(
        account_code=account_code,
        since_today=since_today,
        since_date=since_date,
        full_sync=full_sync,
        lookback_hours=lookback_hours,
    )

    source_map = get_source_map()
    params = {
        "fields": "id,account_name,account_code,phone_office,email,description,total_revenue,mgr_display_name,industry_details,account_type_details,account_source_details,account_relation_detail,created_at,updated_at,province_detail",
        "limit": page_size,
        "offset": 0,
    }

    if account_code:
        params["filtering[account_code:eq]"] = account_code
    elif run_filter["filter_value"]:
        params["filtering[updated_at:gte]"] = run_filter["filter_value"]

    print(run_filter["message"])
    print(f"workers={workers} | page_size={page_size} | sleep_ms={sleep_ms} | lookback_hours={lookback_hours}")

    manages_checkpoint = run_filter["mode"] != "single"
    if manages_checkpoint:
        mark_sync_started(SYNC_JOB_NAME)

    totals = {"scanned": 0, "changed": 0, "inserted": 0, "updated": 0, "comment_refreshed": 0}
    page_count = 0
    started_at = time.perf_counter()
    max_seen_updated_at = parse_getfly_datetime(run_filter["checkpoint_candidate"])
    finished_successfully = False
    stopped_by_limit = False

    try:
        while True:
            if limit_pages and page_count >= limit_pages:
                stopped_by_limit = True
                break

            page = fetch_accounts_page(params)
            records = page["data"]
            if not records:
                finished_successfully = True
                break

            for record in records:
                record_updated_dt = parse_getfly_datetime(record.get("updated_at"))
                if record_updated_dt and (max_seen_updated_at is None or record_updated_dt > max_seen_updated_at):
                    max_seen_updated_at = record_updated_dt

            batch_stats = process_batch(records, source_map, old_data_map, workers)
            for key in totals:
                totals[key] += batch_stats[key]

            page_count += 1
            if not page["has_more"]:
                finished_successfully = True
                break

            params["offset"] += params["limit"]
            print(
                f"\rDa quet {totals['scanned']} KH | trang {page_count} | thay doi {totals['changed']} | moi {totals['inserted']} | cap nhat {totals['updated']} | refresh_comment {totals['comment_refreshed']}",
                end="",
                flush=True,
            )
            if sleep_ms > 0:
                time.sleep(sleep_ms / 1000)
    except Exception as exc:
        print(f"\nLoi: {exc}")
    finally:
        elapsed = round(time.perf_counter() - started_at, 2)
        print()

        if manages_checkpoint:
            if finished_successfully and not stopped_by_limit:
                mark_sync_finished(SYNC_JOB_NAME, "success", format_dt(max_seen_updated_at))
            else:
                mark_sync_finished(SYNC_JOB_NAME, "partial" if stopped_by_limit else "failed")

        final_status = "success" if finished_successfully and not stopped_by_limit else ("partial" if stopped_by_limit else "failed")
        print(
            f"HOAN TAT! status={final_status} pages={page_count} scanned={totals['scanned']} changed={totals['changed']} inserted={totals['inserted']} updated={totals['updated']} refresh_comment={totals['comment_refreshed']} elapsed_seconds={elapsed} checkpoint={format_dt(max_seen_updated_at)}"
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit-pages", type=int, help="Gioi han so trang")
    parser.add_argument("--code", help="Ma khach hang cu the")
    parser.add_argument("--since-today", action="store_true", help="Chi sync khach hang cap nhat hom nay")
    parser.add_argument("--since-date", help="Sync khach hang co updated_at tu ngay YYYY-MM-DD")
    parser.add_argument("--full-sync", action="store_true", help="Quet toan bo thay vi incremental sync")
    parser.add_argument("--workers", type=int, default=min(12, max(4, (os.cpu_count() or 4) * 2)), help="So worker fetch comment song song")
    parser.add_argument("--page-size", type=int, default=100, help="So khach hang moi trang khi goi Getfly")
    parser.add_argument("--sleep-ms", type=int, default=20, help="Thoi gian nghi giua cac trang, tinh bang milliseconds")
    parser.add_argument("--lookback-hours", type=int, default=0, help="Lui checkpoint de quet de phong bo sot, tinh bang gio")
    args = parser.parse_args()
    scrape_getfly(
        limit_pages=args.limit_pages,
        account_code=args.code,
        since_today=args.since_today,
        since_date=args.since_date,
        full_sync=args.full_sync,
        workers=max(1, args.workers),
        page_size=max(1, args.page_size),
        sleep_ms=max(0, args.sleep_ms),
        lookback_hours=max(0, args.lookback_hours),
    )

