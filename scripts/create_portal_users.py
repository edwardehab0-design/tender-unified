#!/usr/bin/env python3
"""
create_portal_users.py
======================
ينشئ حسابات Supabase لأعضاء فريق إدارة المناقصات بناءً على
coordination/portal_roster.json (المصدر المعتمد: الهيكل التنظيمي بالإيميلات).

الاستخدام:
    python scripts/create_portal_users.py \
        --supabase-url  https://xxxx.supabase.co \
        --service-key   sb_service_... \
        [--dry-run]                  # معاينة بدون إنشاء فعلي
        [--emails ronnie@alrawaf.com.sa ...]   # اختياري: حدد بريداً معيناً

المخرجات:
    users_created.csv — يحتوي البريد الإلكتروني وكلمة المرور المؤقتة العشوائية
                        (هذا الملف فقط يحمل كلمات المرور، وهو مُستثنى من Git
                         ويُرفع كأثر workflow قصير المدة فقط — لا يُحفظ في المستودع)

ملاحظات أمنية:
    • لا تُخزَّن كلمات المرور أو الأرقام الوظيفية داخل المستودع إطلاقاً.
    • تُولَّد كلمة مرور عشوائية قوية لكل مستخدم وقت الإنشاء.
    • وزّع كلمات المرور من users_created.csv عبر قناة آمنة، وكل مستخدم
      يغيّرها عند أول دخول.
"""

import argparse
import csv
import json
import secrets
import string
import sys
import time
from pathlib import Path


def generate_password(length=14):
    """كلمة مرور عشوائية قوية: حروف كبيرة/صغيرة + أرقام + رمز."""
    alphabet = string.ascii_letters + string.digits
    core = "".join(secrets.choice(alphabet) for _ in range(length - 2))
    # نضمن وجود رقم ورمز لتلبية سياسات كلمة المرور
    return f"{core}{secrets.choice(string.digits)}{secrets.choice('!@#$%&*')}"

# ── تبعيات ────────────────────────────────────────────────────────────────────
try:
    import requests
except ImportError:
    sys.exit("❌  pip install requests")

# ── ثوابت ─────────────────────────────────────────────────────────────────────
ROSTER_JSON = Path(__file__).parent.parent / "coordination" / "portal_roster.json"


def load_roster(filter_emails=None):
    """يقرأ سجل الـ 58 موظفاً المعتمد ويُعيد قائمة موحّدة."""
    with open(ROSTER_JSON, encoding="utf-8") as f:
        data = json.load(f)

    roster = data.get("roster", [])

    if filter_emails:
        wanted = {e.lower() for e in filter_emails}
        roster = [r for r in roster if r["email"].lower() in wanted]

    return roster


def create_supabase_user(base_url, service_key, email, password, full_name):
    """POST /auth/v1/admin/users لإنشاء مستخدم في Supabase Auth"""
    url = f"{base_url.rstrip('/')}/auth/v1/admin/users"
    headers = {
        "apikey":        service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type":  "application/json",
    }
    payload = {
        "email":         email,
        "password":      password,
        "email_confirm": True,   # لا يحتاج تأكيد بريد
        "user_metadata": {"full_name": full_name},
    }
    r = requests.post(url, headers=headers, json=payload, timeout=15)
    try:
        return r.status_code, r.json()
    except ValueError:
        return r.status_code, {"message": r.text}


def list_all_users(base_url, service_key):
    """يبني خريطة البريد → user_id لكل مستخدمي Supabase Auth (لدعم التدوير)."""
    url = f"{base_url.rstrip('/')}/auth/v1/admin/users"
    headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}"}
    mapping = {}
    page = 1
    while True:
        r = requests.get(url, headers=headers, params={"page": page, "per_page": 200}, timeout=20)
        if r.status_code != 200:
            break
        data = r.json()
        batch = data.get("users", data if isinstance(data, list) else [])
        if not batch:
            break
        for u in batch:
            if u.get("email"):
                mapping[u["email"].lower()] = u["id"]
        if len(batch) < 200:
            break
        page += 1
    return mapping


def update_user_password(base_url, service_key, user_id, password):
    """PUT /auth/v1/admin/users/{id} لتدوير كلمة مرور مستخدم قائم."""
    url = f"{base_url.rstrip('/')}/auth/v1/admin/users/{user_id}"
    headers = {
        "apikey":        service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type":  "application/json",
    }
    r = requests.put(url, headers=headers, json={"password": password}, timeout=15)
    return r.status_code


