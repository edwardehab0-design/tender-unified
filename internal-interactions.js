(() => {
  const rowSelector = [
    ".table-section table tbody tr",
    ".table-panel table tbody tr",
    ".table-card table tbody tr",
    ".data-table tbody tr",
    "#report-table tbody tr"
  ].join(",");
  const ignoredContainers = [
    ".iu-record-drawer",
    ".modal-overlay",
    ".owner-modal-overlay",
    ".client-modal-overlay",
    ".iu-command-panel",
    ".iu-search-panel",
    ".iu-compare-panel",
    ".pw-overlay",
    "#welcome-screen"
  ].join(",");
  const ignoredRows = ".tender-row,[data-iu-ignore-row='true']";
  const interactiveSelector = "a,button,input,select,textarea,[contenteditable='true'],[role='button']";
  const memoryStore = Object.create(null);

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function ensureDrawer() {
    let drawer = document.getElementById("iu-record-drawer");
    if (drawer) return drawer;

    drawer = document.createElement("aside");
    drawer.id = "iu-record-drawer";
    drawer.className = "iu-record-drawer";
    drawer.setAttribute("aria-hidden", "true");
    drawer.innerHTML = `
      <button class="iu-record-backdrop" type="button" data-iu-close aria-label="إغلاق"></button>
      <section class="iu-record-panel" role="dialog" aria-modal="true" aria-labelledby="iu-record-title">
        <button class="iu-record-close" type="button" data-iu-close aria-label="إغلاق">×</button>
        <div class="iu-record-kicker" id="iu-record-kicker">تفاصيل السجل</div>
        <h2 id="iu-record-title"></h2>
        <p id="iu-record-subtitle"></p>
        <div class="iu-record-summary" id="iu-record-summary"></div>
        <div class="iu-stage-flow" id="iu-stage-flow"></div>
        <div class="iu-record-timeline" id="iu-record-timeline"></div>
        <div class="iu-record-note" id="iu-record-note"></div>
        <div class="iu-record-fields" id="iu-record-fields"></div>
        <div class="iu-record-actions">
          <button class="iu-record-fav" type="button">تمييز</button>
          <button class="iu-record-compare" type="button">مقارنة</button>
          <button class="iu-record-copy" type="button">نسخ الملخص</button>
          <button class="iu-record-done" type="button" data-iu-close>تم</button>
        </div>
      </section>
    `;
    document.body.appendChild(drawer);

    drawer.addEventListener("click", (event) => {
      if (event.target.closest("[data-iu-close]")) closeDrawer();
      if (event.target.closest(".iu-record-copy")) copySummary(drawer);
      if (event.target.closest(".iu-record-fav")) toggleFavorite(drawer);
      if (event.target.closest(".iu-record-compare")) addToCompare(drawer);
    });

    return drawer;
  }

  function getTableTitle(table) {
    const panel = table.closest(".table-section,.table-panel,.table-card,.card,section,main");
    const title = panel && panel.querySelector(".section-title,.table-title,.chart-title,.table-toolbar h2,h2,h3");
    return clean(title ? title.textContent : document.title) || "تفاصيل السجل";
  }

  function getHeaders(table, cellCount) {
    const headers = Array.from(table.querySelectorAll("thead th")).map((th) => clean(th.textContent));
    if (headers.length) return headers;
    return Array.from({ length: cellCount }, (_, index) => `حقل ${index + 1}`);
  }

  function getCellLines(cell) {
    return String(cell.innerText || cell.textContent || "")
      .split(/\n+/)
      .map(clean)
      .filter(Boolean);
  }

  function getRowData(row) {
    const table = row.closest("table");
    const cells = Array.from(row.children).filter((cell) => clean(cell.textContent));
    const headers = getHeaders(table, cells.length);
    const lineGroups = cells.map(getCellLines);
    const values = lineGroups.map((lines) => lines.join(" - "));
    const firstLines = lineGroups.map((lines) => lines[0]).filter(Boolean);
    const fields = values.map((value, index) => ({
      label: headers[index] || `حقل ${index + 1}`,
      value
    }));
    const meaningful = values.filter((value) => value && value !== "-");
    const title = firstLines.find((value) => value.length > 10) || meaningful[1] || meaningful[0] || "سجل";
    const subtitle = meaningful.find((value) => value !== title && value.length > 2) || getTableTitle(table);

    return {
      tableTitle: getTableTitle(table),
      title,
      subtitle,
      fields
    };
  }

  function fieldMatch(data, patterns) {
    const field = data.fields.find((item) => {
      const label = clean(item.label);
      return patterns.some((pattern) => label.includes(pattern));
    });
    return field && field.value ? field.value : "";
  }

  function firstValue(data, keys, fallback = "غير مسجل") {
    return fieldMatch(data, keys) || fallback;
  }

  function buildRecordSummary(data) {
    const client = firstValue(data, ["المالك", "العميل", "الجهة"], data.subtitle || "غير مسجل");
    const status = firstValue(data, ["الحالة", "الأولوية", "status"], "قيد المتابعة");
    const date = firstValue(data, ["تاريخ", "date"], "غير محدد");
    const value = firstValue(data, ["القيمة", "شامل", "المبلغ", "amount"], "غير مسجلة");
    return [
      ["العميل / الجهة", client],
      ["الحالة", status],
      ["التاريخ", date],
      ["قيمة المشروع", value]
    ].map(([label, valueText]) => `
      <div class="iu-record-pill">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(valueText)}</strong>
      </div>
    `).join("");
  }

  function buildRecordTimeline(data) {
    const date = firstValue(data, ["تاريخ التقديم", "تاريخ", "date"], "غير محدد");
    const guarantee = firstValue(data, ["الضمان"], "");
    const status = firstValue(data, ["الحالة", "الأولوية"], "قيد المتابعة");
    const steps = [
      ["تسجيل المشروع", data.tableTitle],
      ["موعد/تاريخ مرتبط", date],
      ["الحالة الحالية", status]
    ];
    if (guarantee) steps.push(["الضمان", guarantee]);
    return `
      <h3>الخط الزمني المختصر</h3>
      ${steps.map(([label, valueText]) => `
        <div class="iu-record-step"><span><strong>${escapeHtml(label)}</strong> - ${escapeHtml(valueText)}</span></div>
      `).join("")}
    `;
  }

  function inferStage(data) {
    const text = [data.title, data.subtitle].concat(data.fields.map((f) => f.value)).join(" ");
    if (/عقد|توقيع|signed|contract/i.test(text)) return 5;
    if (/ترسية|awarded/i.test(text)) return 4;
    if (/تفاوض|negotiation/i.test(text)) return 3;
    if (/تم التقديم|submitted|مقدمة/i.test(text)) return 2;
    if (/دراسة|تأهيل|تحليل/i.test(text)) return 1;
    return 0;
  }

  function buildStageFlow(data) {
    const active = inferStage(data);
    const stages = ["رصد", "دراسة", "تقديم", "تفاوض", "ترسية", "عقد"];
    return stages.map((stage, index) => `
      <div class="iu-stage ${index <= active ? "active" : ""}">
        <i></i><span>${stage}</span>
      </div>
    `).join("");
  }

  function buildRecordNote(data) {
    const status = firstValue(data, ["الحالة", "الأولوية"], "");
    const note = firstValue(data, ["ملاحظات", "إجراء", "المسؤول"], "");
    if (note && note !== "غير مسجل") return `ملاحظة تشغيلية: ${escapeHtml(note)}`;
    if (/حرج|اليوم|3|عاجل|urgent/i.test(status)) return "هذا السجل يحتاج متابعة قريبة حسب حالته أو موعده الحالي.";
    return "ملخص تنفيذي سريع. يمكن استخدام زر النسخ لمشاركة هذه التفاصيل مع الفريق.";
  }

  function recordId(data) {
    const raw = [data.tableTitle, data.title, data.subtitle].join("|");
    let hash = 0;
    for (let index = 0; index < raw.length; index += 1) {
      hash = ((hash << 5) - hash + raw.charCodeAt(index)) | 0;
    }
    return `r${Math.abs(hash).toString(36)}-${btoa(unescape(encodeURIComponent(raw))).slice(0, 16)}`;
  }

  function drawerPayload(drawer) {
    try {
      return JSON.parse(drawer.dataset.recordPayload || "{}");
    } catch {
      return {};
    }
  }

  function loadJson(key, fallback) {
    if (Object.prototype.hasOwnProperty.call(memoryStore, key)) return memoryStore[key];
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null") || fallback;
      memoryStore[key] = value;
      return value;
    } catch {
      return fallback;
    }
  }

  function saveJson(key, value) {
    memoryStore[key] = value;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }

  function toggleFavorite(drawer) {
    const record = drawerPayload(drawer);
    if (!record.id) return;
    const favorites = loadJson("iuFavorites", []);
    const exists = favorites.some((item) => item.id === record.id);
    const next = exists ? favorites.filter((item) => item.id !== record.id) : [record, ...favorites].slice(0, 30);
    saveJson("iuFavorites", next);
    drawer.classList.toggle("favorited", !exists);
    renderCommandPanel("favorites");
  }

  function addToCompare(drawer) {
    const record = drawerPayload(drawer);
    if (!record.id) return;
    const current = loadJson("iuCompare", []).filter((item) => item.id !== record.id);
    const next = [record, ...current].slice(0, 2);
    saveJson("iuCompare", next);
    openCommandPanel("compare");
  }

  function openDrawer(row) {
    const drawer = ensureDrawer();
    const data = getRowData(row);
    const fieldMarkup = data.fields
      .filter((field) => field.value && field.value !== "حذف")
      .slice(0, 10)
      .map((field) => `
        <div class="iu-record-field">
          <span>${escapeHtml(field.label)}</span>
          <strong>${escapeHtml(field.value)}</strong>
        </div>
      `)
      .join("");

    document.querySelectorAll(".iu-row-selected").forEach((item) => item.classList.remove("iu-row-selected"));
    row.classList.add("iu-row-selected");
    drawer.querySelector("#iu-record-kicker").textContent = data.tableTitle;
    drawer.querySelector("#iu-record-title").textContent = data.title;
    drawer.querySelector("#iu-record-subtitle").textContent = data.subtitle;
    drawer.querySelector("#iu-record-summary").innerHTML = buildRecordSummary(data);
    drawer.querySelector("#iu-stage-flow").innerHTML = buildStageFlow(data);
    drawer.querySelector("#iu-record-timeline").innerHTML = buildRecordTimeline(data);
    drawer.querySelector("#iu-record-note").innerHTML = buildRecordNote(data);
    drawer.querySelector("#iu-record-fields").innerHTML = fieldMarkup;
    drawer.dataset.recordText = [data.tableTitle, data.title, data.subtitle]
      .concat(data.fields.map((field) => `${field.label}: ${field.value}`))
      .join("\n");
    drawer.dataset.recordPayload = JSON.stringify({
      id: recordId(data),
      title: data.title,
      subtitle: data.subtitle,
      tableTitle: data.tableTitle,
      fields: data.fields.slice(0, 12)
    });

    drawer.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
  }

  function closeDrawer() {
    const drawer = document.getElementById("iu-record-drawer");
    if (!drawer) return;
    drawer.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    document.querySelectorAll(".iu-row-selected").forEach((item) => item.classList.remove("iu-row-selected"));
  }

  async function copySummary(drawer) {
    const text = drawer.dataset.recordText || "";
    try {
      await navigator.clipboard.writeText(text);
      drawer.classList.add("copied");
      setTimeout(() => drawer.classList.remove("copied"), 900);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
    }
  }

  function markRows(root = document) {
    const rows = [];
    if (root.nodeType === 1 && root.matches && root.matches(rowSelector)) rows.push(root);
    root.querySelectorAll(rowSelector).forEach((row) => rows.push(row));
    rows.forEach((row) => {
      if (isIgnoredRow(row)) return;
      if (row.children.length < 2) return;
      row.classList.add("iu-row-openable");
      applyRiskClass(row);
      if (!row.hasAttribute("tabindex")) row.tabIndex = 0;
      row.setAttribute("title", "اضغط لعرض التفاصيل");
    });
  }

  function isIgnoredRow(row) {
    return row.closest(ignoredContainers) || row.matches(ignoredRows);
  }

  function applyRiskClass(row) {
    const text = clean(row.textContent);
    row.classList.remove("iu-risk-high", "iu-risk-watch", "iu-risk-value", "iu-favorite-row");
    if (/حرجة|اليوم|عاجل|3 أيام|ضمان/.test(text)) row.classList.add("iu-risk-high");
    else if (/أسبوع|جارية|متابعة|قيد/.test(text)) row.classList.add("iu-risk-watch");
    if (/[1-9]\d{6,}|SAR|ر\.س|ريال/.test(text)) row.classList.add("iu-risk-value");
    const id = recordId(getRowData(row));
    if (loadJson("iuFavorites", []).some((item) => item.id === id)) row.classList.add("iu-favorite-row");
  }

  function removeSmartHeader() {
    document.querySelectorAll("#iu-smart-header,.iu-smart-header").forEach((item) => item.remove());
  }

  function ensureWorkspaceTools() {
    document.querySelectorAll("#iu-floating-tools,#iu-command-panel").forEach((item) => item.remove());
  }

  function openCommandPanel(mode) {
    ensureWorkspaceTools();
    const panel = document.getElementById("iu-command-panel");
    if (!panel) return;
    panel.dataset.mode = mode;
    panel.classList.add("open");
    renderCommandPanel(mode);
  }

  function closeCommandPanel() {
    document.getElementById("iu-command-panel")?.classList.remove("open");
  }

  function renderCommandPanel(mode) {
    const title = document.getElementById("iu-command-title");
    const body = document.getElementById("iu-command-body");
    if (!title || !body) return;
    if (mode === "search") {
      title.textContent = "بحث شامل";
      body.innerHTML = `
        <input id="iu-global-search-input" class="iu-global-search-input" placeholder="ابحث باسم مشروع، عميل، حالة، تاريخ...">
        <div id="iu-search-results" class="iu-command-list"></div>
      `;
      renderSearchResults("");
      return;
    }
    if (mode === "favorites") {
      title.textContent = "المفضلة";
      renderRecordsList(body, loadJson("iuFavorites", []), true);
      return;
    }
    if (mode === "compare") {
      title.textContent = "مقارنة سريعة";
      renderComparePanel(body);
      return;
    }
    title.textContent = "مركز التنبيهات";
    renderAlerts(body);
  }

  function visibleRows() {
    return Array.from(document.querySelectorAll(rowSelector))
      .filter((row) => !row.closest(ignoredContainers) && row.offsetParent !== null);
  }

  function renderSearchResults(query) {
    const container = document.getElementById("iu-search-results");
    if (!container) return;
    const q = clean(query).toLowerCase();
    const rows = visibleRows()
      .map((row, index) => ({ row, index, data: getRowData(row), text: clean(row.textContent).toLowerCase() }))
      .filter((item) => !q || item.text.includes(q))
      .slice(0, 25);
    container.innerHTML = rows.length ? rows.map(({ index, data }) => commandItem(data, index)).join("") : `<p class="iu-empty">لا توجد نتائج مطابقة</p>`;
  }

  function renderAlerts(container) {
    const rows = visibleRows()
      .map((row, index) => ({ row, index, data: getRowData(row), score: riskScore(row) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 18);
    container.innerHTML = rows.length ? rows.map(({ index, data, score }) => `
      <button class="iu-command-item ${score >= 3 ? "danger" : "watch"}" type="button" data-row-index="${index}">
        <span>${score >= 3 ? "متابعة عاجلة" : "تحت المتابعة"}</span>
        <strong>${escapeHtml(data.title)}</strong>
        <small>${escapeHtml(data.subtitle)}</small>
      </button>
    `).join("") : `<p class="iu-empty">لا توجد تنبيهات ظاهرة في الصفحة الحالية</p>`;
  }

  function riskScore(row) {
    const text = clean(row.textContent);
    let score = 0;
    if (/اليوم|حرجة|عاجل|ضمان/.test(text)) score += 3;
    if (/3 أيام|أسبوع|قريبة|متابعة/.test(text)) score += 2;
    if (/[1-9]\d{6,}|SAR|ريال|ر\.س/.test(text)) score += 1;
    return score;
  }

  function commandItem(data, index) {
    return `
      <button class="iu-command-item" type="button" data-row-index="${index}">
        <span>${escapeHtml(data.tableTitle)}</span>
        <strong>${escapeHtml(data.title)}</strong>
        <small>${escapeHtml(data.subtitle)}</small>
      </button>
    `;
  }

  function renderRecordsList(container, records, removable = false) {
    container.innerHTML = records.length ? records.map((record) => `
      <div class="iu-command-item static">
        <span>${escapeHtml(record.tableTitle || "سجل")}</span>
        <strong>${escapeHtml(record.title || "-")}</strong>
        <small>${escapeHtml(record.subtitle || "")}</small>
        ${removable ? `<button class="iu-mini-remove" type="button" data-remove-favorite="${escapeHtml(record.id)}">إزالة</button>` : ""}
      </div>
    `).join("") : `<p class="iu-empty">لا توجد عناصر محفوظة بعد. افتح أي سجل واضغط تمييز.</p>`;
  }

  function renderComparePanel(container) {
    const records = loadJson("iuCompare", []);
    if (records.length < 2) {
      container.innerHTML = `
        <p class="iu-empty">افتح سجلين من الجداول واضغط "مقارنة" داخل درج التفاصيل.</p>
        ${records.length ? records.map((record) => `
          <div class="iu-command-item static">
            <span>${escapeHtml(record.tableTitle || "سجل")}</span>
            <strong>${escapeHtml(record.title || "-")}</strong>
            <small>${escapeHtml(record.subtitle || "")}</small>
          </div>
        `).join("") : ""}
      `;
      return;
    }
    const fieldMap = (record) => Object.fromEntries((record.fields || []).map((field) => [field.label, field.value]));
    const a = records[0], b = records[1];
    const labels = Array.from(new Set([...(a.fields || []).map((f) => f.label), ...(b.fields || []).map((f) => f.label)])).slice(0, 8);
    const af = fieldMap(a), bf = fieldMap(b);
    container.innerHTML = `
      <div class="iu-compare-grid">
        <div><strong>${escapeHtml(a.title)}</strong></div>
        <div><strong>${escapeHtml(b.title)}</strong></div>
      </div>
      ${labels.map((label) => `
        <div class="iu-compare-row">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(af[label] || "-")}</strong>
          <strong>${escapeHtml(bf[label] || "-")}</strong>
        </div>
      `).join("")}
    `;
  }

  function focusRow(index) {
    const row = visibleRows()[index];
    if (!row) return;
    closeCommandPanel();
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("iu-row-pulse");
    setTimeout(() => row.classList.remove("iu-row-pulse"), 1400);
    openDrawer(row);
  }

  function getPageProfile() {
    const path = location.pathname;
    if (path.includes("/analytics")) {
      return {
        kicker: "قراءة واتجاه عام",
        title: "مركز التحليلات",
        desc: "ملخص ذكي لحركة المناقصات مع وصول سريع للتفاصيل والتصدير.",
        metrics: [
          ["الإجمالي", textOf("#an-kpi-total") || countRows()],
          ["الجارية", textOf("#an-kpi-jariya") || textOf("#stat-active") || "—"],
          ["تم التقديم", textOf("#an-kpi-sub") || "—"]
        ]
      };
    }
    if (path.includes("/clients")) {
      return {
        kicker: "أهم العملاء والقطاعات",
        title: "لوحة العملاء",
        desc: "قراءة مختصرة لأكبر العملاء وعدد الجهات وتوزيع الأعمال.",
        metrics: [
          ["المشاريع", firstText(".client-kpi-num") || countRows()],
          ["العملاء", nthText(".client-kpi-num", 1) || "—"],
          ["صفوف ظاهرة", countRows()]
        ]
      };
    }
    if (path.includes("/executive-report")) {
      return {
        kicker: "تقرير الإدارة العليا",
        title: "الملخص التنفيذي",
        desc: "تنقل سريع بين النظرة العامة وجداول التقرير مع وضع عرض مناسب للاجتماعات.",
        metrics: [
          ["الأقسام", document.querySelectorAll(".sheet-list button,.nav-tab,.tab-button").length || "—"],
          ["السجلات", countRows()],
          ["الحالة", countRows() ? "محمّل" : "نظرة عامة"]
        ]
      };
    }
    return {
      kicker: "المتابعة اليومية",
      title: "مركز المناقصات",
      desc: "مؤشرات مختصرة للأولويات والصفوف القابلة للفحص.",
      metrics: [
        ["الجارية", textOf("#stat-active") || countRows()],
        ["الحرجة", textOf("#stat-urgent") || "—"],
        ["الصفوف", countRows()]
      ]
    };
  }

  function textOf(selector) {
    return clean(document.querySelector(selector)?.textContent);
  }

  function firstText(selector) {
    return clean(document.querySelector(selector)?.textContent);
  }

  function nthText(selector, index) {
    return clean(document.querySelectorAll(selector)[index]?.textContent);
  }

  function countRows() {
    return Array.from(document.querySelectorAll(rowSelector))
      .filter((row) => !row.closest(ignoredContainers) && row.offsetParent !== null).length || "—";
  }

  function ensureSmartHeader() {
    removeSmartHeader();
  }

  function getSmartTarget() {
    const path = location.pathname;
    if (path.includes("/analytics")) return document.querySelector("#tab-analytics .analytics-wrap,.analytics-wrap");
    if (path.includes("/clients")) return document.querySelector("#tab-clients .clients-wrap,.clients-wrap");
    if (path.includes("/tenders")) return document.querySelector("#tab-tenders .main,.main,main");
    if (path.includes("/executive-report")) return document.querySelector("main,.report-page,.page");
    return document.querySelector("main,.main,.page") || document.body.firstElementChild;
  }

  function updateSmartHeader() {
    removeSmartHeader();
  }

  function getViewMode() {
    try {
      return localStorage.getItem("iuViewMode") || "executive";
    } catch {
      return "executive";
    }
  }

  function setViewMode(mode) {
    const next = mode === "operational" ? "operational" : "executive";
    try { localStorage.setItem("iuViewMode", next); } catch {}
    applyViewMode(next);
  }

  function applyViewMode(mode) {
    document.body.classList.toggle("iu-mode-operational", mode === "operational");
    document.body.classList.toggle("iu-mode-executive", mode !== "operational");
    document.querySelectorAll(".iu-mode-btn").forEach((button) => {
      button.classList.toggle("active", button.dataset.iuMode === mode);
    });
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest(interactiveSelector)) return;
    const row = event.target.closest(rowSelector);
    if (!row || isIgnoredRow(row)) return;
    openDrawer(row);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest(rowSelector);
    if (!row || isIgnoredRow(row)) return;
    event.preventDefault();
    openDrawer(row);
  });

  function initInteractions() {
    removeSmartHeader();
    ensureWorkspaceTools();
    markRows();
    applyViewMode(getViewMode());
    setTimeout(markRows, 700);
    setTimeout(markRows, 1800);
    new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === 1) {
            if (node.closest && node.closest("#iu-floating-tools,#iu-command-panel,#iu-record-drawer")) return;
            markRows(node);
          }
        });
      });
      removeSmartHeader();
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initInteractions, { once: true });
  } else {
    initInteractions();
  }
})();
