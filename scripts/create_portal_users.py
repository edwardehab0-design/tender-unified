#!/usr/bin/env python3
"""
create_portal_users.py
======================
ينشئ حسابات Supabase لأعضاء فريق إدارة المناقصات بناءً على employees.json

الاستخدام:
    python scripts/create_portal_users.py \
        --supabase-url  https://xxxx.supabase.co \
        --service-key   sb_service_... \
        --domain        alrawaf.com \
        [--dry-run]                  # معاينة بدون إنشاء فعلي
        [--ids 11117958 11114645]    # اختياري: حدد أرقام الموظفين

المخرجات:
    users_created.csv — يحتوي البريد الإلكتروني وكلمة المرور المؤقتة
"""

import argparse
import csv
import json
import os
import re
import sys
import time
from pathlib import Path

# ── تبعيات ────────────────────────────────────────────────────────────────────
try:
    import requests
except ImportError:
    sys.exit("❌  pip install requests")

# ── ثوابت ─────────────────────────────────────────────────────────────────────
EMPLOYEES_JSON = Path(__file__).parent.parent / "coordination" / "employees.json"

# الأقسام التنفيذية (executive) — الباقي يصبح department
EXECUTIVE_KEYS = {"GENERAL"}

# تعيين department_key لكل قسم
DEPT_KEY_MAP = {
    "GENERAL": None,   # الإدارة العامة: executive بلا قسم
    "BS":      "BS",
    "INF":     "INF",
    "TECH":    "TECH",
    "DESIGN":  "DESIGN",
}


def load_employees(filter_ids=None):
    """
    يُعيد قائمة بالموظفين المطلوبين بصيغة موحّدة:
    { employeeId, name, email_local, departmentKey, role, department_key }
    """
    with open(EMPLOYEES_JSON, encoding="utf-8") as f:
        data = json.load(f)

    employees = []

    # الإدارة العامة
    for m in data.get("generalManagement", []):
        employees.append({
            "employeeId":    m["employeeId"],
            "name":          m["name"],
            "departmentKey": "GENERAL",
        })

    # الأقسام
    for dept in data.get("departments", []):
        dkey = dept["key"]
        for m in dept.get("employees", []):
            employees.append({
                "employeeId":    m["employeeId"],
                "name":          m["name"],
                "departmentKey": dkey,
            })

    # فلتر بالأرقام إن طُلب
    if filter_ids:
        employees = [e for e in employees if e["employeeId"] in set(filter_ids)]

    return employees


def arabic_to_slug(name):
    """يُنتج جزء بريد من الاسم: أول كلمة + آخر كلمة بالحروف اللاتينية."""
    # نُبقي الأحرف اللاتينية أو نرقّمها — إن كان الاسم عربياً بالكامل نستخدم الرقم
    parts = name.strip().split()
    if all(re.fullmatch(r'[؀-ۿ\s]+', p) for p in parts):
        return None  # عربي بالكامل → سنستخدم employeeId
    # اسم لاتيني
    slug = (parts[0] + "." + parts[-1]).lower() if len(parts) > 1 else parts[0].lower()
    return re.sub(r'[^a-z0-9.]', '', slug)


def build_email(emp, domain):
    slug = arabic_to_slug(emp["name"])
    if not slug:
        return f"{emp['employeeId']}@{domain}"
    return f"{slug}@{domain}"


def temp_password(emp):
    """كلمة مرور مؤقتة: Alrawaf@{رقمالموظف} — يجب تغييرها عند أول دخول"""
    return f"Alrawaf@{emp['employeeId']}"


def create_supabase_user(base_url, service_key, email, password, full_name):
    """POST /admin/v1/users لإنشاء مستخدم في Supabase Auth"""
    url = f"{base_url.rstrip('/')}/auth/v1/admin/users"
    headers = {
        "apikey":        service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type":  "application/json",
    }
    payload = {
        "email":              email,
        "password":           password,
        "email_confirm":      True,   # لا يحتاج تأكيد بريد
        "user_metadata":      {"full_name": full_name},
    }
    r = requests.post(url, headers=headers, json=payload, timeout=15)
    return r.status_code, r.json()


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
    parser.add_argument("--supabase-url",  required=True, help="https://xxxx.supabase.co")
    parser.add_argument("--service-key",   required=True, help="Service Role Key")
    parser.add_argument("--domain",        required=True, help="نطاق البريد، مثل alrawaf.com")
    parser.add_argument("--ids",           nargs="*",     help="أرقام موظفين محددين (اختياري)")
    parser.add_argument("--dry-run",       action="store_true", help="معاينة بدون إنشاء فعلي")
    args = parser.parse_args()

    employees = load_employees(filter_ids=args.ids)
    if not employees:
        sys.exit("❌  لا توجد بيانات موظفين — تحقق من employees.json أو --ids")

    print(f"\n{'🔍 DRY RUN — معاينة فقط' if args.dry_run else '🚀 إنشاء المستخدمين'}")
    print(f"{'─'*60}")
    print(f"عدد الموظفين: {len(employees)}")
    print(f"{'─'*60}\n")

    results = []
    ok = fail = skip = 0

    for emp in employees:
        email   = build_email(emp, args.domain)
        pwd     = temp_password(emp)
        dkey    = emp["departmentKey"]
        role    = "executive" if dkey in EXECUTIVE_KEYS else "department"
        dept_k  = DEPT_KEY_MAP.get(dkey)
        name    = emp["name"]

        print(f"[{dkey:7}] {name:<40} {email}")

        if args.dry_run:
            results.append({"name": name, "email": email, "password": pwd,
                             "role": role, "department": dept_k or "—", "status": "preview"})
            continue

        # إنشاء المستخدم
        status_code, resp = create_supabase_user(
            args.supabase_url, args.service_key, email, pwd, name
        )

        if status_code == 200 and resp.get("id"):
            user_id = resp["id"]
            prof_code = upsert_profile(
                args.supabase_url, args.service_key,
                user_id, name, role, dept_k
            )
            status = "✅ تم" if prof_code in (200, 201) else f"⚠️ profile={prof_code}"
            ok += 1
        elif status_code == 422 and "already" in str(resp).lower():
            status = "⏭ موجود مسبقاً"
            user_id = resp.get("id", "—")
            skip += 1
        else:
            status = f"❌ {resp.get('message', status_code)}"
            user_id = "—"
            fail += 1

        print(f"         → {status}")
        results.append({"name": name, "email": email, "password": pwd,
                         "role": role, "department": dept_k or "—", "status": status})
        time.sleep(0.2)  # لتجنب rate limit

    # ── تصدير CSV ───────────────────────────────────────────────────────────────
    out = Path("users_created.csv")
    with open(out, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=["name","email","password","role","department","status"])
        writer.writeheader()
        writer.writerows(results)

    print(f"\n{'─'*60}")
    if not args.dry_run:
        print(f"✅ تم إنشاؤهم:   {ok}")
        print(f"⏭ موجودون مسبقاً: {skip}")
        print(f"❌ فشل:          {fail}")
    print(f"📄 النتائج محفوظة في: {out.resolve()}")
    print(f"\n⚠️  كلمة المرور المؤقتة: Alrawaf@رقمالموظف — يجب التغيير عند أول دخول")


if __name__ == "__main__":
    main()
