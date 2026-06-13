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

const statusOrder = ["awarded_signed", "awarded_not_signed", "submitted_negotiation", "unknown"];

const statusMeta = {
  awarded_signed: {
    title: "تم الترسية وتم توقيع العقد",
    short: "عقود موقعة",
    note: "مشاريع انتقلت من المنافسة إلى الالتزام التعاقدي.",
    tone: "signed",
  },
  awarded_not_signed: {
    title: "تم الترسية ولم يتم توقيع العقد",
    short: "بانتظار التوقيع",
    note: "مشاريع مرساة تحتاج إنهاء إجراء التعاقد.",
    tone: "pending",
  },
  submitted_negotiation: {
    title: "تم التقديم وقيد التفاوض والترسية",
    short: "تفاوض وترسية",
    note: "فرص في مرحلة المتابعة قبل الحسم النهائي.",
    tone: "negotiation",
  },
  unknown: {
    title: "غير محدد",
    short: "غير مصنف",
    note: "سجلات تحتاج مراجعة حالة المشروع في المصدر.",
    tone: "unknown",
  },
};

const portfolioAliases = {
  "المبانى": "المباني",
  "المباني": "المباني",
};

let sourceData = { projects: [] };
let filters = { search: "", portfolio: "all", status: "all" };
let selectedProject = null;

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
    detailId: String(p.id || p.number || index + 1),
    number: p.number || String(index + 1),
    amountExclVat: Number(p.amountExclVat ?? p.amount) || 0,
    amountInclVat: Number(p.amountInclVat ?? ((Number(p.amountExclVat ?? p.amount) || 0) * (1 + VAT_RATE))) || 0,
    project: p.project || "-",
    client: p.client || "غير محدد",
    portfolio: normalizePortfolio(p.portfolio),
    status: normalizeStatus(p.status, p.statusLabel),
    statusLabel: p.statusLabel || statusLabels[normalizeStatus(p.status, p.statusLabel)] || "غير محدد",
  }));
}

function normalizeStatus(status, label) {
  const rawStatus = String(status || "").trim();
  if (statusLabels[rawStatus]) return rawStatus;
  const text = String(label || rawStatus || "").trim();
  if (/تم\s*الترسية.*تم\s*توقيع\s*العقد/.test(text)) return "awarded_signed";
  if (/تم\s*الترسية.*لم\s*يتم\s*توقيع\s*العقد/.test(text)) return "awarded_not_signed";
  if (/قيد\s*التفاوض|الترسية/.test(text) && /تم\s*التقديم/.test(text)) return "submitted_negotiation";
  return "unknown";
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

  const statuses = orderedStatuses(sourceData.projects.map((p) => p.status));
  const statusSelect = qs("status-filter");
  const currentStatus = statusSelect.value || "all";
  statusSelect.innerHTML = option("all", "كل الحالات") + statuses.map((s) => option(s, statusLabels[s] || s)).join("");
  statusSelect.value = statuses.includes(currentStatus) ? currentStatus : "all";
  filters.status = statusSelect.value;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
}

function orderedStatuses(values) {
  const set = new Set(values.filter(Boolean));
  return statusOrder.filter((key) => set.has(key)).concat([...set].filter((key) => !statusOrder.includes(key)).sort());
}

function option(value, label) {
  return `<option value="${escapeAttr(value)}">${escapeHtml(label)}</option>`;
}

function filteredProjects(ignoreStatus = false) {
  const term = filters.search.trim().toLowerCase();
  return sourceData.projects.filter((p) => {
    const matchesSearch = !term ||
      p.project.toLowerCase().includes(term) ||
      p.client.toLowerCase().includes(term) ||
      p.portfolio.toLowerCase().includes(term);
    const matchesPortfolio = filters.portfolio === "all" || p.portfolio === filters.portfolio;
    const matchesStatus = ignoreStatus || filters.status === "all" || p.status === filters.status;
    return matchesSearch && matchesPortfolio && matchesStatus;
  });
}

function render() {
  const rows = filteredProjects();
  const stageRows = filteredProjects(true);
  renderKpis(rows);
  renderStatusList(stageRows);
  renderBars("portfolio-chart", "portfolio-chart-total", groupBy(rows, "portfolio"), true);
  renderBars("client-chart", "client-chart-total", groupBy(rows, "client"), true, 8);
  renderStatusDonut(stageRows);
  renderStatusSummary(stageRows);
  renderPortfolioCards(rows);
  renderValueAtRisk(stageRows);
  renderStatusStages(stageRows);
  renderTable(rows);
}