def upsert_profile(base_url, service_key, user_id, full_name, role, department_key):
    """POST /rest/v1/profiles لإضافة/تحديث صف الـ profile"""
    url = f"{base_url.rstrip('/')}/rest/v1/profiles"
    headers = {
        "apikey":        service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type":  "application/json",
        "Prefer":        "resolution=merge-duplicates",
    }
    payload = {
        "id":             user_id,
        "full_name":      full_name,
        "role":           role,
        "department_key": department_key,
    }
    r = requests.post(url, headers=headers, json=payload, timeout=15)
    return r.status_code


def main():
    parser = argparse.ArgumentParser(description="Create Supabase portal users")
    parser.add_argument("--supabase-url", required=True, help="https://xxxx.supabase.co")
    parser.add_argument("--service-key",  required=True, help="Service Role Key")
    parser.add_argument("--emails",       nargs="*",     help="بريد محدد (اختياري)")
    parser.add_argument("--dry-run",      action="store_true", help="معاينة بدون إنشاء فعلي")
    parser.add_argument("--rotate",       action="store_true",
                        help="تدوير كلمة مرور المستخدمين القائمين (لإبطال أي كلمات مرور مسرّبة)")
    parser.add_argument("--set-password", default=None,
                        help="تعيين كلمة مرور محددة لكل البريد المستهدف بدل العشوائية")
    args = parser.parse_args()

    # تعيين كلمة مرور محددة يستلزم تحديث المستخدمين القائمين
    if args.set_password:
        args.rotate = True

    roster = load_roster(filter_emails=args.emails)
    if not roster:
        sys.exit("❌  لا توجد بيانات — تحقق من portal_roster.json أو --emails")

    mode_label = "🔍 DRY RUN — معاينة فقط" if args.dry_run else (
        "🔁 إنشاء + تدوير كلمات المرور" if args.rotate else "🚀 إنشاء المستخدمين")
    print(f"\n{mode_label}")
    print(f"{'─'*70}")
    print(f"عدد الموظفين: {len(roster)}")
    print(f"{'─'*70}\n")

    # خريطة البريد → user_id لتدوير القائمين منهم
    existing = {} if (args.dry_run or not args.rotate) else list_all_users(
        args.supabase_url, args.service_key)

    results = []
    ok = fail = skip = 0

    for emp in roster:
        email  = emp["email"]
        pwd    = args.set_password or generate_password()
        role   = emp["role"]
        dept_k = emp["department_key"]
        name   = emp["name"]
        tag    = dept_k or "GENERAL"

        print(f"[{tag:7}] {name:<32} {email}")

        if args.dry_run:
            results.append({"name": name, "email": email, "password": pwd,
                            "role": role, "department": dept_k or "—", "status": "preview"})
            continue

        status_code, resp = create_supabase_user(
            args.supabase_url, args.service_key, email, pwd, name
        )

        if status_code == 200 and resp.get("id"):
            user_id = resp["id"]
            prof_code = upsert_profile(
                args.supabase_url, args.service_key, user_id, name, role, dept_k
            )
            status = "✅ تم" if prof_code in (200, 201) else f"⚠️ profile={prof_code}"
            ok += 1
        elif status_code in (422, 400) and "already" in str(resp).lower():
            if args.rotate:
                user_id = existing.get(email.lower())
                if user_id:
                    pw_code = update_user_password(args.supabase_url, args.service_key, user_id, pwd)
                    upsert_profile(args.supabase_url, args.service_key, user_id, name, role, dept_k)
                    status = "🔁 تم تدوير كلمة المرور" if pw_code in (200, 201) else f"⚠️ rotate={pw_code}"
                    if pw_code in (200, 201):
                        ok += 1
                    else:
                        fail += 1
                else:
                    status = "⚠️ موجود لكن تعذّر إيجاد المعرّف للتدوير"
                    fail += 1
            else:
                status = "⏭ موجود مسبقاً"
                skip += 1
        else:
            status = f"❌ {resp.get('message', status_code)}"
            fail += 1

        print(f"         → {status}")
        results.append({"name": name, "email": email, "password": pwd,
                        "role": role, "department": dept_k or "—", "status": status})
        time.sleep(0.2)  # لتجنب rate limit

    # ── تصدير CSV ───────────────────────────────────────────────────────────────
    out = Path("users_created.csv")
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=["name", "email", "password", "role", "department", "status"])
        writer.writeheader()
        writer.writerows(results)

    print(f"\n{'─'*70}")
    if not args.dry_run:
        print(f"✅ تم إنشاؤهم:    {ok}")
        print(f"⏭ موجودون مسبقاً: {skip}")
        print(f"❌ فشل:           {fail}")
    print(f"📄 النتائج محفوظة في: {out.resolve()}")
    print("\n⚠️  كلمات المرور المؤقتة قابلة للتغيير عند أول دخول.")


if __name__ == "__main__":
    main()
