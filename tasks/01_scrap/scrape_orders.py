import json
import argparse
import os
import sqlite3
import time
from datetime import date
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

def scrape_orders(limit_pages=None, order_code=None, since_today=False):
    """QuÃ©t ÄÆ¡n hÃ ng tá»« Getfly vÃ  lÆ°u vÃ o SQLite"""
    print("--- Báº®T Äáº¦U TRÃCH XUáº¤T ÄÆ N HÃ€NG GETFLY ---")
    
    init_db()
    session = get_session()
    total_processed = 0
    url = f"{GETFLY_BASE_URL.rstrip('/')}/api/v6/sale_orders"
    
    params = {
        'fields': FIELDS,
        'limit': 100,
        'offset': 0
    }

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
                processed = [process_order(r) for r in records]
                save_orders_to_db(processed)
                total_processed = len(processed)
                print(f"ÄÃ£ xá»­ lÃ½ {total_processed} Ä‘Æ¡n hÃ ng.")
            else:
                print("KhÃ´ng tÃ¬m tháº¥y Ä‘Æ¡n hÃ ng.")
        except Exception as e:
            print(f"Lá»—i: {e}")
            
    elif since_today:
        today_str = date.today().strftime("%Y-%m-%d 00:00:00")
        print(f"Äang quÃ©t táº¥t cáº£ Ä‘Æ¡n hÃ ng cÃ³ thay Ä‘á»•i ká»ƒ tá»«: {today_str}")
        params['filtering[updated_at:gte]'] = today_str
        
        while True:
            try:
                res = session.get(url, headers=HEADERS, params=params, timeout=15)
                if res.status_code != 200: break
                
                data_json = res.json()
                batch_records = data_json.get('data', [])
                if not batch_records: break
                
                processed = [process_order(r) for r in batch_records]
                save_orders_to_db(processed)
                total_processed += len(processed)
                
                if not data_json.get('has_more', False): break
                params['offset'] += 100
                print(f"\rÄÃ£ xá»­ lÃ½ {total_processed} Ä‘Æ¡n hÃ ng...", end='', flush=True)
                time.sleep(0.3)
            except Exception as e:
                print(f"\nLá»—i: {e}")
                break
    else:
        page_count = 0
        while True:
            if limit_pages and page_count >= limit_pages: break
            try:
                res = session.get(url, headers=HEADERS, params=params, timeout=15)
                if res.status_code != 200: break
                
                data_json = res.json()
                batch_records = data_json.get('data', [])
                if not batch_records: break
                
                processed = [process_order(r) for r in batch_records]
                save_orders_to_db(processed)
                total_processed += len(processed)
                
                if not data_json.get('has_more', False): break
                params['offset'] += 100
                page_count += 1
                print(f"\rÄÃ£ xá»­ lÃ½ {total_processed} Ä‘Æ¡n hÃ ng...", end='', flush=True)
                time.sleep(0.3)
            except Exception as e:
                print(f"\nLá»—i: {e}")
                break

    print(f"\nHOÃ€N Táº¤T! ÄÃ£ cáº­p nháº­t {total_processed} Ä‘Æ¡n hÃ ng vÃ o SQLite.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Script quÃ©t Ä‘Æ¡n hÃ ng tá»« Getfly vÃ o SQLite")
    parser.add_argument("--limit-pages", type=int, help="Giá»›i háº¡n sá»‘ trang quÃ©t")
    parser.add_argument("--code", help="MÃ£ Ä‘Æ¡n hÃ ng hoáº·c ID cá»¥ thá»ƒ cáº§n quÃ©t")
    parser.add_argument("--since-today", action="store_true", help="Chá»‰ quÃ©t Ä‘Æ¡n hÃ ng cáº­p nháº­t hÃ´m nay")
    args = parser.parse_args()
    
    scrape_orders(limit_pages=args.limit_pages, order_code=args.code, since_today=args.since_today)