// القيمة المعرّضة للخطر: مشاريع تم الترسية عليها ولم يُوقَّع عقدها بعد —
// أموال مكتسبة تنتظر تأميناً بالتوقيع، مرتّبة بالقيمة وقابلة للفتح.
function renderValueAtRisk(rows) {
  const el = qs("value-at-risk");
  if (!el) return;
  const items = rows
    .filter((p) => p.status === "awarded_not_signed")
    .sort((a, b) => b.amountExclVat - a.amountExclVat);
  const total = sum(items.map((p) => p.amountExclVat));
  const totalEl = qs("var-total");
  if (totalEl) totalEl.textContent = items.length
    ? `${sar.format(total)} · ${numberFmt.format(items.length)} مشروع`
    : "لا توجد";
  if (!items.length) {
    el.innerHTML = `<p class="var-clear">لا توجد مشاريع مُرسّاة بانتظار التوقيع — كل العقود موقّعة ✓</p>`;
    return;
  }
  el.innerHTML = `<p class="var-note">مشاريع تم الترسية عليها وتنتظر توقيع العقد — تحتاج متابعة لتأمينها.</p>`
    + items.map((p) => `
      <div class="var-row" data-detail-id="${escapeAttr(p.detailId)}" tabindex="0" role="button">
        <div class="var-main">
          <strong title="${escapeAttr(p.project)}">${escapeHtml(p.project)}</strong>
          <span>${escapeHtml(p.client)}</span>
        </div>
        <b class="var-amount">${sar.format(p.amountExclVat)}</b>
      </div>
    `).join("");
}

