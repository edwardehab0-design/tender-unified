const cfg = window.TENDER_PORTAL_CONFIG || {};
const portfolioSources = cfg.sources?.portfolio || ["/api/portfolio", "./portfolio/data.json"];
const tenderSources = cfg.sources?.liveTenders || ["/api/live-tenders", "./tenders/data.json"];

async function readJson(url) {
  const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function readFirst(urls) {
  let lastError;
  for (const url of urls) {
    try {
      return { data: await readJson(url), url };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No data source configured");
}

function setStatus(id, value, label) {
  const el = document.getElementById(id);
  if (!el) return;
  el.querySelector("strong").textContent = value;
  el.querySelector("span").textContent = label;
}

function fmtDate(value) {
  if (!value) return "بيانات محلية";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "بيانات محلية";
  return `آخر تحديث ${d.toLocaleDateString("ar-SA")} ${d.toLocaleTimeString("ar-SA", { hour: "2-digit", minute: "2-digit" })}`;
}

async function hydratePortal() {
  try {
    const { data, url } = await readFirst(portfolioSources);
    const count = data?.summary?.projectCount || data?.projects?.length || 0;
    setStatus("status-portfolio", `${count} مشروع`, url.includes("/api/") ? "متصل API" : "Excel SharePoint - نسخة محلية");
  } catch {
    setStatus("status-portfolio", "غير متاح", "تعذر قراءة بيانات المحفظة");
  }

  try {
    const { data, url } = await readFirst(tenderSources);
    const live = data?.tenders?.length || 0;
    const submitted = data?.submitted?.length || 0;
    setStatus("status-tenders", `${live + submitted} مناقصة`, url.includes("/api/") ? "متصل API" : fmtDate(data?.last_updated));
  } catch {
    setStatus("status-tenders", "غير متاح", "تعذر قراءة بيانات المناقصات");
  }

  setStatus("status-executive", "جاهز", "مصدره SharePoint Excel عند الربط");
}

hydratePortal();
