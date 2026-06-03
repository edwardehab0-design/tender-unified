"""
import_tenders.py
شغّل هذا مرة واحدة لرفع المناقصات من data.json إلى Supabase.

استخدام:
  pip install supabase
  SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=... python scripts/import_tenders.py
"""
import json, os, sys
from datetime import datetime
from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
# استخدم Service Role Key (من Settings → API) لتجاوز RLS أثناء الاستيراد
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: set SUPABASE_URL and SUPABASE_SERVICE_KEY as env variables.")
    sys.exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_KEY)

with open("data.json", encoding="utf-8") as f:
    raw = json.load(f)

tenders = raw.get("tenders", [])
rows = []
for t in tenders:
    def safe_date(v):
        if not v: return None
        try: datetime.fromisoformat(str(v)[:10]); return str(v)[:10]
        except: return None

    rows.append({
        "id":             t.get("tender_id") or t.get("id"),
        "title":          t.get("اسم المناقصة") or t.get("title") or "",
        "client":         t.get("المالك") or t.get("client") or "",
        "sector":         t.get("القطاع") or t.get("sector") or "",
        "work_type":      t.get("نوع الأعمال") or "",
        "submit_date":    safe_date(t.get("تاريخ التقديم") or t.get("submitDate")),
        "guarantee_date": safe_date(t.get("تاريخ الضمان الابتدائي")),
        "external_status":t.get("الحالة") or "",
        "fetched_at":     t.get("fetched_at"),
    })

if not rows:
    print("No tenders found in data.json"); sys.exit(0)

result = sb.table("tenders").upsert(rows).execute()
print(f"✓ Imported {len(rows)} tenders into Supabase.")