function renderKpis(rows) {
  const grouped = groupBy(rows, "status");

  const signedGroup    = grouped.get("awarded_signed")    || { count: 0, amountExclVat: 0 };
  const notSignedGroup = grouped.get("awarded_not_signed") || { count: 0, amountExclVat: 0 };
  const submittedGroup = grouped.get("submitted_negotiation") || { count: 0, amountExclVat: 0 };

  qs("kpi-awarded-signed").textContent       = sar.format(signedGroup.amountExclVat);
  qs("kpi-awarded-signed-count").textContent = `${numberFmt.format(signedGroup.count)} مشروع · غير شامل الضريبة`;

  qs("kpi-awarded-not-signed").textContent       = sar.format(notSignedGroup.amountExclVat);
  qs("kpi-awarded-not-signed-count").textContent = `${numberFmt.format(notSignedGroup.count)} مشروع · غير شامل الضريبة`;

  qs("kpi-submitted").textContent       = sar.format(submittedGroup.amountExclVat);
  qs("kpi-submitted-count").textContent = `${numberFmt.format(submittedGroup.count)} مشروع · غير شامل الضريبة`;
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
    .sort((a, b) => (useAmount ? b[1].amountExclVat - a[1].amountExclVat : b[1].count - a[1].count))
    .slice(0, limit);
  const max = entries[0] ? (useAmount ? entries[0][1].amountExclVat : entries[0][1].count) : 1;
  const total = sum(entries.map(([, item]) => useAmount ? item.amountExclVat : item.count));
  qs(totalId).textContent = useAmount ? sar.format(total) : `${numberFmt.format(total)} مشروع`;
  qs(targetId).innerHTML = entries.length ? entries.map(([name, item]) => {
    const value = useAmount ? item.amountExclVat : item.count;
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
      <small>${numberFmt.format(item.count)} مشروع | ${compactSar(item.amountExclVat)} | ${percent(item.amountExclVat / totalExcl)}</small>
    </div>
  </div>`).join("");
}

function renderStatusSummary(rows) {
  const grouped = groupBy(rows, "status");
  const totalExcl = sum(rows.map((p) => p.amountExclVat));
  const ordered = ["awarded_signed", "awarded_not_signed", "submitted_negotiation"];
  const bodyRows = ordered.map((key) => {
    const item = grouped.get(key) || { count: 0, amountExclVat: 0, amountInclVat: 0 };
    return statusSummaryRow(statusLabels[key], item.amountExclVat, totalExcl, false);
  });
  bodyRows.push(statusSummaryRow("الإجمالي العام", totalExcl, totalExcl, true));
  qs("status-summary-body").innerHTML = bodyRows.join("");
}

function statusSummaryRow(label, amountExcl, totalExcl, isTotal) {
  const ratio = totalExcl ? amountExcl / totalExcl : 0;
  return `<tr class="${isTotal ? "summary-total" : ""}">
    <td>${escapeHtml(label)}</td>
    <td class="amount muted-amount">${sar.format(amountExcl)}</td>
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
    .sort((a, b) => b[1].amountExclVat - a[1].amountExclVat);
  const total = sum(entries.map(([, item]) => item.amountExclVat)) || 1;
  qs("portfolio-cards").innerHTML = entries.map(([name, item]) => {
    const share = (item.amountExclVat / total) * 100;
    return `<div class="portfolio-card">
      <div>
        <strong>${escapeHtml(name)}</strong>
        <span>${numberFmt.format(item.count)} مشروع</span>
      </div>
      <b>${compactSar(item.amountExclVat)}</b>
      <div class="share"><i style="width:${Math.max(3, share)}%"></i></div>
    </div>`;
  }).join("");
}

function renderStatusStages(rows) {
  const board = qs("status-stage-board");
  if (!board) return;
  const grouped = groupBy(rows, "status");
  const totalAmount = sum(rows.map((p) => p.amountExclVat)) || 1;
  const statuses = statusOrder.filter((key) => key !== "unknown" || grouped.has(key));
  board.innerHTML = statuses.map((key) => {
    const item = grouped.get(key) || { count: 0, amountExclVat: 0 };
    const meta = statusMeta[key] || statusMeta.unknown;
    const projects = rows.filter((p) => p.status === key).sort((a, b) => b.amountExclVat - a.amountExclVat);
    const topProject = projects[0];
    const share = Math.max(0, Math.min(100, (item.amountExclVat / totalAmount) * 100));
    const active = filters.status === key;
    return `<button class="stage-card ${meta.tone} ${active ? "is-active" : ""}" type="button" data-status="${escapeAttr(key)}">
      <span class="stage-kicker">${escapeHtml(meta.short)}</span>
      <strong>${escapeHtml(meta.title)}</strong>
      <em>${escapeHtml(meta.note)}</em>
      <div class="stage-metrics">
        <span><b>${numberFmt.format(item.count)}</b> مشروع</span>
        <span>${compactSar(item.amountExclVat)}</span>
      </div>
      <div class="stage-share" aria-hidden="true"><i style="width:${Math.max(4, share)}%"></i></div>
      <small>${topProject ? escapeHtml(topProject.project) : "لا توجد مشاريع في هذا المسار حالياً"}</small>
    </button>`;
  }).join("");
}

function renderTable(rows) {
  const sortedRows = rows
    .slice()
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || Number(a.number) - Number(b.number));
  qs("table-count").textContent = `${numberFmt.format(rows.length)} مشروع`;
  const groups = statusOrder
    .concat(sortedRows.map((p) => p.status).filter((status) => !statusOrder.includes(status)))
    .filter((status, index, list) => list.indexOf(status) === index)
    .map((status) => [status, sortedRows.filter((p) => p.status === status)])
    .filter(([, items]) => items.length);
  qs("projects-body").innerHTML = groups
    .map(([status, items]) => statusGroupHeader(status, items) + items.map((p, i) => projectRow(p, i)).join(""))
    .join("");
}

function statusRank(status) {
  const index = statusOrder.indexOf(status);
  return index === -1 ? statusOrder.length : index;
}

function statusGroupHeader(status, items) {
  const meta = statusMeta[status] || statusMeta.unknown;
  const total = sum(items.map((p) => p.amountExclVat));
  return `<tr class="project-group-row ${escapeAttr(meta.tone)}">
      <td colspan="6">
      <div class="project-group-banner">
        <span>${escapeHtml(meta.short)}</span>
        <strong>${escapeHtml(meta.title)}</strong>
        <em>${numberFmt.format(items.length)} مشروع · ${compactSar(total)}</em>
      </div>
    </td>
  </tr>`;
}

function projectRow(p, i) {
  const meta = statusMeta[p.status] || statusMeta.unknown;
  return `<tr class="project-row status-${escapeAttr(meta.tone)} ${selectedProject?.detailId === p.detailId ? "is-selected" : ""}" data-detail-id="${escapeAttr(p.detailId)}" tabindex="0">
      <td>${escapeHtml(p.number || String(i + 1))}</td>
      <td class="project-name">${escapeHtml(p.project)}</td>
      <td>${escapeHtml(p.client)}</td>
      <td>${escapeHtml(p.portfolio)}</td>
      <td><span class="badge ${escapeAttr(p.status)}">${escapeHtml(p.statusLabel)}</span></td>
      <td class="amount muted-amount">${sar.format(p.amountExclVat)}</td>
    </tr>`;
}

function findProjectById(id) {
  return filteredProjects().find((p) => p.detailId === id) ||
    sourceData.projects.find((p) => p.detailId === id);
}

function openProjectDrawer(project) {
  if (!project) return;
  selectedProject = project;
  const rows = filteredProjects();
  const total = sum(rows.map((p) => p.amountExclVat)) || project.amountExclVat || 1;
  const share = Math.max(0, Math.min(1, project.amountExclVat / total));

  qs("drawer-project-number").textContent = `مشروع رقم ${project.number || "-"}`;
  qs("drawer-project-title").textContent = project.project;
  qs("drawer-project-client").textContent = project.client;
  qs("drawer-project-portfolio").textContent = project.portfolio;
  qs("drawer-project-status").textContent = project.statusLabel;
  qs("drawer-amount-excl").textContent = sar.format(project.amountExclVat);
  qs("drawer-share").textContent = percent(share);
  qs("drawer-share-bar").style.width = `${Math.max(3, share * 100)}%`;
  qs("project-drawer").classList.add("open");
  qs("project-drawer").setAttribute("aria-hidden", "false");
  renderTable(rows);
}

function closeProjectDrawer() {
  selectedProject = null;
  qs("project-drawer").classList.remove("open");
  qs("project-drawer").setAttribute("aria-hidden", "true");
  renderTable(filteredProjects());
}

function applyDrawerFilter(type) {
  if (!selectedProject) return;
  if (type === "client") {
    filters.search = selectedProject.client;
    qs("search-input").value = selectedProject.client;
  }
  if (type === "portfolio") {
    filters.portfolio = selectedProject.portfolio;
    qs("portfolio-filter").value = selectedProject.portfolio;
  }
  closeProjectDrawer();
  render();
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
  return [...grouped.entries()].sort((a, b) => b[1].amountExclVat - a[1].amountExclVat)[0];
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

qs("status-stage-board")?.addEventListener("click", (event) => {
  const card = event.target.closest("[data-status]");
  if (!card) return;
  const nextStatus = card.dataset.status;
  filters.status = filters.status === nextStatus ? "all" : nextStatus;
  qs("status-filter").value = filters.status;
  render();
});

qs("status-stage-board")?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest("[data-status]");
  if (!card) return;
  event.preventDefault();
  card.click();
});

qs("projects-body").addEventListener("click", (event) => {
  const row = event.target.closest("[data-detail-id]");
  if (!row) return;
  openProjectDrawer(findProjectById(row.dataset.detailId));
});

qs("projects-body").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest("[data-detail-id]");
  if (!row) return;
  event.preventDefault();
  openProjectDrawer(findProjectById(row.dataset.detailId));
});

qs("value-at-risk").addEventListener("click", (event) => {
  const row = event.target.closest("[data-detail-id]");
  if (!row) return;
  openProjectDrawer(findProjectById(row.dataset.detailId));
});

qs("value-at-risk").addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest("[data-detail-id]");
  if (!row) return;
  event.preventDefault();
  openProjectDrawer(findProjectById(row.dataset.detailId));
});

qs("project-drawer-close").addEventListener("click", closeProjectDrawer);
qs("project-drawer-backdrop").addEventListener("click", closeProjectDrawer);
qs("drawer-filter-client").addEventListener("click", () => applyDrawerFilter("client"));
qs("drawer-filter-portfolio").addEventListener("click", () => applyDrawerFilter("portfolio"));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && qs("project-drawer").classList.contains("open")) {
    closeProjectDrawer();
  }
});

loadData();
setInterval(loadData, REFRESH_MS);
