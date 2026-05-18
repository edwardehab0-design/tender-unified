"""
Sync SharePoint Excel workbooks into JSON files consumed by the portal.

This script is designed for GitHub Actions. It uses Microsoft Graph app-only
authentication, downloads the two shared Excel workbooks, and writes:

- portfolio/data.json
- executive-report/data.json
"""

import base64
import json
import logging
import os
import re
from datetime import datetime, timezone
from io import BytesIO
from typing import Any

import openpyxl
import requests


logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

GRAPH_ROOT = "https://graph.microsoft.com/v1.0"
VAT_RATE = 0.15

DEFAULT_EXECUTIVE_URL = (
    "https://etech321.sharepoint.com/:x:/s/e-tech/"
    "IQCz-YQi0yYuTo2nSWtkJ_nFAZhUxo9BGN-5lxd8Zewcs6Q?e=szVgi8"
)
DEFAULT_PORTFOLIO_URL = (
    "https://etech321.sharepoint.com/:x:/s/e-tech/"
    "IQBUS72YnIkdSbJgXENbslnUAUGJqGmiN8KSVH3EH8KTvvQ?e=b5McqU"
)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def graph_token() -> str:
    missing = [name for name in ("SP_TENANT_ID", "SP_CLIENT_ID", "SP_CLIENT_SECRET") if not os.getenv(name)]
    if missing:
        raise RuntimeError(f"Missing required GitHub secrets: {', '.join(missing)}")
    tenant_id = os.environ["SP_TENANT_ID"]
    client_id = os.environ["SP_CLIENT_ID"]
    client_secret = os.environ["SP_CLIENT_SECRET"]
    response = requests.post(
        f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token",
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "scope": "https://graph.microsoft.com/.default",
            "grant_type": "client_credentials",
        },
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["access_token"]


def share_id(shared_url: str) -> str:
    encoded = base64.urlsafe_b64encode(shared_url.encode("utf-8")).decode("ascii").rstrip("=")
    return f"u!{encoded}"


def graph_get(url: str, token: str) -> requests.Response:
    response = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=60)
    response.raise_for_status()
    return response


def download_shared_workbook(shared_url: str, token: str) -> bytes:
    sid = share_id(shared_url)
    meta = graph_get(f"{GRAPH_ROOT}/shares/{sid}/driveItem", token).json()
    log.info("Downloading workbook: %s", meta.get("name", "unknown.xlsx"))
    return graph_get(f"{GRAPH_ROOT}/shares/{sid}/driveItem/content", token).content


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    return str(value).replace("\r\n", "\n").strip()


def number_value(value: Any) -> float:
    if value is None or value == "":
        return 0.0
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value)
    text = re.sub(r"[^\d.\-]", "", text)
    try:
        return float(text)
    except ValueError:
