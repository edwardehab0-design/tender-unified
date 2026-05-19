const PORTAL_CONFIG = window.TENDER_PORTAL_CONFIG || {};
const DATA_SOURCES = PORTAL_CONFIG.sources?.portfolio || ["./data.json"];
const REFRESH_MS = PORTAL_CONFIG.refreshMs || 60 * 1000;
const VAT_RATE = 0.15;

const statusLabels = {
  all: "كل الحالات",
  awarded_signed: "تم الترسية وتم توقيع العقد",
  awarded_not_signed: "تم الترسية ولم يتم توقيع العقد",
  submitted_negotiation: "تم التقديم وقيد التفاوض والترسية",
  unknown: "غير محدد",
};

const portfolioAliases = {
  "المبانى": "المباني",
  "المباني": "المباني",
};

let sourceData = { projects: [] };
let filters = { search: "", portfolio: "all", status: "all" };

const sar = new Intl.NumberFormat("ar-SA", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 0,
});

const numberFmt = new Intl.NumberFormat("ar-SA");

function qs(id) {
  return document.getElementById(id);
}

async function loadData() {
  try {
    sourceData = await fetchFirstJson(DATA_SOURCES);
    normalizeData();
    populateFilters();
    render();
  } catch (error) {
    console.error(error);
  }
}

async function fetchFirstJson(urls) {
  let lastError;
  for (const url of urls) {
    try {
      const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("No data source configured");
}

function normalizeData() {
  sourceData.projects = (sourceData.projects || []).map((p, index) => ({
    number: p.number || String(index + 1),
    amountExclVat: Number(p.amountExclVat ?? p.amount) || 0,
    amountInclVat: Number(p.amountInclVat ?? ((Number(p.amountExclVat ?? p.amount) || 0) * (1 + VAT_RATE))) || 0,
    project: p.project || "-",
    client: p.client || "غير محدد",
    portfolio: normalizePortfolio(p.portfolio),
    status: p.status || "unknown",
    statusLabel: p.statusLabel || statusLabels[p.status] || "غير محدد",
  }));
}

function normalizePortfolio(value) {
  const name = String(value || "غير محدد").trim();
  return portfolioAliases[name] || name;
}

function populateFilters() {
  const portfolios = unique(sourceData.projects.map((p) => p.portfolio));
  const portfolioSelect = qs("portfolio-filter");
  const currentPortfolio = portfolioSelect.value || "all";
  portfolioSelect.innerHTML = option("all", "كل المحافظ") + portfolios.map((p) => option(p, p)).join("");
  portfolioSelect.value = portfolios.includes(currentPortfolio) ? currentPortfolio : "all";
  filters.portfolio = portfolioSelect.value;

  const statuses = unique(sourceData.projects.map((p) => p.status));
  const statusSelect = qs("status-filter");
  const currentStatus = statusSelect.value || "all";
  statusSelect.innerHTML = option("all", "كل الحالات") + statuses.map((s) => option(s, statusLabels[s] || s)).join("");
  statusSelect.value = statuses.includes(currentStatus) ? currentStatus : "all";
  filters.status = statusSelect.value;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
}

function option(value, label) {
  return `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`;
}

function filteredProjects() {
  const term = filters.search.trim().toLowerCase();
  return sourceData.projects.filter((p) => {
    const matchesSearch = !term ||
      p.project.toLowerCase().includes(term) ||
      p.client.toLowerCase().includes(term) ||
      p.portfolio.toLowerCase().includes(term);
    const matchesPortfolio = filters.portfolio === "all" || p.portfolio === filters.portfolio;
    const matchesStatus = filters.status === "all" || p.status === filters.status;
    return matchesSearch && matchesPortfolio && matchesStatus;
  });
}

function render() {
  const rows = filteredProjects();
  renderKpis(rows);
  renderStatusList(rows);
  renderBars("portfolio-chart", "portfolio-chart-total", groupBy(rows, "portfolio"), true);
  renderBars("client-chart", "client-chart-total", groupBy(rows, "client"), true, 8);
  renderStatusDonut(rows);
  renderStatusSummary(rows);
  renderPortfolioCards(rows);
  renderTable(rows);
}

function renderKpis(rows) {
  const totalExcl = sum(rows.map((p) => p.amountExclVat));
  const total = sum(rows.map((p) => p.amountInclVat));
  const topPortfolio = topEntry(groupBy(rows, "portfolio"));
  qs("kpi-total").textContent = sar.format(total);
  qs("kpi-total-sub").textContent = `غير شامل الضريبة: ${sar.format(totalExcl)}`;
  qs("kpi-count").textContent = numberFmt.format(rows.length);
  qs("kpi-top-portfolio").textContent = topPortfolio ? topPortfolio[0] : "-";
  qs("kpi-top-portfolio-sub").textContent = topPortfolio ? sar.format(topPortfolio[1].amountInclVat) : "-";
}

function renderStatusList(rows) {
  const grouped = groupBy(rows, "status");
  qs("status-list").innerHTML = Object.keys(statusLabels)
    .filter((key) => key !== "all")
    .map((key) => {
      const item = grouped.get(key) || { count: 0, amount: 0 };
      return `<div class="metric"><span>${escapeHtml(statusLabels[key])}</span><b>${numberFmt.format(item.count)}</b></div>`;
    })
    .join("");
}

function renderBars(targetId, totalId, grouped, useAmount, limit = 10) {
  const entries = [...grouped.entries()]
    .sort((a, b) => (useAmount ? b[1].amountInclVat - a[1].amountInclVat : b[1].count - a[1].count))
    .slice(0, limit);
  const max = entries[0] ? (useAmount ? entries[0][1].amountInclVat : entries[0][1].count) : 1;
  const total = sum(entries.map(([, item]) => useAmount ? item.amountInclVat : item.count));
  qs(totalId).textContent = useAmount ? sar.format(total) : `${numberFmt.format(total)} مشروع`;
  qs(targetId).innerHTML = entries.length ? entries.map(([name, item]) => {
    const value = useAmount ? item.amountInclVat : item.count;
    const width = Math.max(4, (value / max) * 100);
    return `<div class="bar-row">
      <div class="bar-label" title="${escapeAttr(name)}">${escapeHtml(name)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${width}%"></div></div>
      <div class="bar-value">${useAmount ? compactSar(value) : numberFmt.format(value)}</div>
    </div>`;
  }).join("") : `<div class="metric"><span>لا توجد بيانات</span><b>0</b></div>`;
}

function renderStatusDonut(rows) {
  const grouped = groupBy(rows, "status");
  const totalExcl = sum(rows.map((p) => p.amountExclVat));
  const entries = Object.keys(statusLabels)
    .filter((key) => key !== "all")
    .map((key) => [key, grouped.get(key) || { count: 0, amountInclVat: 0, amountExclVat: 0 }])
    .filter(([, item]) => item.count > 0);
  const total = sum(entries.map(([, item]) => item.count)) || 1;
  let offset = 25;
  const colors = {
    awarded_signed: "#2f9d68",
    awarded_not_signed: "#d2a144",
    submitted_negotiation: "#2f6fab",
    unknown: "#8792a2",
  };
  const circles = entries.map(([key, item]) => {
    const portion = (item.count / total) * 100;
    const dash = `${portion} ${100 - portion}`;
    const circle = `<circle class="donut-seg" r="16" cx="20" cy="20" fill="transparent" stroke="${colors[key] || colors.unknown}" stroke-width="6" stroke-dasharray="${dash}" stroke-dashoffset="${offset}"></circle>`;
    offset -= portion;
    return circle;
  }).join("");
  qs("status-donut").innerHTML = `<svg viewBox="0 0 40 40" role="img" aria-label="حالة الترسية">
    <circle r="16" cx="20" cy="20" fill="transparent" stroke="#edf2f7" stroke-width="6"></circle>
    ${circles}
    <text x="20" y="18.8" text-anchor="middle" class="donut-number">${numberFmt.format(total)}</text>
    <text x="20" y="24" text-anchor="middle" class="donut-caption">مشروع</text>
  </svg>`;
  qs("status-legend").innerHTML = entries.map(([key, item]) => `<div class="legend-item">
    <span class="legend-dot" style="background:${colors[key] || colors.unknown}"></span>
    <div>
      <strong>${escapeHtml(statusLabels[key] || key)}</strong>
      <small>${numberFmt.format(item.count)} مشروع | ${compactSar(item.amountInclVat)} | ${percent(item.amountExclVat / totalExcl)}</small>
    </div>
  </div>`).join("");
}

function renderStatusSummary(rows) {
  const grouped = groupBy(rows, "status");
  const totalExcl = sum(rows.map((p) => p.amountExclVat));
  const totalIncl = sum(rows.map((p) => p.amountInclVat));
  const ordered = ["awarded_signed", "awarded_not_signed", "submitted_negotiation"];
  const bodyRows = ordered.map((key) => {
    const item = grouped.get(key) || { count: 0, amountExclVat: 0, amountInclVat: 0 };
    return statusSummaryRow(statusLabels[key], item.amountExclVat, item.amountInclVat, totalExcl, false);
  });
  bodyRows.push(statusSummaryRow("الإجمالي العام", totalExcl, totalIncl, totalExcl, true));
  qs("status-summary-body").innerHTML = bodyRows.join("");
}

function statusSummaryRow(label, amountExcl, amountIncl, totalExcl, isTotal) {
  const ratio = totalExcl ? amountExcl / totalExcl : 0;
  return `<tr class="${isTotal ? "summary-total" : ""}">
    <td>${escapeHtml(label)}</td>
    <td class="amount muted-amount">${sar.format(amountExcl)}</td>
    <td class="amount">${sar.format(amountIncl)}</td>
    <td>
      <div class="percent-cell">
        <strong>${percent(ratio)}</strong>
        <span class="percent-track"><i style="width:${Math.max(0, Math.min(100, ratio * 100))}%"></i></span>
      </div>
    </td>
  </tr>`;
}

function renderPortfolioCards(rows) {
  const entries = [...groupBy(rows, "portfolio").entries()]
    .sort((a, b) => b[1].amountInclVat - a[1].amountInclVat);
  const total = sum(entries.map(([, item]) => item.amountInclVat)) || 1;
  qs("portfolio-cards").innerHTML = entries.map(([name, item]) => {
    const share = (item.amountInclVat / total) * 100;
    return `<div class="portfolio-card">
      <div>
        <strong>${escapeHtml(name)}</strong>
        <span>${numberFmt.format(item.count)} مشروع</span>
      </div>
      <b>${compactSar(item.amountInclVat)}</b>
      <div class="share"><i style="width:${Math.max(3, share)}%"></i></div>
    </div>`;
  }).join("");
}

function renderTable(rows) {
  qs("table-count").textContent = `${numberFmt.format(rows.length)} مشروع`;
  qs("projects-body").innerHTML = rows
    .slice()
    .sort((a, b) => Number(a.number) - Number(b.number))
    .map((p, i) => `<tr>
      <td>${escapeHtml(p.number || String(i + 1))}</td>
      <td class="project-name">${escapeHtml(p.project)}</td>
      <td>${escapeHtml(p.client)}</td>
      <td>${escapeHtml(p.portfolio)}</td>
      <td><span class="badge ${escapeAttr(p.status)}">${escapeHtml(p.statusLabel)}</span></td>
      <td class="amount muted-amount">${sar.format(p.amountExclVat)}</td>
      <td class="amount">${sar.format(p.amountInclVat)}</td>
    </tr>`)
    .join("");
}

function exportPortfolioExcel() {
  if (!window.XLSX) {
    alert("تعذر تحميل مكتبة التصدير. حاول تحديث الصفحة ثم أعد المحاولة.");
    return;
  }

  const rows = filteredProjects()
    .slice()
    .sort((a, b) => Number(a.number) - Number(b.number))
    .map((p) => ({
      "م": p.number,
      "اسم المشروع": p.project,
      "العميل": p.client,
      "المحفظة": p.portfolio,
      "الحالة": p.statusLabel,
      "غير شامل الضريبة": p.amountExclVat,
      "شامل الضريبة": p.amountInclVat,
    }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "محفظة المناقصات");
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `محفظة_المناقصات_${stamp}.xlsx`);
}

function groupBy(rows, key) {
  const map = new Map();
  rows.forEach((row) => {
    const name = row[key] || "غير محدد";
    const item = map.get(name) || { count: 0, amountExclVat: 0, amountInclVat: 0 };
    item.count += 1;
    item.amountExclVat += row.amountExclVat;
    item.amountInclVat += row.amountInclVat;
    map.set(name, item);
  });
  return map;
}

function topEntry(grouped) {
  return [...grouped.entries()].sort((a, b) => b[1].amountInclVat - a[1].amountInclVat)[0];
}

function sum(values) {
  return values.reduce((a, b) => a + b, 0);
}

function compactSar(value) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString("ar-SA", { maximumFractionDigits: 1 })} مليار`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toLocaleString("ar-SA", { maximumFractionDigits: 1 })} مليون`;
  return sar.format(value);
}

function percent(value) {
  return `${Math.round((Number(value) || 0) * 100).toLocaleString("ar-SA")}%`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

qs("search-input").addEventListener("input", (event) => {
  filters.search = event.target.value;
  render();
});

qs("portfolio-filter").addEventListener("change", (event) => {
  filters.portfolio = event.target.value;
  render();
});

qs("status-filter").addEventListener("change", (event) => {
  filters.status = event.target.value;
  render();
});

qs("reset-btn").addEventListener("click", () => {
  filters = { search: "", portfolio: "all", status: "all" };
  qs("search-input").value = "";
  qs("portfolio-filter").value = "all";
  qs("status-filter").value = "all";
  render();
});

loadData();
setInterval(loadData, REFRESH_MS);
