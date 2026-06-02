(function () {
  const SESSION_KEY = "alrawafPortalRole";

  const users = {
    manager: {
      password: "TDM@2026",
      name: "مدير الإدارة العامة للمناقصات",
      message: "مرحباً بك سعادة مدير الإدارة العامة للمناقصات",
      sub: "نتشرف بتشريفكم في منصتنا. جميع بيانات المناقصات والتحليلات في خدمتكم.",
      avatar: "./assets/manager-avatar.jpg",
      access: "executive",
    },
    vp: {
      password: "EVP@2026",
      name: "سعادة نائب الرئيس التنفيذي",
      message: "مرحباً بك سعادة نائب الرئيس التنفيذي",
      sub: "نتشرف بتشريفكم في منصتنا. جميع بيانات المناقصات والتحليلات في خدمتكم.",
      avatar: "./assets/vp-avatar.jpg",
      access: "executive",
    },
    general: {
      password: "RT2026",
      name: "فريق العمل",
      message: "مرحباً بكم في بوابة المناقصات",
      sub: "يمكنكم متابعة المناقصات الجارية وأهم العملاء والتحليلات.",
      avatar: "./assets/tendering-logo.jpg",
      access: "general",
      isLogo: true,
    },
  };

  const $ = (id) => document.getElementById(id);
  let currentUser = null;

  const findByPassword = (pwd) => {
    const t = pwd.trim();
    const e = Object.entries(users).find(([, u]) => u.password === t);
    return e ? { ...e[1], key: e[0] } : null;
  };
  const byKey = (k) => (users[k] ? { ...users[k], key: k } : null);

  const saveSession = () => { try { if (currentUser?.key) sessionStorage.setItem(SESSION_KEY, currentUser.key); } catch {} };
  const loadSession = () => { try { return byKey(sessionStorage.getItem(SESSION_KEY)); } catch { return null; } };
  const clearSession = () => { try { sessionStorage.removeItem(SESSION_KEY); } catch {} };

  const applyAccess = () => {
    const exec = currentUser?.access === "executive";
    document.querySelectorAll("[data-role-scope='executive']").forEach((el) => { el.hidden = !exec; });
  };

  // ── modal helpers
  const modal = () => $("login-modal");
  const openModal = () => {
    const m = modal(); m.hidden = false; m.removeAttribute("aria-hidden");
    document.body.style.overflow = "hidden";
    setTimeout(() => $("portal-password")?.focus(), 50);
  };
  const closeModal = () => {
    const m = modal(); m.hidden = true; m.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    $("login-error").textContent = "";
    $("portal-password").value = "";
  };

  // ── welcome overlay
  const showWelcome = (user) => {
    currentUser = user;
    saveSession();
    const av = $("welcome-avatar");
    av.innerHTML = user.avatar
      ? `<img src="${user.avatar}" alt="" class="${user.isLogo ? "is-logo" : ""}">`
      : "";
    $("welcome-name").textContent = user.name;
    $("welcome-message").textContent = user.message;
    $("welcome-sub").textContent = user.sub;
    const o = $("welcome-overlay");
    o.hidden = false; o.removeAttribute("aria-hidden");
    document.body.style.overflow = "hidden";
  };
  const hideWelcome = () => {
    const o = $("welcome-overlay");
    o.hidden = true; o.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  };

  // ── reveal portal sections
  const revealSections = () => {
    const s = document.getElementById("sections");
    if (!s) return;
    s.hidden = false;
    applyAccess();
    // smooth scroll
    requestAnimationFrame(() => {
      s.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  document.addEventListener("DOMContentLoaded", () => {
    // open login from header / hero / footer
    ["header-login", "hero-login", "footer-login"].forEach((id) => {
      const el = $(id);
      el?.addEventListener("click", (e) => { e.preventDefault(); openModal(); });
    });

    // close handlers
    document.querySelectorAll("#login-modal [data-close]").forEach((el) => el.addEventListener("click", closeModal));
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$("login-modal").hidden) closeModal();
    });

    // toggle password
    $("toggle-password")?.addEventListener("click", () => {
      const i = $("portal-password");
      i.type = i.type === "password" ? "text" : "password";
    });

    // login submit
    $("login-form")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const u = findByPassword($("portal-password").value);
      if (!u) { $("login-error").textContent = "كلمة المرور غير صحيحة"; $("portal-password").focus(); return; }
      closeModal();
      showWelcome(u);
    });

    // enter portal
    $("enter-portal")?.addEventListener("click", () => {
      hideWelcome();
      revealSections();
    });

    // restore session if present
    const saved = loadSession();
    if (saved) {
      currentUser = saved;
      const s = document.getElementById("sections");
      if (s) { s.hidden = false; applyAccess(); }
    }
  });

  window.AUTH = {
    logout: () => { clearSession(); currentUser = null; document.getElementById("sections").hidden = true; },
  };
})();
