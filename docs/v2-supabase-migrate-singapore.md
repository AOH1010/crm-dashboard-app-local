# V2 Supabase Migration To Singapore

Muc tieu: tao mot Supabase project moi o Singapore, nap lai schema/data, roi doi local runtime sang project moi ma khong sua code business.

## 1. Cai gi thuc su phai doi

Repo hien tai khong bi khoa cung theo project Korea trong code runtime. Phan phu thuoc project/vung chi nam o:

- `.env`
- file mau [apps/backend/.env.example](/f:/crm-dashboard-app-local/apps/backend/.env.example)
- thao tac seed/migration o Supabase Dashboard hoac script local

Nhung thu giu nguyen:

- schema `crm_agent`
- migration [0001_crm_agent_schema.sql](/f:/crm-dashboard-app-local/supabase/migrations/0001_crm_agent_schema.sql)
- `SupabaseConnector`
- skill/runtime/query logic

## 2. Tao project Singapore

Trong Supabase Dashboard:

1. Tao project moi.
2. Chon region Singapore.
3. Luu lai:
   - `PROJECT_REF`
   - database password cua `postgres`
   - pooler host/port

Goi y:

- Neu project o Singapore, pooler host thuong theo dang `aws-ap-southeast-1.pooler.supabase.com`
- Dung password URL-safe de do loi `.env`: chi chu + so la tot nhat trong giai doan setup

## 3. Apply schema

Trong `SQL Editor`, paste va chay toan bo file:

- [0001_crm_agent_schema.sql](/f:/crm-dashboard-app-local/supabase/migrations/0001_crm_agent_schema.sql)

Kiem tra nhanh:

```sql
select table_name
from information_schema.tables
where table_schema = 'crm_agent'
order by table_name;
```

Ky vong: co 15 bang.

## 4. Tao read-only role

Trong `SQL Editor`, chay:

```sql
create role crm_agent_readonly login password 'YOUR_NEW_READONLY_PASSWORD';

grant usage on schema crm_agent to crm_agent_readonly;
grant select on all tables in schema crm_agent to crm_agent_readonly;
alter default privileges in schema crm_agent grant select on tables to crm_agent_readonly;
```

Neu role da ton tai:

```sql
alter role crm_agent_readonly with password 'YOUR_NEW_READONLY_PASSWORD';

grant usage on schema crm_agent to crm_agent_readonly;
grant select on all tables in schema crm_agent to crm_agent_readonly;
alter default privileges in schema crm_agent grant select on tables to crm_agent_readonly;
```

## 5. Doi `.env`

Giu local runtime an toan theo 2 phase.

### Phase A: seed/check, chua switch mac dinh

```env
CRM_DATA_CONNECTOR=sqlite
CRM_AGENT_DB_SCHEMA=crm_agent
SUPABASE_DATABASE_URL="postgresql://crm_agent_readonly.NEW_PROJECT_REF:YOUR_NEW_READONLY_PASSWORD@aws-ap-southeast-1.pooler.supabase.com:6543/postgres"
SUPABASE_SEED_DATABASE_URL="postgresql://postgres.NEW_PROJECT_REF:YOUR_NEW_POSTGRES_PASSWORD@aws-ap-southeast-1.pooler.supabase.com:6543/postgres"
```

Luu y:

- Voi pooler, username phai co suffix `.<PROJECT_REF>`
- Read-only runtime user:
  - `crm_agent_readonly.NEW_PROJECT_REF`
- Seed/admin user:
  - `postgres.NEW_PROJECT_REF`

### Phase B: sau khi seed + parity pass

```env
CRM_DATA_CONNECTOR=supabase
CRM_AGENT_DB_SCHEMA=crm_agent
SUPABASE_DATABASE_URL="postgresql://crm_agent_readonly.NEW_PROJECT_REF:YOUR_NEW_READONLY_PASSWORD@aws-ap-southeast-1.pooler.supabase.com:6543/postgres"
SUPABASE_SEED_DATABASE_URL="postgresql://postgres.NEW_PROJECT_REF:YOUR_NEW_POSTGRES_PASSWORD@aws-ap-southeast-1.pooler.supabase.com:6543/postgres"
```

## 6. Seed lai data sang project Singapore

Chay:

```powershell
npm run v2:seed-supabase
```

Script se dung `SUPABASE_SEED_DATABASE_URL`.

## 7. Smoke + parity

Chay lan luot:

```powershell
npm run v2:supabase-smoke
npm run v2:supabase-parity-smoke
```

Ky vong:

- `v2:supabase-smoke`: `ok: true`
- `v2:supabase-parity-smoke`: `ok: true`

Neu parity fail thi chua switch `CRM_DATA_CONNECTOR=supabase`.

## 8. Test local runtime that

Sau khi parity pass:

1. doi `.env` sang `CRM_DATA_CONNECTOR=supabase`
2. chay app local
3. test nhanh:
   - widget
   - Chat Lab
   - mot so case dai dien seller / KPI / compare / renew / operations

## 9. Checklist toi thieu truoc khi bo project Korea

- project Singapore co du 15 bang `crm_agent`
- seed thanh cong
- read-only smoke pass
- parity smoke pass
- runtime local chat pass
- widget + Chat Lab khong regression ro

## 10. Dieu toi can tu ban khi bat dau migrate that

Khi ban tao xong project Singapore, chi can gui:

- `NEW_PROJECT_REF`
- host pooler Singapore
- xac nhan da apply migration + tao `crm_agent_readonly`

Khong can gui password vao chat. Toi se huong dan dung dong `.env` de ban tu dien local.
