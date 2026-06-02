(() => {
  const SESSION_KEY = "alrawafPortalRole";
  const pages = [
    { key: "tenders", label: "المناقصات الجارية", href: "../tenders/", scope: "all" },
    { key: "coordination", label: "إدارة العمليات", href: "../coordination/", scope: "all" },
    { key: "portfolio", label: "محفظة المناقصات", href: "../portfolio/", scope: "executive" },
    { key: "clients", label: "أهم العملاء", href: "../clients/", scope: "all" },
    { key: "analytics", label: "التحليلات", href: "../analytics/", scope: "all" },
    { key: "executive-report", label: "تقارير الإدارة", href: "../executive-report/", scope: "executive" }
  ];

  function savedRole() {
    try {
      return sessionStorage.getItem(SESSION_KEY) || "";
    } catch {
      return "";
    }
  }

  function logout() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem("alrawafDepartmentKey");
    } catch {}
    window.location.href = "../index.html";
  }

  function isActive(page) {
    return window.location.pathname.includes(`/${page.key}/`);
  }

  function init() {
    if (document.getElementById("control-sidebar")) return;
    const role = savedRole();
    const isExecutive = role === "manager" || role === "vp";
    const visiblePages = pages.filter((page) => page.scope !== "executive" || isExecutive);
    const sidebar = document.createElement("aside");
    sidebar.id = "control-sidebar";
    sidebar.className = "control-sidebar";
    sidebar.setAttribute("aria-label", "لوحة التحكم");
    sidebar.innerHTML = `
      <div class="control-sidebar-brand">
        <span>لوحة التحكم</span>
        <strong>إدارة المناقصات</strong>
        <small>${isExecutive ? "صلاحية تنفيذية" : "صلاحية تشغيلية"}</small>
      </div>
      <nav class="control-sidebar-nav" aria-label="تنقل لوحة التحكم">
        ${visiblePages.map((page) => `
          <a class="control-sidebar-link ${isActive(page) ? "active" : ""}" href="${page.href}" title="${page.label}">
            <span>${page.label}</span>
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
