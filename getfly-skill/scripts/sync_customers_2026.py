import sys
import json
import requests
import argparse
import os
from datetime import datetime

# --- CONFIGURATION ---
GETFLY_API_KEY = os.environ.get("GETFLY_API_KEY", "biagyVJ9WhDnkLQi72a0hIzDvRWl6z")
GETFLY_BASE_URL = os.environ.get("GETFLY_BASE_URL", "https://jega.getflycrm.com/")

# Cấu hình NocoDB Self-hosted
NOCODB_API_KEY = "Bm0lNQAfXf-_eyVjaP-oLwegiXGSrr3HFNPCGO_j"
NOCODB_BASE_URL = "https://db02.clik.vn"
TABLE_ID = "mjsyzrplt6vl2mp"

GETFLY_HEADERS = {
    "X-API-KEY": GETFLY_API_KEY,
    "Content-Type": "application/json"
}

NOCODB_HEADERS = {
    "xc-token": NOCODB_API_KEY,
    "Content-Type": "application/json"
}

def get_source_map():
    """Xây dựng hierarchy map cho nguồn khách hàng"""
    url = f"{GETFLY_BASE_URL.rstrip('/')}/api/v6/accounts/sources"
    params = {'fields': 'id,source_name,parent_id,lvl', 'limit': 1000}
    response = requests.get(url, headers=GETFLY_HEADERS, params=params)
    if response.status_code != 200:
        return {}
    
    sources = {s['id']: s for s in response.json().get('data', [])}
    
    def get_full_name(source_id):
        path = []
        curr_id = source_id
        while curr_id in sources:
            s = sources[curr_id]
            path.append(s['source_name'])
            curr_id = s.get('parent_id')
            if curr_id == 0: break
        return " > ".join(reversed(path))

    return {sid: get_full_name(sid) for sid in sources}

def get_comments(account_id):
    """Lấy 3 bình luận gần nhất"""
    url = f"{GETFLY_BASE_URL.rstrip('/')}/api/v6/accounts/{account_id}/comments"
    params = {'fields': 'content,created_at,creator_display_name', 'limit': 3}
    response = requests.get(url, headers=GETFLY_HEADERS, params=params)
    if response.status_code != 200:
        return ""
    
    comments = response.json().get('data', [])
    formatted = []
    for c in comments:
        # Làm sạch HTML cơ bản
        content = c['content'].replace('<p>', '').replace('</p>', '').replace('<br />', '\n').strip()
        formatted.append(f"[{c['created_at']}] {c['creator_display_name']}: {content}")
    
    return "\n---\n".join(formatted)

def sync_account(account_code=None):
    source_map = get_source_map()
    
    # Lấy thông tin account
    url = f"{GETFLY_BASE_URL.rstrip('/')}/api/v6/accounts"
    params = {
        'fields': 'id,account_name,account_code,phone_office,email,description,total_revenue,mgr_display_name,industry_details,account_source_details,account_relation_detail,created_at',
        'limit': 1
    }
    if account_code:
        params['filtering[account_code:eq]'] = account_code

    response = requests.get(url, headers=GETFLY_HEADERS, params=params)
    if response.status_code != 200 or not response.json().get('data'):
        print(f"Không tìm thấy khách hàng {account_code}")
        return

    acc = response.json()['data'][0]
    print(f"Đang xử lý: {acc['account_name']} ({acc['account_code']})")

    # Xử lý dữ liệu
    source_ids = acc.get('account_source_details', [])
    source_full_name = source_map.get(source_ids[0]['id'], "") if source_ids else ""
    
    industry_details = acc.get('industry_details', [])
    industry_name = industry_details[0]['label'] if industry_details else ""
    
    relation_detail = acc.get('account_relation_detail', {})
    relation_name = relation_detail.get('label', "")
    
    comments_text = get_comments(acc['id'])

    # PAYLOAD ĐÃ LOẠI BỎ ACCOUNT_CODE (VÌ DÙNG CHUNG TRONG id_1)
    payload = {
        "id_1": acc['account_code'], # ID Getfly (Hiển thị Mã KH)
        "title": acc['account_name'], # Tên khách hàng
        "phone_office": acc['phone_office'],
        "email": acc['email'],
        "industry_name": industry_name,
        "mgr_display_name": acc['mgr_display_name'],
        "total_revenue": acc['total_revenue'],
        "relation_name": relation_name,
        "account_source_full_name": source_full_name,
        "latest_interaction": comments_text,
        "description": acc['description'],
        "created_at_1": acc['created_at']
    }

    # Đẩy lên NocoDB
    noco_url = f"{NOCODB_BASE_URL}/api/v2/tables/{TABLE_ID}/records"
    
    # Check exist bằng id_1
    check_url = f"{noco_url}?where=(id_1,eq,{acc['account_code']})"
    check_res = requests.get(check_url, headers=NOCODB_HEADERS)
    
    if check_res.status_code == 200:
        records = check_res.json().get('list', [])
        if records:
            row_id = records[0].get('Id') or records[0].get('id')
            res = requests.patch(noco_url, headers=NOCODB_HEADERS, json={"Id": row_id, **payload})
            action = "Cập nhật"
        else:
            res = requests.post(noco_url, headers=NOCODB_HEADERS, json=payload)
            action = "Thêm mới"
    else:
        res = requests.post(noco_url, headers=NOCODB_HEADERS, json=payload)
        action = "Thêm mới (không check)"

    if res.status_code in [200, 201]:
        print(f"✅ {action} thành công khách hàng {acc['account_code']} lên NocoDB.")
    else:
        print(f"❌ Lỗi khi đẩy lên NocoDB: {res.status_code} - {res.text}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--code", help="Mã khách hàng cần đồng bộ thử nghiệm")
    args = parser.parse_args()
    
    sync_account(args.code)
