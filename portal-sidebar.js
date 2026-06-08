(() => {
  const SESSION_KEY = "alrawafPortalRole";
  const pages = [
    { key: "tenders",          code: "TN", label: "المناقصات",  sub: "الرصد والمتابعة",    href: "../tenders/",          scope: "all" },
    { key: "coordination",     code: "OP", label: "العمليات",   sub: "التنسيق الداخلي",     href: "../coordination/",     scope: "all" },
    { key: "clients",          code: "CL", label: "العملاء",    sub: "العلاقات والجهات",    href: "../clients/",          scope: "all" },
    { key: "analytics",        code: "AN", label: "التحليلات",  sub: "المؤشرات والاتجاهات", href: "../analytics/",        scope: "all" },
    { key: "org-chart",        code: "OR", label: "الهيكل",     sub: "الهيكل التنظيمي",     href: "../org-chart/",        scope: "all" },
    { key: "portfolio",        code: "PF", label: "المحفظة",    sub: "محفظة المناقصات",     href: "../portfolio/",        scope: "executive" },
    { key: "executive-report", code: "RP", label: "التقارير",   sub: "تقارير الإدارة",      href: "../executive-report/", scope: "executive" }
  ];

  function savedRole() {
    try { return sessionStorage.getItem(SESSION_KEY) || ""; } catch { return ""; }
  }

  // ── الثيم (أزرق / افتراضي) — مفتاح مشترك بين كل الصفحات ──
  const THEME_KEY = "alrawafTheme";
  const PALETTE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>';
  function savedTheme() {
    try { return localStorage.getItem(THEME_KEY) === "green" ? "green" : "grad"; } catch { return "grad"; }
  }
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t === "green" ? "green" : "grad");
  }
  function refreshThemeButtons(t) {
    const label = t === "green" ? "المظهر البنفسجي" : "المظهر الأخضر";
    const injected = document.getElementById("portal-theme-toggle");
    if (injected) injected.title = label;
    // زر صفحة العمليات الأصلي (إن وُجد)
    const native = document.getElementById("theme-toggle");
    if (native) {
      native.setAttribute("aria-pressed", t === "green" ? "true" : "false");
      native.title = label;
    }
  }
  function toggleTheme() {
    const next = savedTheme() === "green" ? "grad" : "green";
    try { localStorage.setItem(THEME_KEY, next); } catch {}
    applyTheme(next);
    refreshThemeButtons(next);
  }
  // يحقن زر تغيير الثيم داخل هيدر الصفحة (أو عائماً إن لم يوجد هيدر)
  function injectThemeToggle() {
    // صفحة العمليات لديها زرها الخاص في الشريط العلوي
    if (document.getElementById("theme-toggle")) return;
    if (document.getElementById("portal-theme-toggle")) return;
    const btn = document.createElement("button");
    btn.id = "portal-theme-toggle";
    btn.className = "portal-theme-toggle";
    btn.type = "button";
    const label = savedTheme() === "green" ? "المظهر البنفسجي" : "المظهر الأخضر";
    btn.title = label;
    btn.setAttribute("aria-label", "تغيير المظهر");
    btn.innerHTML = PALETTE_SVG;
    btn.addEventListener("click", toggleTheme);
    const host = document.querySelector(".ds-header__actions")
              || document.querySelector(".header-actions")
              || ((document.querySelector(".header .export-btn, .topbar .export-btn") || {}).parentElement)
              || document.querySelector(".header")
              || document.querySelector(".topbar")
              || document.querySelector("header")
              || document.querySelector(".section-header");
    if (host) {
      btn.classList.add("in-header");
      // رأس القائمة فاتح الخلفية → نمط مناسب للخلفية الفاتحة
      if (host.classList.contains("section-header")) { btn.classList.add("on-light"); host.appendChild(btn); }
      else { host.insertBefore(btn, host.firstChild); }
    } else { btn.classList.add("floating"); document.body.appendChild(btn); }
  }
  // تطبيق فوري قبل بناء الشريط لتقليل الوميض
  applyTheme(savedTheme());

  // قائمة صفحات مخصّصة لكل مستخدم (إن حُدِّدت في جدول profiles.allowed_pages)
  function allowedPages() {
    try {
      const raw = sessionStorage.getItem("alrawafAllowedPages");
      const list = raw ? JSON.parse(raw) : null;
      return Array.isArray(list) && list.length ? list : null;
    } catch { return null; }
  }

  async function logout() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem("alrawafDepartmentKey");
      sessionStorage.removeItem("alrawafUserEmail");
      sessionStorage.removeItem("alrawafUserName");
    } catch {}
    const cfg = window.APP_CONFIG || {};
    const configured = cfg.supabaseUrl && cfg.supabaseKey
      && !String(cfg.supabaseUrl).includes("__") && !String(cfg.supabaseKey).includes("__");
    if (configured && window.supabase) {
      try {
        const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
        await sb.auth.signOut();
      } catch {}
    }
    window.location.href = "/";
  }

  function isActive(page) {
    return window.location.pathname.includes(`/${page.key}/`);
  }

  function init() {
    if (document.getElementById("control-sidebar")) return;
    const role = savedRole();
    const isExecutive = role === "manager" || role === "vp";
    // إن حُدِّدت صفحات مخصّصة للمستخدم نعرض تلك فقط، وإلا نعتمد صلاحية الـ role
    const custom = allowedPages();
    const visiblePages = custom
      ? pages.filter(p => custom.includes(p.key))
      : pages.filter(p => p.scope !== "executive" || isExecutive);

    const sidebar = document.createElement("aside");
    sidebar.id = "control-sidebar";
    sidebar.className = "control-sidebar";
    sidebar.setAttribute("aria-label", "لوحة التحكم");
    sidebar.innerHTML = `
      <div class="control-sidebar-brand">
        <img class="control-sidebar-logo" src="../portfolio/assets/alrawaf-logo.png" alt="الرواف للمقاولات">
        <strong>الإدارة العامة للمناقصات</strong>
        <small>الرواف للمقاولات — نظام المناقصات</small>
      </div>
      <nav class="control-sidebar-nav" aria-label="تنقل لوحة التحكم">
        ${visiblePages.map(page => `
          <a class="control-sidebar-link${isActive(page) ? " active" : ""}" href="${page.href}">
            <span class="ps-code">${page.code}</span>
            <span class="ps-texts">
              <span class="ps-label">${page.label}</span>
              <span class="ps-sub">${page.sub}</span>
            </span>
          </a>
        `).join("")}
      </nav>
      <button class="control-sidebar-logout" type="button">
        <span>خروج</span>
      </button>
    `;

    document.body.appendChild(sidebar);
    document.body.classList.add("has-control-sidebar");
    sidebar.querySelector(".control-sidebar-logout")?.addEventListener("click", logout);
    injectThemeToggle();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
