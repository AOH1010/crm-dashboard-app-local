import os
import sqlite3
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURATION ---
GETFLY_API_KEY = os.environ.get("GETFLY_API_KEY")
GETFLY_BASE_URL = os.environ.get("GETFLY_BASE_URL")
if not GETFLY_BASE_URL:
    GETFLY_BASE_URL = "https://jega.getflycrm.com/"
DB_FILE = os.path.join(os.path.dirname(__file__), "data", "crm.db")

HEADERS = {
    "X-API-KEY": GETFLY_API_KEY,
    "Content-Type": "application/json"
}

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Initialize customers table
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
    
    # Initialize orders table
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
    
    # Adding indexes as requested in Phase 1 plan
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
    """Tạo requests session với Retry & Timeout"""
    session = requests.Session()
    retry = Retry(
        total=5,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"]
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session
