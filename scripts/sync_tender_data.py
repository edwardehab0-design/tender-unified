"""
Cloud sync for the unified tender portal.

Fetches both live in-progress tenders and submitted tenders from the Tender
site, then writes a single root data.json consumed by Cloudflare Pages.
"""

import hashlib
import json
import logging
import os
from datetime import datetime
from io import BytesIO

import openpyxl
import requests
from bs4 import BeautifulSoup
from msal import PublicClientApplication


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

ALRAWAF_URL = "https://www.alrawaf-ms.com"
ALRAWAF_USER = os.getenv("ALRAWAF_USERNAME")
ALRAWAF_PASS = os.getenv("ALRAWAF_PASSWORD")
ALRAWAF_CLIENT_ID = os.getenv("ALRAWAF_CLIENT_ID", "8e8af720-b54b-4f52-8858-95109b4a2c5d")
ALRAWAF_TENANT = os.getenv("ALRAWAF_TENANT", "alrawaf.com.sa")
OUTPUT_FILE = os.getenv("OUTPUT_FILE", "data.json")


class AlrawafClient:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        })
        self._token = None

    def get_token(self):
        if self._token:
            return self._token

        app = PublicClientApplication(
            ALRAWAF_CLIENT_ID,
            authority=f"https://login.microsoftonline.com/{ALRAWAF_TENANT}",
        )
        scopes_to_try = [
            [f"api://{ALRAWAF_CLIENT_ID}/user_impersonation"],
            ["https://graph.microsoft.com/User.Read"],
        ]

        for scopes in scopes_to_try:
            result = app.acquire_token_by_username_password(
                username=ALRAWAF_USER,
                password=ALRAWAF_PASS,
                scopes=scopes,
            )
            if "access_token" in result:
                self._token = result["access_token"]
                log.info("Microsoft token acquired for Tender site")
                return self._token
            log.warning("Token attempt failed: %s", result.get("error_description", "")[:240])

        return None

    def auth_session(self):
        token = self.get_token()
        if token:
            self.session.headers.update({"Authorization": f"Bearer {token}"})

    def fetch_excel(self, url, row_map):
        try:
            response = self.session.get(url, timeout=30)
            if response.status_code != 200 or len(response.content) < 100:
                log.warning("Excel download failed from %s: %s", url, response.status_code)
                return []

            workbook = openpyxl.load_workbook(BytesIO(response.content), read_only=True, data_only=True)
            sheet = workbook.active
            headers = [cell.value for cell in next(sheet.iter_rows(min_row=1, max_row=1))]
            log.info("Excel headers from %s: %s", url.rstrip("/").split("/")[-1], headers)

            def to_str(value):
                if value is None:
                    return ""
                return str(value).replace(" 00:00:00", "").strip()

            tenders = []
            for row in sheet.iter_rows(min_row=2, values_only=True):
                if not any(row):
                    continue
                title_idx = row_map.get("اسم المناقصة", 3)
                title = to_str(row[title_idx]) if len(row) > title_idx else ""
                if not title:
                    continue

                tender = {"tender_id": hashlib.md5(title.encode("utf-8")).hexdigest()[:12]}
                for field, idx in row_map.items():
                    tender[field] = to_str(row[idx]) if len(row) > idx else ""
                tender["fetched_at"] = datetime.now().isoformat()
                tenders.append(tender)

            log.info("Fetched %s rows from %s", len(tenders), url)
            return tenders
        except Exception as exc:
            log.error("Excel fetch error from %s: %s", url, exc)
            return []

    def fetch_in_progress(self):
        self.auth_session()
        row_map = {
            "اسم المناقصة": 3,
            "تاريخ التقديم": 5,
            "تاريخ الضمان الابتدائي": 4,
            "المالك": 6,
            "نوع الأعمال": 7,
            "القطاع": 8,
            "الحالة": 9,
        }
        tenders = self.fetch_excel(
            f"{ALRAWAF_URL}/en/tendering/export_to_excel_in_progress_tender/",
            row_map,
        )
        for tender in tenders:
            tender["الحالة"] = "جارية"
        return tenders

    def fetch_submitted(self):
        self.auth_session()
        row_map = {
            "اسم المناقصة": 3,
            "تاريخ التقديم": 5,
            "تاريخ الضمان الابتدائي": 4,
            "المالك": 6,
            "نوع الأعمال": 7,
            "القطاع": 8,
        }
        export_urls = [
            f"{ALRAWAF_URL}/en/tendering/export_to_excel_submitted_tender/",
            f"{ALRAWAF_URL}/en/tendering/export_submitted/",
            f"{ALRAWAF_URL}/en/tendering/tender_report_submitted/export/",
        ]

        for url in export_urls:
            submitted = self.fetch_excel(url, row_map)
            if submitted:
                for tender in submitted:
                    tender["الحالة"] = "تم التقديم"
                return submitted

        return self.fetch_submitted_from_page()

    def fetch_submitted_from_page(self):
        try:
            response = self.session.get(f"{ALRAWAF_URL}/en/tendering/tender_report_submitted/", timeout=30)
            if response.status_code != 200:
                log.warning("Submitted page fetch failed: %s", response.status_code)
                return []

            soup = BeautifulSoup(response.text, "html.parser")
            export_link = soup.find("a", href=lambda href: href and "export" in href.lower() and "excel" in href.lower())
            if export_link:
                export_url = ALRAWAF_URL + export_link["href"]
                row_map = {
                    "اسم المناقصة": 3,
                    "تاريخ التقديم": 5,
                    "تاريخ الضمان الابتدائي": 4,
                    "المالك": 6,
                    "نوع الأعمال": 7,
                    "القطاع": 8,
                }
                submitted = self.fetch_excel(export_url, row_map)
                for tender in submitted:
                    tender["الحالة"] = "تم التقديم"
                return submitted

            tenders = []
            rows = soup.select("tr.o_data_row, table tbody tr, .o_list_view tbody tr")
            for row in rows:
                cells = row.find_all("td")
                if len(cells) < 2:
                    continue
                title = cells[0].get_text(strip=True)
                if not title:
                    continue
                tenders.append({
                    "tender_id": hashlib.md5(title.encode("utf-8")).hexdigest()[:12],
                    "اسم المناقصة": title,
                    "تاريخ التقديم": cells[1].get_text(strip=True) if len(cells) > 1 else "",
                    "المالك": cells[2].get_text(strip=True) if len(cells) > 2 else "",
                    "نوع الأعمال": cells[3].get_text(strip=True) if len(cells) > 3 else "",
                    "القطاع": cells[4].get_text(strip=True) if len(cells) > 4 else "",
                    "تاريخ الضمان الابتدائي": cells[5].get_text(strip=True) if len(cells) > 5 else "",
                    "الحالة": "تم التقديم",
                    "fetched_at": datetime.now().isoformat(),
                })
            return tenders
        except Exception as exc:
            log.error("Submitted page fetch error: %s", exc)
            return []


def main():
    missing = [name for name in ["ALRAWAF_USERNAME", "ALRAWAF_PASSWORD"] if not os.getenv(name)]
    if missing:
        raise SystemExit(f"Missing required secrets: {', '.join(missing)}")

    client = AlrawafClient()
    in_progress = client.fetch_in_progress()
    submitted = client.fetch_submitted()

    if not in_progress and not submitted:
        raise SystemExit("No tender data was fetched; keeping existing data.json unchanged.")

    data = {
        "last_updated": datetime.now().isoformat(),
        "source": "alrawaf-tender-live",
        "tenders": in_progress,
        "submitted": submitted,
    }
    with open(OUTPUT_FILE, "w", encoding="utf-8") as handle:
        json.dump(data, handle, ensure_ascii=False, indent=2)
        handle.write("\n")

    log.info("Wrote %s with %s in-progress and %s submitted tenders", OUTPUT_FILE, len(in_progress), len(submitted))


if __name__ == "__main__":
    main()
