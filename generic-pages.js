(() => {
  const DAY = 24 * 60 * 60 * 1000;
  const state = {
    tenders: [],
    sourceMeta: null
  };

  const pageDefs = {
    home: {
      title: "بوابة المناقصات الموحدة",
      description: "لوحة دخول موحّدة لمتابعة المناقصات، العمليات، العملاء، التحليلات، ومحفظة الفرص بنفس الثيم التشغيلي.",
      kicker: "مساحات العمل",
      heroTitle: "مركز تشغيل المناقصات",
      heroText: "انتقل مباشرة إلى الصفحة المطلوبة مع قراءة سريعة لحالة البيانات الحالية.",
      active: "home"
    },
    portfolio: {
      title: "نمو محفظة المناقصات",
      description: "قراءة مختصرة لمحفظة الفرص حسب القطاعات وأنواع الأعمال والجهات الأعلى حضورًا.",
      kicker: "محفظة الفرص",
      heroTitle: "مسارات المشاريع حسب المحفظة",
      heroText: "ترتيب تشغيلي يساعد على فهم أين تتركز الفرص الحالية.",
      active: "portfolio"
    },
    coordination: {
      title: "إدارة العمليات",
      description: "توزيع عملي للمهام اليومية حسب التقديم والضمان والمتابعة العاجلة.",
      kicker: "تشغيل يومي",
      heroTitle: "أولويات المتابعة",
      heroText: "تحويل المناقصات الجارية إلى مهام قابلة للتنفيذ حسب الموعد.",
      active: "coordination"
    },
    clients: {
      title: "أهم العملاء",
      description: "ترتيب الجهات المالكة حسب عدد المناقصات الحالية مع مؤشرات حضور كل جهة.",
      kicker: "تحليل العملاء",
      heroTitle: "الجهات الأعلى نشاطًا",
      heroText: "مراجعة العملاء والجهات التي تشكل الجزء الأكبر من الفرص الحالية.",
      active: "clients"
    },
    analytics: {
      title: "التحليلات",
      description: "مؤشرات ورسوم أشرطة مبسطة لتوزيع المناقصات حسب الجهة ونوع الأعمال والموعد.",
      kicker: "مؤشرات وتحليل",
      heroTitle: "قراءة سريعة للبيانات",
      heroText: "تركيز على التوزيعات والضغط الزمني بدون ازدحام بصري.",
      active: "analytics"
    },
    executive: {
      title: "تقارير الإدارة العليا",
      description: "ملخص تنفيذي قصير يوضح حالة المحفظة، المخاطر القريبة، والقرارات المقترحة.",
      kicker: "تقرير تنفيذي",
      heroTitle: "ملخص قابل للعرض",
      heroText: "صياغة تنفيذية مختصرة مبنية على بيانات المناقصات الحالية.",
      active: "executive"
    }
  };

  const navItems = [
    ["home", "", "▣", "الرئيسية"],
    ["portfolio", "portfolio/", "▤", "محفظة المناقصات"],
    ["tenders", "tenders/", "▦", "المناقصات الجارية"],
    ["coordination", "coordination/", "✓", "إدارة العمليات"],
    ["clients", "clients/", "↗", "أهم العملاء"],
    ["analytics", "analytics/", "○", "التحليلات"],
    ["executive", "executive-report/", "◷", "تقارير الإدارة"]
  ];

  const byId = (id) => document.getElementById(id);

  function pageKey() {
    const path = location.pathname.replace(/\\/g, "/");
    if (path.includes("/portfolio/")) return "portfolio";
    if (path.includes("/coordination/")) return "coordination";
    if (path.includes("/clients/")) return "clients";
    if (path.includes("/analytics/")) return "analytics";
    if (path.includes("/executive-report/")) return "executive";
    return "home";
  }

  function prefix() {
    const path = location.pathname.replace(/\\/g, "/");
    return /\/(portfolio|coordination|clients|analytics|executive-report)\//.test(path) ? "../" : "./";
  }

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

  function relativeDateText(value) {
    const days = daysUntil(value);
    if (days === null) return "غير محدد";
    if (days < 0) return `منذ ${Math.abs(days)} يوم`;
    if (days === 0) return "اليوم";
    if (days === 1) return "غدا";
    return `بعد ${days} يوم`;
  }

  function getStatus(item) {
    const days = daysUntil(item.deadline);
    if (days === null) return { key: "open", label: "جارية", className: "gp-open" };
    if (days < 0) return { key: "overdue", label: "متأخرة", className: "gp-overdue" };
    if (days === 0) return { key: "today", label: "اليوم", className: "gp-today" };
    if (days <= 3) return { key: "soon", label: `${days} أيام`, className: "gp-soon" };
    return { key: "open", label: "جارية", className: "gp-open" };
  }

  function normalizeTender(row, index) {
    return {
      id: row.tender_id || `tender-${index}`,
      name: row["اسم المناقصة"] || row.name || row["Ø§Ø³Ù… Ø§Ù„Ù…Ù†Ø§Ù‚ØµØ©"] || "-",
      owner: row["المالك"] || row.owner || row["Ø§Ù„Ù…Ø§Ù„Ùƒ"] || "-",
      workType: row["نوع الأعمال"] || row.workType || row["Ù†ÙˆØ¹ Ø§Ù„Ø£Ø¹Ù…Ø§Ù„"] || "-",
      sector: row["القطاع"] || row.sector || row["Ø§Ù„Ù‚Ø·Ø§Ø¹"] || "-",
      deadline: row["تاريخ التقديم"] || row.deadline || row["ØªØ§Ø±ÙŠØ® Ø§Ù„ØªÙ‚Ø¯ÙŠÙ…"] || "",
      guarantee: row["تاريخ الضمان الابتدائي"] || row.guarantee || row["ØªØ§Ø±ÙŠØ® Ø§Ù„Ø¶Ù…Ø§Ù† Ø§Ù„Ø§Ø¨ØªØ¯Ø§Ø¦ÙŠ"] || "",
      rawStatus: row["الحالة"] || row.status || row["Ø§Ù„Ø­Ø§Ù„Ø©"] || "جارية"
    };
  }

  async function readData() {
    const source = `${prefix()}data.json`;
    const res = await fetch(`${source}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.sourceMeta = { source, lastUpdated: data.last_updated };
    state.tenders = (data.tenders || []).map(normalizeTender);
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

  function upcomingTender() {
    return state.tenders
      .map((item) => ({ item, days: daysUntil(item.deadline) }))
      .filter((entry) => entry.days !== null && entry.days >= 0)
      .sort((a, b) => a.days - b.days)[0];
  }

  function stats() {
    const soon = state.tenders.filter((item) => {
      const days = daysUntil(item.deadline);
      return days !== null && days > 0 && days <= 3;
    }).length;
    return {
      active: state.tenders.length,
      today: state.tenders.filter((item) => daysUntil(item.deadline) === 0).length,
      soon,
      guaranteeToday: state.tenders.filter((item) => daysUntil(item.guarantee) === 0).length,
      overdue: state.tenders.filter((item) => {
        const days = daysUntil(item.deadline);
        return days !== null && days < 0;
      }).length,
      owners: Object.keys(countBy(state.tenders, "owner")).length,
      workTypes: Object.keys(countBy(state.tenders, "workType")).length,
      sectors: Object.keys(countBy(state.tenders, "sector")).length
    };
  }

  function mount() {
    const key = pageKey();
    const def = pageDefs[key];
    const p = prefix();
    const app = document.createElement("div");
    app.id = "generic-pages-app";
    app.className = "gp-app";
    app.innerHTML = `
      <aside class="gp-sidebar">
        <div class="gp-brand">
          <div class="gp-brand-logo"><img src="${p}portfolio/assets/alrawaf-logo.png" alt="الرواف"></div>
          <div>
            <strong>منصة الإدارة</strong>
            <span>مركز المناقصات والعقود</span>
          </div>
        </div>
        <nav class="gp-nav" aria-label="التنقل الرئيسي">
          ${navItems.map(([id, route, icon, label]) => `
            <a class="${def.active === id ? "active" : ""}" href="${p}${route}">
              <b class="gp-ico">${icon}</b><span>${label}</span>
            </a>
          `).join("")}
        </nav>
        <div class="gp-session-card">
          <span>آخر مزامنة محلية</span>
          <strong id="gp-sync-time">جاري التحميل</strong>
          <small id="gp-session-role">صلاحية تشغيلية</small>
        </div>
      </aside>
      <main class="gp-main">
        <header class="gp-topbar">
          <div class="gp-title">
            <h1>${def.title}</h1>
            <p>${def.description}</p>
          </div>
          <div class="gp-actions">
            <a class="gp-btn" href="${p}tenders/?skin=generic-v11">المناقصات</a>
            <button class="gp-btn primary" type="button" id="gp-refresh">تحديث</button>
          </div>
        </header>
        <section class="gp-hero-band">
          <div>
            <span class="gp-hero-kicker">${def.kicker}</span>
            <h2>${def.heroTitle}</h2>
            <p>${def.heroText}</p>
          </div>
          <div class="gp-hero-stat">
            <strong id="gp-hero-count">0</strong>
            <span>مناقصة نشطة</span>
          </div>
        </section>
        <section class="gp-metrics" id="gp-metrics"></section>
        <section id="gp-page-content"></section>
      </main>
    `;
    document.body.prepend(app);
    document.body.classList.add("gp-ready");
  }

  function renderMetrics() {
    const s = stats();
    byId("gp-hero-count").textContent = s.active;
    byId("gp-metrics").innerHTML = [
      ["▦", "المناقصات النشطة", s.active, "إجمالي الفرص الحالية", "var(--gp-green)"],
      ["◷", "باقي 3 أيام", s.soon, "تحتاج متابعة عاجلة", "var(--gp-gold)"],
      ["!", "تنتهي اليوم", s.today, "آخر موعد للتقديم", "var(--gp-red)"],
      ["▣", "الجهات المالكة", s.owners, "عدد الجهات في البيانات", "var(--gp-teal)"]
    ].map(([icon, label, value, hint, color]) => `
      <article class="gp-card">
        <span class="label"><i>${icon}</i>${label}</span>
        <strong style="--metric-color:${color}">${value}</strong>
        <small>${hint}</small>
      </article>
    `).join("");
  }

  function renderBars(entries, unit = "مناقصة") {
    const max = Math.max(1, ...entries.map((entry) => entry[1]));
    return `<div class="gp-bars">${entries.map(([label, count]) => {
      const width = Math.max(8, Math.round((count / max) * 100));
      return `
        <div class="gp-bar">
          <span title="${escapeAttr(label)}">${escapeHtml(label)}</span>
          <div class="gp-track"><div class="gp-fill" style="width:${width}%"></div></div>
          <strong>${count}</strong>
        </div>
      `;
    }).join("") || emptyState(`لا توجد بيانات ${unit}`)}</div>`;
  }

  function renderTenderRows(items, limit = 8) {
    return items.slice(0, limit).map((item, index) => {
      const status = getStatus(item);
      return `
        <tr>
          <td class="gp-priority ${status.key}">${index + 1}</td>
          <td><div class="gp-name"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.sector)}</span></div></td>
          <td>${escapeHtml(item.owner)}</td>
          <td>${escapeHtml(item.workType)}</td>
          <td>${dateLabel(item.deadline)}</td>
          <td><span class="gp-status ${status.className}">${escapeHtml(status.label)}</span></td>
        </tr>
      `;
    }).join("");
  }

  function renderHome() {
    const p = prefix();
    const s = stats();
    const up = upcomingTender();
    return `
      <section class="gp-route-grid">
        ${navItems.filter(([id]) => id !== "home").map(([id, route, icon, label]) => `
          <a class="gp-route-card" href="${p}${route}">
            <span class="gp-badge">${icon}</span>
            <strong>${label}</strong>
            <span>${routeDescriptions[id] || "فتح صفحة العمل"}</span>
          </a>
        `).join("")}
      </section>
      <section class="gp-grid" style="margin-top:16px">
        ${panel("أقرب مناقصة", up ? `<div class="gp-list-item"><strong>${escapeHtml(up.item.name)}</strong><span>${escapeHtml(up.item.owner)} - ${relativeDateText(up.item.deadline)}</span></div>` : emptyState("لا توجد مواعيد قادمة"))}
        ${panel("قراءة سريعة", `
          <div class="gp-report">
            <article><strong>${s.guaranteeToday} ضمان مستحق اليوم</strong><p>راجع الضمانات القريبة قبل نهاية اليوم التشغيلي.</p></article>
            <article><strong>${s.workTypes} نوع أعمال</strong><p>توزيع الفرص متنوع ويحتاج متابعة حسب التخصص.</p></article>
          </div>
        `)}
      </section>
    `;
  }

  const routeDescriptions = {
    portfolio: "تحليل المحفظة والقطاعات وأنواع الأعمال.",
    tenders: "قائمة المناقصات الجارية والتفاصيل.",
    coordination: "تحويل المواعيد إلى مهام متابعة.",
    clients: "ترتيب الجهات المالكة والعملاء.",
    analytics: "مؤشرات وتوزيعات بصرية مختصرة.",
    executive: "ملخص إداري قابل للعرض."
  };

  function renderPortfolio() {
    const sectors = topEntries(countBy(state.tenders, "sector"), 8);
    const workTypes = topEntries(countBy(state.tenders, "workType"), 8);
    return `
      <section class="gp-grid equal">
        ${panel("توزيع المحافظ حسب القطاع", renderBars(sectors))}
        ${panel("أنواع الأعمال الأعلى", renderBars(workTypes))}
      </section>
      <section class="gp-panel" style="margin-top:16px">
        <div class="gp-panel-head"><h2>مشاريع المحفظة الحالية</h2><span class="gp-badge">${state.tenders.length} فرصة</span></div>
        <div class="gp-table-wrap">
          <table class="gp-table">
            <thead><tr><th>#</th><th>المناقصة</th><th>الجهة</th><th>نوع الأعمال</th><th>التقديم</th><th>الحالة</th></tr></thead>
            <tbody>${renderTenderRows(state.tenders, 10)}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderCoordination() {
    const lanes = [
      ["today", "تقديم اليوم", (item) => daysUntil(item.deadline) === 0],
      ["guarantee", "ضمان مستحق", (item) => daysUntil(item.guarantee) === 0],
      ["soon", "متابعة خلال 3 أيام", (item) => {
        const days = daysUntil(item.deadline);
        return days !== null && days > 0 && days <= 3;
      }],
      ["open", "متابعة عادية", (item) => getStatus(item).key === "open"]
    ];
    return `
      <section class="gp-kanban">
        ${lanes.map(([, title, predicate]) => {
          const items = state.tenders.filter(predicate).slice(0, 5);
          return `
            <div class="gp-lane">
              <h3>${title}<span class="gp-badge">${items.length}</span></h3>
              <div class="gp-lane-body">
                ${items.map((item) => {
                  const status = getStatus(item);
                  return `<article class="gp-task ${status.key}"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.owner)}</span><span>${dateLabel(item.deadline)} - ${relativeDateText(item.deadline)}</span></article>`;
                }).join("") || emptyState("لا توجد مهام")}
              </div>
            </div>
          `;
        }).join("")}
      </section>
    `;
  }

  function renderClients() {
    const owners = topEntries(countBy(state.tenders, "owner"), 9);
    return `
      <section class="gp-client-grid">
        ${owners.slice(0, 6).map(([owner, count]) => `
          <article class="gp-client-card">
            <strong>${escapeHtml(owner)}</strong>
            <span>${count} مناقصة نشطة</span>
            <div class="gp-track"><div class="gp-fill" style="width:${Math.max(12, Math.round((count / owners[0][1]) * 100))}%"></div></div>
          </article>
        `).join("")}
      </section>
      <section class="gp-grid" style="margin-top:16px">
        ${panel("توزيع الجهات", renderBars(owners))}
        ${panel("أحدث مناقصات أعلى الجهات", `<div class="gp-list">${state.tenders.slice(0, 6).map((item) => `<div class="gp-list-item"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.owner)} - ${dateLabel(item.deadline)}</span></div>`).join("")}</div>`)}
      </section>
    `;
  }

  function renderAnalytics() {
    const statusMap = state.tenders.reduce((acc, item) => {
      const label = getStatus(item).label;
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
    const buckets = {
      "اليوم": state.tenders.filter((item) => daysUntil(item.deadline) === 0).length,
      "1-3 أيام": state.tenders.filter((item) => {
        const d = daysUntil(item.deadline);
        return d !== null && d > 0 && d <= 3;
      }).length,
      "4-14 يوم": state.tenders.filter((item) => {
        const d = daysUntil(item.deadline);
        return d !== null && d >= 4 && d <= 14;
      }).length,
      "أكثر من 14": state.tenders.filter((item) => {
        const d = daysUntil(item.deadline);
        return d !== null && d > 14;
      }).length
    };
    return `
      <section class="gp-grid equal">
        ${panel("حسب الحالة", renderBars(topEntries(statusMap, 6)))}
        ${panel("ضغط المواعيد", renderBars(Object.entries(buckets)))}
        ${panel("أعلى الجهات", renderBars(topEntries(countBy(state.tenders, "owner"), 8)))}
        ${panel("أعلى أنواع الأعمال", renderBars(topEntries(countBy(state.tenders, "workType"), 8)))}
      </section>
    `;
  }

  function renderExecutive() {
    const s = stats();
    const up = upcomingTender();
    const topOwner = topEntries(countBy(state.tenders, "owner"), 1)[0];
    const topWork = topEntries(countBy(state.tenders, "workType"), 1)[0];
    return `
      <section class="gp-grid">
        ${panel("ملخص الإدارة", `
          <div class="gp-report">
            <article><strong>المحفظة الحالية تحتوي ${s.active} مناقصة نشطة</strong><p>البيانات الحالية تشير إلى ${s.owners} جهة مالكة و${s.workTypes} نوع أعمال، مع تركّز واضح لدى ${escapeHtml(topOwner?.[0] || "-")}.</p></article>
            <article><strong>أقرب موعد: ${escapeHtml(up?.item.name || "-")}</strong><p>${up ? `${escapeHtml(up.item.owner)} - ${relativeDateText(up.item.deadline)}` : "لا توجد مواعيد قادمة في البيانات."}</p></article>
            <article><strong>أعلى نوع أعمال: ${escapeHtml(topWork?.[0] || "-")}</strong><p>${topWork ? `${topWork[1]} مناقصة ضمن هذا النوع.` : "لا توجد بيانات كافية."}</p></article>
          </div>
        `)}
        ${panel("قرارات مقترحة", `
          <div class="gp-report">
            <article><strong>مراجعة عاجلة</strong><p>متابعة ${s.today + s.soon} مناقصة واقعة ضمن نطاق اليوم وحتى 3 أيام.</p></article>
            <article><strong>ضمانات</strong><p>تأكيد جاهزية ${s.guaranteeToday} ضمان مستحق اليوم قبل إغلاق الدورة اليومية.</p></article>
            <article><strong>توزيع الجهد</strong><p>توجيه الفريق حسب أعلى الجهات وأنواع الأعمال لتقليل ازدحام المتابعة.</p></article>
          </div>
        `)}
      </section>
    `;
  }

  function panel(title, body, badge = "") {
    return `
      <section class="gp-panel">
        <div class="gp-panel-head"><h2>${title}</h2>${badge ? `<span class="gp-badge">${badge}</span>` : ""}</div>
        <div class="gp-body">${body}</div>
      </section>
    `;
  }

  function emptyState(text) {
    return `<div class="gp-empty">${text}</div>`;
  }

  function renderPage() {
    const key = pageKey();
    const renderers = {
      home: renderHome,
      portfolio: renderPortfolio,
      coordination: renderCoordination,
      clients: renderClients,
      analytics: renderAnalytics,
      executive: renderExecutive
    };
    renderMetrics();
    byId("gp-page-content").innerHTML = (renderers[key] || renderHome)();
    const last = state.sourceMeta?.lastUpdated ? new Date(state.sourceMeta.lastUpdated) : new Date();
    byId("gp-sync-time").textContent = new Intl.DateTimeFormat("ar-SA", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(last);
    byId("gp-session-role").textContent = `${state.tenders.length} مناقصة نشطة`;
  }

  async function initData() {
    byId("gp-page-content").innerHTML = emptyState("جاري تحميل البيانات...");
    try {
      await readData();
      renderPage();
    } catch (error) {
      byId("gp-page-content").innerHTML = emptyState("تعذر تحميل بيانات الصفحة");
    }
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

  function init() {
    if (document.getElementById("generic-pages-app")) return;
    mount();
    byId("gp-refresh").addEventListener("click", initData);
    initData();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
