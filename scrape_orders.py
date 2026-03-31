import sys
import json
import argparse
import os
import time
from datetime import datetime, date

from core import get_db_connection, init_db, get_session, GETFLY_BASE_URL, HEADERS

# Các trường cần lấy từ API Đơn hàng
FIELDS = "id,order_code,account_id,account_code,account_phone,real_amount,discount_amount,vat_amount,order_date,created_at,updated_at,status_label,assigned_user_name,payment_status,has_pay_off,order_details"

def process_order(item):
    """Chuẩn hóa dữ liệu đơn hàng trước khi chèn vào SQL"""
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
    """Lưu danh sách đơn hàng vào SQLite"""
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
    """Quét Đơn hàng từ Getfly và lưu vào SQLite"""
    print("--- BẮT ĐẦU TRÍCH XUẤT ĐƠN HÀNG GETFLY ---")
    
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
        print(f"Đang tìm kiếm đơn hàng với mã (hoặc ID): {order_code}")
        params['filtering[order_code:eq]'] = order_code
        try:
            res = session.get(url, headers=HEADERS, params=params, timeout=15)
            records = res.json().get('data', [])
            if not records:
                if str(order_code).isdigit():
                    print("Không tìm thấy theo mã đơn, thử tìm theo ID...")
                    res_id = session.get(f"{url}/{order_code}", headers=HEADERS, params={'fields': FIELDS}, timeout=15)
                    if res_id.status_code == 200 and 'id' in res_id.json():
                        records = [res_id.json()]
            
            if records:
                processed = [process_order(r) for r in records]
                save_orders_to_db(processed)
                total_processed = len(processed)
                print(f"Đã xử lý {total_processed} đơn hàng.")
            else:
                print("Không tìm thấy đơn hàng.")
        except Exception as e:
            print(f"Lỗi: {e}")
            
    elif since_today:
        today_str = date.today().strftime("%Y-%m-%d 00:00:00")
        print(f"Đang quét tất cả đơn hàng có thay đổi kể từ: {today_str}")
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
                print(f"\rĐã xử lý {total_processed} đơn hàng...", end='', flush=True)
                time.sleep(0.3)
            except Exception as e:
                print(f"\nLỗi: {e}")
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
                print(f"\rĐã xử lý {total_processed} đơn hàng...", end='', flush=True)
                time.sleep(0.3)
            except Exception as e:
                print(f"\nLỗi: {e}")
                break

    print(f"\nHOÀN TẤT! Đã cập nhật {total_processed} đơn hàng vào SQLite.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Script quét đơn hàng từ Getfly vào SQLite")
    parser.add_argument("--limit-pages", type=int, help="Giới hạn số trang quét")
    parser.add_argument("--code", help="Mã đơn hàng hoặc ID cụ thể cần quét")
    parser.add_argument("--since-today", action="store_true", help="Chỉ quét đơn hàng cập nhật hôm nay")
    args = parser.parse_args()
    
    scrape_orders(limit_pages=args.limit_pages, order_code=args.code, since_today=args.since_today)
