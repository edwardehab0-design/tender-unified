(() => {
  const DAY = 24 * 60 * 60 * 1000;
  const state = {
    tenders: [],
    filtered: [],
    search: "",
    status: "all",
    owner: "all",
    sort: "deadline",
    view: "table",
    sourceMeta: null
  };

  const byId = (id) => document.getElementById(id);

  function dateOnly(value) {
    if (!value) return null;
    const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function daysUntil(value) {
    const target = dateOnly(value);
    if (!target) return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - today) / DAY);
  }

  function dateLabel(value) {
    const d = dateOnly(value);
    if (!d) return "-";
    return new Intl.DateTimeFormat("ar-SA", {
      day: "numeric",
      month: "short",
      year: "numeric"
    }).format(d);
  }

  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
  }

  function getStatus(item) {
    const days = daysUntil(item.deadline);
    if (days === null) return { key: "open", label: "جارية", className: "gt-open" };
    if (days < 0) return { key: "overdue", label: "متأخرة", className: "gt-overdue" };
    if (days === 0) return { key: "today", label: "اليوم", className: "gt-today" };
    if (days <= 3) return { key: "soon", label: `${days} أيام`, className: "gt-soon" };
    return { key: "open", label: "جارية", className: "gt-open" };
  }

  function normalizeTender(row, index) {
    return {
      id: row.tender_id || `tender-${index}`,
      name: row["اسم المناقصة"] || row.name || "-",
      owner: row["المالك"] || row.owner || "-",
      workType: row["نوع الأعمال"] || row.workType || "-",
      sector: row["القطاع"] || row.sector || "-",
      deadline: row["تاريخ التقديم"] || row.deadline || "",
      guarantee: row["تاريخ الضمان الابتدائي"] || row.guarantee || "",
      rawStatus: row["الحالة"] || row.status || "جارية"
    };
  }

  async function readData() {
    const sources = ["../data.json", "./data.json"];
    let lastError;
    for (const source of sources) {
      try {
        const res = await fetch(`${source}?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        state.sourceMeta = { source, lastUpdated: data.last_updated };
        return (data.tenders || []).map(normalizeTender);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("تعذر تحميل البيانات");
  }

  function countBy(items, key) {
    return items.reduce((acc, item) => {
      const value = item[key] || "-";
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});
  }

  function topEntries(map, limit = 10) {
    return Object.entries(map)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ar"))
      .slice(0, limit);
  }

  function updateOwnerFilter() {
    const ownerSelect = byId("gt-owner-filter");
    const owners = uniqueSorted(state.tenders.map((item) => item.owner));
    ownerSelect.innerHTML = [
      `<option value="all">كل الجهات</option>`,
      ...owners.map((owner) => `<option value="${escapeAttr(owner)}">${escapeHtml(owner)}</option>`)
    ].join("");
  }

  function applyFilters() {
    const q = state.search.trim().toLowerCase();
    let rows = state.tenders.filter((item) => {
      const status = getStatus(item).key;
      const searchable = `${item.name} ${item.owner} ${item.workType} ${item.sector}`.toLowerCase();
      const matchesText = !q || searchable.includes(q);
      const matchesStatus = state.status === "all" || status === state.status;
      const matchesOwner = state.owner === "all" || item.owner === state.owner;
      return matchesText && matchesStatus && matchesOwner;
    });

    rows = rows.slice().sort((a, b) => {
      if (state.sort === "owner") return a.owner.localeCompare(b.owner, "ar");
      if (state.sort === "workType") return a.workType.localeCompare(b.workType, "ar");
      const ad = dateOnly(a.deadline)?.getTime() || Number.MAX_SAFE_INTEGER;
      const bd = dateOnly(b.deadline)?.getTime() || Number.MAX_SAFE_INTEGER;
      return ad - bd;
    });

    state.filtered = rows;
    renderTable();
    renderDistributions();
  }

  function renderMetrics() {
    const active = state.tenders.length;
    const today = state.tenders.filter((item) => daysUntil(item.deadline) === 0).length;
    const soon = state.tenders.filter((item) => {
      const days = daysUntil(item.deadline);
      return days !== null && days > 0 && days <= 3;
    }).length;
    const guaranteeToday = state.tenders.filter((item) => daysUntil(item.guarantee) === 0).length;
    const overdue = state.tenders.filter((item) => {
      const days = daysUntil(item.deadline);
      return days !== null && days < 0;
    }).length;

    byId("gt-active").textContent = active;
    byId("gt-soon").textContent = soon;
    byId("gt-today").textContent = today;
    byId("gt-guarantee").textContent = guaranteeToday;
    byId("gt-overdue").textContent = overdue;
  }

  function renderCountdown() {
    const upcoming = state.tenders
      .map((item) => ({ item, days: daysUntil(item.deadline) }))
      .filter((entry) => entry.days !== null && entry.days >= 0)
      .sort((a, b) => a.days - b.days)[0];

    if (!upcoming) {
      byId("gt-countdown-name").textContent = "لا توجد مواعيد قادمة";
      byId("gt-countdown-meta").textContent = "";
      ["days", "hours", "mins", "secs"].forEach((part) => byId(`gt-${part}`).textContent = "00");
      return;
    }

    byId("gt-countdown-name").textContent = upcoming.item.name;
    byId("gt-countdown-meta").textContent = `${upcoming.item.owner} - ${dateLabel(upcoming.item.deadline)}`;
    byId("gt-days").textContent = String(Math.max(0, upcoming.days)).padStart(2, "0");
    byId("gt-hours").textContent = "00";
    byId("gt-mins").textContent = "00";
    byId("gt-secs").textContent = "00";
  }

  function renderTable() {
    const tbody = byId("gt-tbody");
    const count = byId("gt-result-count");
    count.textContent = `${state.filtered.length} نتيجة`;

    if (!state.filtered.length) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="gt-empty gt-state"><b>لا توجد مناقصات مطابقة</b><span>جرّب تغيير الفلاتر أو البحث بكلمة أخرى.</span></div></td></tr>`;
      renderCards();
      updateView();
      return;
    }

    tbody.innerHTML = state.filtered.map((item, index) => {
      const status = getStatus(item);
      return `
        <tr class="gt-priority-${status.key}">
          <td>${index + 1}</td>
          <td>
            <div class="gt-tender-title">
              <strong>${escapeHtml(item.name)}</strong>
              <span class="gt-sector-badge">${escapeHtml(item.sector)}</span>
            </div>
          </td>
          <td>${escapeHtml(item.owner)}</td>
          <td>${escapeHtml(item.workType)}</td>
          <td>${dateLabel(item.deadline)}</td>
          <td>${dateLabel(item.guarantee)}</td>
          <td><span class="gt-status ${status.className}">${escapeHtml(status.label)}</span></td>
          <td><button class="gt-mini" type="button" data-details="${escapeAttr(item.id)}" title="تفاصيل">⌕</button></td>
        </tr>
      `;
    }).join("");
    renderCards();
    updateView();
  }

  function renderCards() {
    const cards = byId("gt-card-view");
    if (!cards) return;

    if (!state.filtered.length) {
      cards.innerHTML = `<div class="gt-empty gt-state"><b>لا توجد مناقصات مطابقة</b><span>جرّب تغيير الفلاتر أو البحث بكلمة أخرى.</span></div>`;
      return;
    }

    cards.innerHTML = state.filtered.map((item) => {
      const status = getStatus(item);
      return `
        <article class="gt-tender-card gt-priority-${status.key}">
          <div class="gt-tender-card-head">
            <div>
              <strong>${escapeHtml(item.name)}</strong>
              <span>${escapeHtml(item.owner)}</span>
            </div>
            <span class="gt-status ${status.className}">${escapeHtml(status.label)}</span>
          </div>
          <dl>
            <div><dt>نوع الأعمال</dt><dd>${escapeHtml(item.workType)}</dd></div>
            <div><dt>تاريخ التقديم</dt><dd>${dateLabel(item.deadline)}</dd></div>
            <div><dt>الضمان</dt><dd>${dateLabel(item.guarantee)}</dd></div>
            <div><dt>القطاع</dt><dd>${escapeHtml(item.sector)}</dd></div>
          </dl>
          <button class="gt-mini" type="button" data-details="${escapeAttr(item.id)}" title="تفاصيل">⌕</button>
        </article>
      `;
    }).join("");
  }

  function updateView() {
    const tableWrap = byId("gt-table-wrap");
    const cards = byId("gt-card-view");
    if (!tableWrap || !cards) return;
    const isCards = state.view === "cards";
    tableWrap.hidden = isCards;
    cards.hidden = !isCards;
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === state.view);
    });
  }

  function renderDistributions() {
    renderDistribution("gt-owner-bars", topEntries(countBy(state.filtered, "owner"), 10));
    renderDistribution("gt-worktype-bars", topEntries(countBy(state.filtered, "workType"), 8));
  }

  function renderDistribution(id, entries) {
    const target = byId(id);
    const max = Math.max(1, ...entries.map((entry) => entry[1]));
    target.innerHTML = entries.map(([label, count]) => {
      const width = Math.max(8, Math.round((count / max) * 100));
      return `
        <div class="gt-dist-row">
          <span title="${escapeAttr(label)}">${escapeHtml(label)}</span>
          <div class="gt-track"><div class="gt-fill" style="width:${width}%"></div></div>
          <strong>${count}</strong>
        </div>
      `;
    }).join("") || `<div class="gt-empty gt-state"><b>لا توجد بيانات</b><span>ستظهر التوزيعات بعد توفر نتائج مطابقة.</span></div>`;
  }

  function showToast(message) {
    const toast = byId("gt-toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function exportCsv() {
    const header = ["اسم المناقصة", "المالك", "نوع الأعمال", "تاريخ التقديم", "الضمان", "الحالة"];
    const rows = state.filtered.map((item) => [
      item.name,
      item.owner,
      item.workType,
      item.deadline,
      item.guarantee,
      getStatus(item).label
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "alrawaf-active-tenders.csv";
    a.click();
    URL.revokeObjectURL(url);
    showToast("تم تجهيز ملف التصدير");
  }

  function relativeDateText(value) {
    const days = daysUntil(value);
    if (days === null) return "غير محدد";
    if (days < 0) return `منذ ${Math.abs(days)} يوم`;
    if (days === 0) return "اليوم";
    if (days === 1) return "غدا";
    return `بعد ${days} يوم`;
  }

  function openDrawer(item) {
    const status = getStatus(item);
    byId("gt-drawer-title").textContent = item.name;
    byId("gt-drawer-owner").textContent = item.owner;
    byId("gt-drawer-worktype").textContent = item.workType;
    byId("gt-drawer-sector").textContent = item.sector;
    byId("gt-drawer-deadline").textContent = dateLabel(item.deadline);
    byId("gt-drawer-guarantee").textContent = dateLabel(item.guarantee);
    byId("gt-drawer-status").textContent = status.label;
    byId("gt-drawer-status").className = `gt-status ${status.className}`;
    byId("gt-drawer-filter-owner").dataset.owner = item.owner;
    byId("gt-drawer-timeline").innerHTML = `
      <article>
        <span></span>
        <div><strong>آخر موعد للتقديم</strong><small>${dateLabel(item.deadline)} - ${relativeDateText(item.deadline)}</small></div>
      </article>
      <article>
        <span></span>
        <div><strong>الضمان الابتدائي</strong><small>${dateLabel(item.guarantee)} - ${relativeDateText(item.guarantee)}</small></div>
      </article>
      <article>
        <span></span>
        <div><strong>الجهة المالكة</strong><small>${escapeHtml(item.owner)}</small></div>
      </article>
    `;
    byId("gt-drawer").classList.add("show");
    byId("gt-drawer").setAttribute("aria-hidden", "false");
  }

  function closeDrawer() {
    byId("gt-drawer").classList.remove("show");
    byId("gt-drawer").setAttribute("aria-hidden", "true");
  }

  function csvCell(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function mount() {
    const app = document.createElement("div");
    app.id = "generic-tenders-app";
    app.className = "gt-app";
    app.innerHTML = `
      <aside class="gt-sidebar">
        <div class="gt-brand">
          <div class="gt-brand-logo"><img src="../portfolio/assets/alrawaf-logo.png" alt="الرواف"></div>
          <div>
            <strong>منصة الإدارة</strong>
            <span>مركز المناقصات والعقود</span>
          </div>
        </div>
        <nav class="gt-nav" aria-label="التنقل الرئيسي">
          <a class="active" href="../tenders/"><b class="gt-ico">▦</b><span>المناقصات الجارية</span></a>
          <a href="../coordination/"><b class="gt-ico">✓</b><span>إدارة العمليات</span></a>
          <a href="../clients/"><b class="gt-ico">↗</b><span>أهم العملاء</span></a>
          <a href="../analytics/"><b class="gt-ico">◌</b><span>التحليلات</span></a>
          <button type="button" id="gt-refresh-side"><b class="gt-ico">↻</b><span>تحديث البيانات</span></button>
        </nav>
        <div class="gt-sidebar-footer">
          <div class="gt-session-card">
            <span>آخر مزامنة محلية</span>
            <strong id="gt-sync-time">جاري التحميل</strong>
            <small id="gt-session-role">صلاحية تشغيلية</small>
          </div>
        </div>
      </aside>

      <main class="gt-main">
        <header class="gt-topbar">
          <div class="gt-title">
            <h1>المناقصات الجارية</h1>
            <p>متابعة المنافسات النشطة، المواعيد الحرجة، الضمانات، وتوزيع الجهات المالكة من شاشة تشغيل واحدة.</p>
          </div>
          <div class="gt-actions">
            <button class="gt-btn icon" type="button" id="gt-refresh" title="تحديث">↻</button>
            <button class="gt-btn" type="button" id="gt-export">تصدير</button>
            <button class="gt-btn primary" type="button" id="gt-open-source">فتح البيانات</button>
          </div>
        </header>

        <section class="gt-toolbar" aria-label="الفلاتر">
          <label class="gt-field">
            <input id="gt-search" type="search" placeholder="بحث باسم المناقصة أو الجهة أو نوع الأعمال">
          </label>
          <label class="gt-field">
            <select id="gt-owner-filter"><option value="all">كل الجهات</option></select>
          </label>
          <label class="gt-field">
            <select id="gt-sort">
              <option value="deadline">الأقرب موعدا</option>
              <option value="owner">حسب الجهة</option>
              <option value="workType">حسب نوع الأعمال</option>
            </select>
          </label>
          <button class="gt-btn" type="button" id="gt-reset">إعادة ضبط</button>
        </section>
        <section class="gt-segments" aria-label="فلاتر الحالة">
          <button class="active" type="button" data-status="all">الكل</button>
          <button type="button" data-status="open">جارية</button>
          <button type="button" data-status="soon">باقي 3 أيام</button>
          <button type="button" data-status="today">تنتهي اليوم</button>
          <button type="button" data-status="overdue">متأخرة</button>
        </section>

        <section class="gt-metrics" aria-label="مؤشرات">
          <article class="gt-card gt-metric">
            <span class="gt-metric-head"><i>▦</i><span class="label">المناقصات الجارية</span></span>
            <strong id="gt-active">0</strong>
            <small>إجمالي المنافسات النشطة</small>
            <div class="gt-spark"></div>
          </article>
          <article class="gt-card gt-metric">
            <span class="gt-metric-head"><i>◷</i><span class="label">الباقي 3 أيام</span></span>
            <strong id="gt-soon">0</strong>
            <small>تحتاج متابعة عاجلة</small>
            <div class="gt-spark"></div>
          </article>
          <article class="gt-card gt-metric">
            <span class="gt-metric-head"><i>!</i><span class="label">تنتهي اليوم</span></span>
            <strong id="gt-today" style="--metric-color: var(--gt-gold)">0</strong>
            <small>آخر موعد للتقديم</small>
            <div class="gt-spark"></div>
          </article>
          <article class="gt-card gt-metric">
            <span class="gt-metric-head"><i>▣</i><span class="label">ضمان اليوم</span></span>
            <strong id="gt-guarantee" style="--metric-color: var(--gt-teal)">0</strong>
            <small>تاريخ الضمان الابتدائي</small>
            <div class="gt-spark"></div>
          </article>
          <article class="gt-card gt-metric">
            <span class="gt-metric-head"><i>×</i><span class="label">متأخرة</span></span>
            <strong id="gt-overdue" style="--metric-color: var(--gt-red)">0</strong>
            <small>منتهية أو تحتاج إجراء</small>
            <div class="gt-spark"></div>
          </article>
        </section>

        <section class="gt-countdown">
          <div>
            <p>أقرب مناقصة تنتهي</p>
            <h2 id="gt-countdown-name">جاري التحميل</h2>
            <p id="gt-countdown-meta"></p>
          </div>
          <div class="gt-clock" aria-label="الوقت المتبقي">
            <span><b id="gt-days">00</b><small>يوم</small></span>
            <span><b id="gt-hours">00</b><small>ساعة</small></span>
            <span><b id="gt-mins">00</b><small>دقيقة</small></span>
            <span><b id="gt-secs">00</b><small>ثانية</small></span>
          </div>
        </section>

        <section class="gt-workbench">
          <div class="gt-panel">
            <div class="gt-panel-head">
              <h2>قائمة المناقصات</h2>
              <div class="gt-panel-tools">
                <div class="gt-view-toggle" aria-label="طريقة العرض">
                  <button class="active" type="button" data-view="table">جدول</button>
                  <button type="button" data-view="cards">كروت</button>
                </div>
                <span class="gt-count" id="gt-result-count">0 نتيجة</span>
              </div>
            </div>
            <div class="gt-table-wrap" id="gt-table-wrap">
              <table class="gt-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>المناقصة</th>
                    <th>المالك</th>
                    <th>نوع الأعمال</th>
                    <th>تاريخ التقديم</th>
                    <th>الضمان</th>
                    <th>الأولوية</th>
                    <th>إجراء</th>
                  </tr>
                </thead>
                <tbody id="gt-tbody"></tbody>
              </table>
            </div>
            <div class="gt-card-view" id="gt-card-view" hidden></div>
          </div>
          <aside class="gt-side-stack">
            <section class="gt-panel">
              <div class="gt-panel-head"><h3>توزيع الجهات المالكة</h3></div>
              <div class="gt-side-body" id="gt-owner-bars"></div>
            </section>
            <section class="gt-panel">
              <div class="gt-panel-head"><h3>أنواع الأعمال</h3></div>
              <div class="gt-side-body" id="gt-worktype-bars"></div>
            </section>
          </aside>
        </section>
      </main>
      <aside class="gt-drawer" id="gt-drawer" aria-hidden="true" aria-label="تفاصيل المناقصة">
        <div class="gt-drawer-backdrop" id="gt-drawer-backdrop"></div>
        <section class="gt-drawer-panel" role="dialog" aria-modal="true" aria-labelledby="gt-drawer-title">
          <button class="gt-drawer-close" id="gt-drawer-close" type="button" aria-label="إغلاق">×</button>
          <div class="gt-drawer-head">
            <span>تفاصيل المناقصة</span>
            <h2 id="gt-drawer-title">-</h2>
            <p id="gt-drawer-owner">-</p>
          </div>
          <div class="gt-drawer-grid">
            <article><span>نوع الأعمال</span><strong id="gt-drawer-worktype">-</strong></article>
            <article><span>القطاع</span><strong id="gt-drawer-sector">-</strong></article>
            <article><span>تاريخ التقديم</span><strong id="gt-drawer-deadline">-</strong></article>
            <article><span>الضمان الابتدائي</span><strong id="gt-drawer-guarantee">-</strong></article>
          </div>
          <div class="gt-drawer-status-card">
            <span>الأولوية الحالية</span>
            <strong id="gt-drawer-status" class="gt-status gt-open">-</strong>
          </div>
          <div class="gt-drawer-timeline" id="gt-drawer-timeline"></div>
          <div class="gt-drawer-actions">
            <button class="gt-btn primary" id="gt-drawer-filter-owner" type="button">عرض مناقصات الجهة</button>
            <button class="gt-btn" id="gt-drawer-copy" type="button">نسخ الاسم</button>
          </div>
        </section>
      </aside>
      <div class="gt-toast" id="gt-toast"></div>
    `;
    document.body.prepend(app);
    document.body.classList.add("gt-ready");
  }

  function resetFilters() {
    state.search = "";
    state.status = "all";
    state.owner = "all";
    state.sort = "deadline";
    byId("gt-search").value = "";
    byId("gt-owner-filter").value = "all";
    byId("gt-sort").value = "deadline";
    document.querySelectorAll(".gt-segments button").forEach((button) => {
      button.classList.toggle("active", button.dataset.status === "all");
    });
    applyFilters();
    showToast("تمت إعادة ضبط الفلاتر");
  }

  function bindEvents() {
    byId("gt-search").addEventListener("input", (event) => {
      state.search = event.target.value;
      applyFilters();
    });
    document.querySelectorAll(".gt-segments button").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".gt-segments button").forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        state.status = button.dataset.status || "all";
        applyFilters();
      });
    });
    byId("gt-owner-filter").addEventListener("change", (event) => {
      state.owner = event.target.value;
      applyFilters();
    });
    byId("gt-sort").addEventListener("change", (event) => {
      state.sort = event.target.value;
      applyFilters();
    });
    byId("gt-reset").addEventListener("click", resetFilters);
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", () => {
        state.view = button.dataset.view || "table";
        updateView();
      });
    });
    byId("gt-export").addEventListener("click", exportCsv);
    byId("gt-open-source").addEventListener("click", () => window.open("../data.json", "_blank"));
    byId("gt-refresh").addEventListener("click", initData);
    byId("gt-refresh-side").addEventListener("click", initData);
    byId("gt-drawer-close").addEventListener("click", closeDrawer);
    byId("gt-drawer-backdrop").addEventListener("click", closeDrawer);
    byId("gt-drawer-filter-owner").addEventListener("click", (event) => {
      state.owner = event.currentTarget.dataset.owner || "all";
      byId("gt-owner-filter").value = state.owner;
      closeDrawer();
      applyFilters();
    });
    byId("gt-drawer-copy").addEventListener("click", async () => {
      const name = byId("gt-drawer-title").textContent;
      try {
        await navigator.clipboard.writeText(name);
        showToast("تم نسخ اسم المناقصة");
      } catch {
        showToast(name);
      }
    });
    document.addEventListener("click", (event) => {
      const id = event.target?.dataset?.details;
      if (!id) return;
      const item = state.tenders.find((row) => row.id === id);
      if (item) openDrawer(item);
    });
  }

  async function initData() {
    byId("gt-tbody").innerHTML = `<tr><td colspan="8"><div class="gt-empty gt-state loading"><b>جاري تحميل البيانات...</b><span>يتم قراءة ملف المناقصات المحلي الآن.</span></div></td></tr>`;
    try {
      state.tenders = await readData();
      updateOwnerFilter();
      renderMetrics();
      renderCountdown();
      const last = state.sourceMeta?.lastUpdated ? new Date(state.sourceMeta.lastUpdated) : new Date();
      byId("gt-sync-time").textContent = new Intl.DateTimeFormat("ar-SA", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      }).format(last);
      byId("gt-session-role").textContent = `${state.tenders.length} مناقصة نشطة`;
      applyFilters();
      showToast("تم تحديث البيانات");
    } catch (error) {
      byId("gt-tbody").innerHTML = `<tr><td colspan="8"><div class="gt-empty">تعذر تحميل البيانات</div></td></tr>`;
      showToast(error.message || "تعذر تحميل البيانات");
    }
  }

  function init() {
    if (document.getElementById("generic-tenders-app")) return;
    mount();
    bindEvents();
    initData();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
