(() => {
  const SESSION_KEY = "alrawafPortalRole";
  const pages = [
    { key: "tenders", label: "المناقصات", sub: "الرصد والمتابعة", href: "/tenders/", scope: "all", code: "TN" },
    { key: "coordination", label: "العمليات", sub: "التنسيق الداخلي", href: "/coordination/", scope: "all", code: "OP" },
    { key: "portfolio", label: "المحفظة", sub: "النمو والتحليل", href: "/portfolio/", scope: "executive", code: "PF" },
    { key: "clients", label: "العملاء", sub: "العلاقات والجهات", href: "/clients/", scope: "all", code: "CL" },
    { key: "analytics", label: "التحليلات", sub: "المؤشرات والاتجاهات", href: "/analytics/", scope: "all", code: "AN" },
    { key: "executive-report", label: "الإدارة العليا", sub: "التقارير التنفيذية", href: "/executive-report/", scope: "executive", code: "EX" }
  ];
  const DECORATIVE_ICON_RE = /[\u{1F000}-\u{1FAFF}\u2190-\u22FF\u25A0-\u27BF\u2B00-\u2BFF\uFE0F\u200D]/gu;
  const ICON_ONLY_SELECTOR = [
    ".ei-icon",
    ".stat-icon-wrap",
    ".alert-icon",
    ".countdown-icon",
    ".cm-tender-icon",
    ".an-kpi-icon",
    ".welcome-avatar-icon",
    ".kpi-ic"
  ].join(",");
  const SKIP_SANITIZE_SELECTOR = "script, style, svg, path, input, textarea, select, option, canvas";
  let iconObserver = null;

  function hasDecorativeIcon(value) {
    DECORATIVE_ICON_RE.lastIndex = 0;
    return DECORATIVE_ICON_RE.test(String(value || ""));
  }

  function stripDecorativeIcons(value) {
    DECORATIVE_ICON_RE.lastIndex = 0;
    return String(value || "").replace(DECORATIVE_ICON_RE, "").replace(/[ \t]{2,}/g, " ");
  }

  function sanitizeIconOnlyElement(element) {
    element.textContent = "";
    element.setAttribute("aria-hidden", "true");
    element.classList.add("is-icon-sanitized");
  }

  function fallbackButtonLabel(button) {
    if (!button) return "";
    const className = String(button.className || "").toLowerCase();
    const explicitLabel = button.getAttribute("aria-label") || button.getAttribute("title");
    if (explicitLabel) return explicitLabel;
    if (className.includes("close") || className.includes("dismiss")) return "إغلاق";
    return "";
  }

  function ensureButtonText(button) {
    if (!button || button.textContent.trim()) return;
    const label = fallbackButtonLabel(button);
    if (!label) return;
    button.textContent = label;
    button.classList.add("is-text-button-fallback");
  }

  function sanitizeTextNode(node) {
    if (!node || !hasDecorativeIcon(node.nodeValue)) return;
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIP_SANITIZE_SELECTOR)) return;
    node.nodeValue = stripDecorativeIcons(node.nodeValue);
    ensureButtonText(parent.closest("button"));
  }

  function sanitizeDecorativeIcons(root = document.body) {
    if (!document.body) return;
    const scope = root && root.nodeType === Node.ELEMENT_NODE ? root : document.body;
    if (scope.matches?.(ICON_ONLY_SELECTOR)) sanitizeIconOnlyElement(scope);
    scope.querySelectorAll?.(ICON_ONLY_SELECTOR).forEach(sanitizeIconOnlyElement);

    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent || parent.closest(SKIP_SANITIZE_SELECTOR)) return NodeFilter.FILTER_REJECT;
        return hasDecorativeIcon(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(sanitizeTextNode);
  }

  function observeIconCleanup() {
    if (iconObserver || !document.body) return;
    sanitizeDecorativeIcons(document.body);
    iconObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            sanitizeTextNode(node);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            sanitizeDecorativeIcons(node);
          }
        });
      });
    });
    iconObserver.observe(document.body, { childList: true, subtree: true });
  }

  function savedRole() {
    try {
      return sessionStorage.getItem(SESSION_KEY) || "";
    } catch {
      return "";
    }
  }

  function isExecutiveRole(role) {
    return role === "manager" || role === "vp";
  }

  function activePage() {
    const path = window.location.pathname;
    return pages.find((page) => path.includes(`/${page.key}/`)) || pages[0];
  }

  function visiblePages() {
    const role = savedRole();
    const isExecutive = isExecutiveRole(role);
    return pages.filter((page) => page.scope !== "executive" || isExecutive);
  }

  async function logout() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem("alrawafDepartmentKey");
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

  function movePageActions(actions) {
    const header = document.querySelector(".header");
    const exportWrap = header?.querySelector(".export-wrap");
    const lastUpdate = header?.querySelector(".last-update");

    if (lastUpdate) {
      lastUpdate.classList.add("enterprise-last-update");
      actions.appendChild(lastUpdate);
    }
    if (exportWrap) {
      exportWrap.classList.add("enterprise-export");
      actions.appendChild(exportWrap);
    }
    if (exportWrap || lastUpdate) {
      header.classList.add("enterprise-header-absorbed");
    }
  }

  function createTopbar(current) {
    const topbar = document.createElement("header");
    topbar.id = "enterprise-topbar";
    topbar.className = "enterprise-topbar";
    topbar.innerHTML = `
      <div class="enterprise-topbar-title">
        <div class="enterprise-product-mark" aria-hidden="true">AR</div>
        <div>
          <div class="enterprise-suite">منصة الرواف لإدارة المناقصات</div>
          <h1>${current.label}</h1>
        </div>
      </div>
      <div class="enterprise-topbar-meta">
        <span class="enterprise-context">${current.sub}</span>
      </div>
      <div class="enterprise-topbar-actions"></div>
    `;
    document.body.prepend(topbar);
    movePageActions(topbar.querySelector(".enterprise-topbar-actions"));
  }

  function createSidebar(current) {
    const sidebar = document.createElement("aside");
    sidebar.id = "control-sidebar";
    sidebar.className = "control-sidebar";
    sidebar.setAttribute("aria-label", "التنقل الرئيسي");
    sidebar.innerHTML = `
      <div class="control-sidebar-brand">
        <span class="control-sidebar-kicker">Enterprise</span>
        <strong>إدارة المناقصات</strong>
        <small>${isExecutiveRole(savedRole()) ? "صلاحية تنفيذية" : "صلاحية تشغيلية"}</small>
      </div>
      <nav class="control-sidebar-nav" aria-label="أقسام المنصة">
        ${visiblePages().map((page) => `
          <a class="control-sidebar-link ${page.key === current.key ? "active" : ""}" href="${page.href}" title="${page.label}">
            <span class="control-sidebar-code" aria-hidden="true">${page.code}</span>
            <span class="control-sidebar-text">
              <strong>${page.label}</strong>
              <small>${page.sub}</small>
            </span>
          </a>
        `).join("")}
      </nav>
      <button class="control-sidebar-logout" type="button">
        <span>خروج</span>
      </button>
    `;
    document.body.appendChild(sidebar);
    sidebar.querySelector(".control-sidebar-logout")?.addEventListener("click", logout);
  }

  function init() {
    if (document.getElementById("control-sidebar")) {
      observeIconCleanup();
      return;
    }
    const current = activePage();
    document.body.classList.add("has-control-sidebar", "enterprise-shell-ready");
    createTopbar(current);
    createSidebar(current);
    observeIconCleanup();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
