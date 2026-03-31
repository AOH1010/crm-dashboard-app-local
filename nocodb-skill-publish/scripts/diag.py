import requests
import json

TOKEN = "Bm0lNQAfXf-_eyVjaP-oLwegiXGSrr3HFNPCGO_j"
HEADERS = {"xc-token": TOKEN}
HOST = "https://app.nocodb.com"

def diag():
    print("--- Listing Bases ---")
    r = requests.get(f"{HOST}/api/v2/meta/bases", headers=HEADERS)
    print(f"Status: {r.status_code}")
    print(r.text)

if __name__ == '__main__':
    diag()
