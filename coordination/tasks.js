/* ══════════════════════════════════════════════════════════════
   tasks.js — نظام إدارة مهام الإدارة (مستقل، تخزين محلي)
   أنواع: مناقصة جارية · BTC · طلب تخفيض · أخرى
   سير: قيد العمل → قيد المراجعة → مكتملة → معتمدة
   أدوار: مدير الإدارة · مدير قسم · قائد فريق · مهندس
   ══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const LS_TASKS = "alrawafOpsTasks";
  const LS_IDENT = "alrawafOpsIdentity";

  const COLUMNS = [
    { key: "in-progress", name: "قيد العمل" },
    { key: "review",      name: "قيد المراجعة" },
    { key: "completed",   name: "مكتملة" },
    { key: "approved",    name: "معتمدة" }
  ];
  const TYPES = [
    { key: "tender",    label: "مناقصة جارية", cls: "t-tender",    dot: "#1f3a5f", src: "active" },
    { key: "ptc",       label: "PTC",          cls: "t-btc",       dot: "#1f5e3e", src: "submitted" },
    { key: "reduction", label: "طلب تخفيض",    cls: "t-reduction", dot: "#9a6c12", src: "submitted" },
    { key: "other",     label: "مهمة أخرى",    cls: "t-other",     dot: "#41525e", src: "free" }
  ];

  let departments = [];          // [{key,name,employees:[{name,title}]}]
  let tasks = [];
  let identity = null;           // {role, deptKey, name}
  let deptFilter = "all";
  let activeTenders = [];      // المناقصات الجارية → لنوع "مناقصة جارية"
  let submittedTenders = [];   // المناقصات المقدَّمة → لنوعَي PTC وطلب التخفيض
  let tenderInfo = {};         // العنوان → { owner, submitDate } من بيانات المناقصة
  let libLinks = {};           // deptKey → رابط مكتبة SharePoint
  let SB = null;               // عميل Supabase (تخزين مشترك)
  let useRemote = false;       // true عند وجود جلسة دخول → تخزين مشترك بدل المحلي
  let tenderTypes = {};         // عنوان المناقصة → النوع (Design & Build / Remeasured)
  const SP_PREFIX = "alrawafSPDeptLink_";
  const SP_ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M8 13h8M8 16h5"/></svg>';

  // ── أدوات ───────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const uid = () => "T" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const deptName = (k) => (departments.find((d) => d.key === k) || {}).name || k;
  const typeMeta = (k) => TYPES.find((t) => t.key === k) || TYPES[3];
  function fmtDate(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} · ${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  // ── أدوات التواريخ والمواعيد ────────────────────────────────
  const startOfDay = (x) => { const d = new Date(x); d.setHours(0, 0, 0, 0); return d; };
  const dayDiff = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / 86400000);
  function todayPlus(days) { const d = new Date(); d.setDate(d.getDate() + (days || 0)); const p = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
  const finishTime = (t) => t.reviewedAt || t.completedAt || t.approvedAt || null;
  function dueInfo(t) {
    // لم تبدأ بعد (بداية مستقبلية)
    if (t.startDate && t.status === "in-progress") {
      const toStart = dayDiff(new Date(), startOfDay(t.startDate));
      if (toStart > 0) return { label: `مجدولة — تبدأ بعد ${toStart} يوم`, cls: "sched" };
    }
    if (!t.dueDate) return null;
    const due = startOfDay(t.dueDate);
    if (t.status === "in-progress") {
      const rem = dayDiff(new Date(), due);
      if (rem < 0) return { label: `متأخرة ${Math.abs(rem)} يوم`, cls: "overdue" };
      if (rem === 0) return { label: "تستحق اليوم", cls: "soon" };
      if (rem <= 3) return { label: `متبقٍ ${rem} أيام`, cls: "soon" };
      return { label: `متبقٍ ${rem} يوم`, cls: "ok" };
    }
    const fin = finishTime(t);
    if (!fin) return { label: `الموعد ${t.dueDate}`, cls: "ok" };
    const late = dayDiff(due, fin);
    if (late > 0) return { label: `أُنجزت متأخرة ${late} يوم`, cls: "overdue" };
    return { label: "أُنجزت في الوقت", cls: "done-ok" };
  }

  function loadTasksLocal() { try { tasks = JSON.parse(localStorage.getItem(LS_TASKS)) || []; } catch { tasks = []; } }
  function saveTasksLocal() { try { localStorage.setItem(LS_TASKS, JSON.stringify(tasks)); } catch {} }
  function saveTasks() { saveTasksLocal(); sbSet("tasks", tasks); }
  async function loadTasksRemote() {
    const r = await sbGet("tasks", null);
    if (r != null) { tasks = r; saveTasksLocal(); }
    else if (useRemote && tasks.length) sbSet("tasks", tasks); // ترحيل المحلي للمشترك أول مرة
  }
  function loadTenderTypesLocal() { try { tenderTypes = JSON.parse(localStorage.getItem("alrawafTenderTypes")) || {}; } catch { tenderTypes = {}; } }
  async function loadTenderTypesRemote() {
    const r = await sbGet("tender_types", null);
    if (r) { tenderTypes = r; try { localStorage.setItem("alrawafTenderTypes", JSON.stringify(r)); } catch {} }
    else if (useRemote && Object.keys(tenderTypes).length) sbSet("tender_types", tenderTypes);
  }

  // ── الهوية والأدوار ─────────────────────────────────────────
  // مبدّل الدور أداة اختبار → يظهر فقط على مضيف المعاينة (claude-).
  // على الإنتاج: الهوية تُشتق حصراً من جلسة الدخول الحقيقية.
  const ALLOW_SWITCHER = (() => { try { return location.hostname.startsWith("claude-"); } catch { return false; } })();
  function readSession() {
    let role = "", dept = "", name = "", email = "";
    try {
      role  = sessionStorage.getItem("alrawafPortalRole") || "";
      dept  = sessionStorage.getItem("alrawafDepartmentKey") || "";
      name  = (sessionStorage.getItem("alrawafUserName") || "").trim();
      email = (sessionStorage.getItem("alrawafUserEmail") || "").trim().toLowerCase();
    } catch {}
    return { role, dept, name, email };
  }
  function deriveIdentity(s) {
    // مدير الإدارة (تنفيذي) — يرى كل الأقسام ويعتمد نهائياً
    if (s.role === "manager" || s.role === "vp" || !s.role) {
      return { role: "admin", deptKey: "", name: s.name || "مدير الإدارة" };
    }
    // أي مستخدم قسم → مدير قسمه (يُنشئ/يسند/ينقل داخل قسمه فقط)
    return { role: "manager", deptKey: s.dept || "", name: s.name || "مدير القسم" };
  }
  function loadIdentity() {
    const sessionIdent = deriveIdentity(readSession());
    if (ALLOW_SWITCHER) {
      // المعاينة: نسمح بحفظ اختيار المبدّل بين الجلسات
      try { const saved = JSON.parse(localStorage.getItem(LS_IDENT)); if (saved && saved.role) { identity = saved; return; } } catch {}
    }
    identity = sessionIdent; // الإنتاج: من الجلسة حصراً
  }
  function saveIdentity() { if (ALLOW_SWITCHER) { try { localStorage.setItem(LS_IDENT, JSON.stringify(identity)); } catch {} } }

  const isAdmin   = () => identity.role === "admin";
  const isManager = () => identity.role === "manager";
  const isLeader  = () => identity.role === "leader";
  const myDept    = () => identity.deptKey;
  const isMine    = (t) => !!normName(identity.name) && normName(t.createdBy) === normName(identity.name);

  // التعيين: مدير الإدارة، ومدير القسم، وقادة الفِرق في القسم
  const canCreate   = () => isAdmin() || isManager() || isLeader();
  // تعليم الإنجاز: مدير الإدارة، أو مدير/قائد فريق القسم، أو مُنشئ المهمة نفسه
  const canComplete = (t) => isAdmin() || ((isManager() || isLeader()) && t.deptKey === myDept()) || isMine(t); // in-progress → review
  const canReview   = (t) => isAdmin() || (isManager() && t.deptKey === myDept());           // review → completed / back
  const canApprove  = (t) => isAdmin();                                                       // completed → approved
  const canEditDue  = (t) => isAdmin() || ((isManager() || isLeader()) && t.deptKey === myDept()) || isMine(t);
  // تصدير تقارير Excel: مدير الإدارة أو مالك الموقع فقط
  const OWNER_EMAILS = ["edwardehab0@gmail.com"];
  function sessionEmail() { try { return (sessionStorage.getItem("alrawafUserEmail") || "").trim().toLowerCase(); } catch { return ""; } }
  const canExport = () => isAdmin() || OWNER_EMAILS.includes(sessionEmail());

  // اشتقاق الدور من لقب الموظف في الهيكل (الإنتاج فقط؛ على المعاينة يحدده المبدّل)
  function refineRole() {
    if (ALLOW_SWITCHER || isAdmin()) return;
    const dept = departments.find((d) => d.key === identity.deptKey);
    if (!dept) return;
    const emp = (dept.employees || []).find((e) => normName(e.name) === normName(identity.name));
    const title = emp ? String(emp.title || "") : "";
    if (/قائد فريق/.test(title)) identity.role = "leader";
    else if (/مدير قسم|مدير وحدة/.test(title)) identity.role = "manager";
    else if (title) identity.role = "engineer";
    // إن لم يُطابَق الاسم: يبقى الدور الافتراضي (مدير قسم)
  }

  function visibleTasks() {
    let list = tasks.slice();
    if (isAdmin()) {
      if (deptFilter !== "all") list = list.filter((t) => t.deptKey === deptFilter);
    } else {
      list = list.filter((t) => t.deptKey === myDept());
      if (identity.role === "engineer") list = list.filter((t) => (t.assignees || []).includes(identity.name));
    }
    return list;
  }

  // ── الإشعارات (حسب هوية المستخدم) ───────────────────────────
  const normName = (s) => String(s || "").replace(/\s+/g, " ").trim();
  function myNotifs() {
    const me = normName(identity.name);
    const out = [];
    tasks.forEach((t) => {
      const assignedToMe = me && (t.assignees || []).some((n) => normName(n) === me);
      // الموظف المُسنَد إليه: مهمة جديدة قيد العمل
      if (assignedToMe && t.status === "in-progress")
        out.push({ id: t.id, kind: "assigned", title: t.title, dept: deptName(t.deptKey), text: "مهمة جديدة أُسندت إليك" });
      // مدير القسم: مهمة في قسمه بانتظار مراجعته
      if (isManager() && t.deptKey === myDept() && t.status === "review")
        out.push({ id: t.id, kind: "review", title: t.title, dept: deptName(t.deptKey), text: "أنجزها الفريق — بانتظار مراجعتك" });
      // مدير الإدارة: مهمة مكتملة بانتظار اعتماده النهائي
      if (isAdmin() && t.status === "completed")
        out.push({ id: t.id, kind: "approve", title: t.title, dept: deptName(t.deptKey), text: "مكتملة — بانتظار اعتمادك النهائي" });
    });
    return out.concat(dbNotifs());
  }
  // إشعارات مناقصات Design & Build لقسم الدراسات والتصاميم (مصدر مشترك من صفحة المناقصات)
  function dbNotifs() {
    if (myDept() !== "DESIGN") return [];
    let dismissed = {};
    try { dismissed = JSON.parse(localStorage.getItem("alrawafDBDismissed")) || {}; } catch {}
    const out = [];
    Object.keys(tenderTypes).forEach((title) => {
      if (tenderTypes[title] === "design-build" && !dismissed[title])
        out.push({ id: "db:" + title, kind: "designbuild", title, dept: deptName("DESIGN"), text: "مناقصة Design & Build جديدة" });
    });
    return out;
  }
  function dismissDB(title) {
    let d = {}; try { d = JSON.parse(localStorage.getItem("alrawafDBDismissed")) || {}; } catch {}
    d[title] = true;
    try { localStorage.setItem("alrawafDBDismissed", JSON.stringify(d)); } catch {}
  }

  // ── تحميل البيانات ──────────────────────────────────────────
  async function loadDepartments() {
    try {
      const r = await fetch("./employees.json", { cache: "no-store" });
      const j = await r.json();
      departments = (j.departments || []).map((d) => ({
        key: d.key, name: d.name || d.key,
        employees: (d.employees || []).map((e) => (typeof e === "string" ? { name: e, title: "" } : e))
      }));
    } catch { departments = []; }
  }
  function extractTitles(rows, opts) {
    opts = opts || {};
    const keys = ["اسم المناقصة", "Tender Title", "tender_title", "title", "name"];
    const set = new Set();
    (rows || []).forEach((row) => {
      if (!row || typeof row !== "object") return;
      // نفس قائمة المناقصات الجارية في صفحة المناقصات: كل ما ليست حالته "تم التقديم"
      if (opts.onlyJariya) {
        const st = String(row["الحالة"] || row["status"] || "جارية").trim();
        if (st === "تم التقديم") return;
      }
      const title = keys.map((k) => row[k]).find((v) => v && String(v).trim());
      if (!title) return;
      const t = String(title).trim();
      set.add(t);
      if (!tenderInfo[t]) tenderInfo[t] = { owner: row["المالك"] || "", submitDate: row["تاريخ التقديم"] || "" };
    });
    return Array.from(set);
  }
  async function loadTenders() {
    try {
      // نفس ملف صفحة المناقصات بالضبط (tenders/data.json) لضمان تطابق القائمة
      const r = await fetch("../tenders/data.json", { cache: "no-store" });
      const j = await r.json();
      tenderInfo = {};
      activeTenders = extractTitles(j.tenders, { onlyJariya: true });  // الجارية فقط (دون ما تم تقديمه)
      submittedTenders = extractTitles(j.submitted);                   // المقدَّمة
    } catch { activeTenders = []; submittedTenders = []; }
  }
  function sourceTitles(type) {
    const tm = typeMeta(type);
    if (tm.src === "active") return activeTenders;
    if (tm.src === "submitted") return submittedTenders;
    return [];
  }

  // ── طبقة Supabase (تخزين مشترك عبر جدول ops_state) ──────────
  function initSB() {
    try {
      const cfg = window.APP_CONFIG || {};
      const ok = cfg.supabaseUrl && cfg.supabaseKey &&
        !String(cfg.supabaseUrl).includes("__") && !String(cfg.supabaseKey).includes("__") && window.supabase;
      if (!ok) return null;
      return window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: true, autoRefreshToken: true } });
    } catch { return null; }
  }
  // نفعّل المشترك فقط عند وجود جلسة دخول حقيقية (الإنتاج)
  async function initRemote() {
    if (!SB) return;
    try { const { data } = await SB.auth.getSession(); useRemote = !!(data && data.session); } catch { useRemote = false; }
  }
  // قراءة قيمة JSON من ops_state؛ عند أي خطأ (كعدم وجود الجدول) نرجع للمحلي بأمان
  async function sbGet(key, fb) {
    if (!useRemote) return fb;
    try {
      const { data, error } = await SB.from("ops_state").select("v").eq("k", key).maybeSingle();
      if (error) throw error;
      return data ? data.v : fb;
    } catch { useRemote = false; return fb; }
  }
  function sbSet(key, value) {
    if (!useRemote) return;
    try { SB.from("ops_state").upsert({ k: key, v: value, updated_at: new Date().toISOString() }, { onConflict: "k" }).then(() => {}, () => {}); } catch {}
  }
  function loadLibLinksLocal() {
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith(SP_PREFIX)) { const v = localStorage.getItem(k); if (v) libLinks[k.slice(SP_PREFIX.length)] = v; }
      });
    } catch {}
  }
  async function loadLibLinks() {
    loadLibLinksLocal();
    if (!SB) return;
    try {
      const { data } = await SB.from("dept_library_links").select("dept_key,url");
      (data || []).forEach((r) => { if (r.url) libLinks[r.dept_key] = r.url; });
    } catch {}
  }
  function saveLibLink(deptKey, url) {
    const cleaned = String(url || "").trim();
    if (cleaned) libLinks[deptKey] = cleaned; else delete libLinks[deptKey];
    try { if (cleaned) localStorage.setItem(SP_PREFIX + deptKey, cleaned); else localStorage.removeItem(SP_PREFIX + deptKey); } catch {}
    if (SB) {
      if (cleaned) SB.from("dept_library_links").upsert({ dept_key: deptKey, url: cleaned }, { onConflict: "dept_key" }).then(() => {}, () => {});
      else SB.from("dept_library_links").delete().eq("dept_key", deptKey).then(() => {}, () => {});
    }
  }
  function renderLibrary() {
    const host = $("tb-library");
    if (!host) return;
    let keys;
    if (isAdmin()) keys = (deptFilter !== "all") ? [deptFilter] : departments.map((d) => d.key);
    else keys = myDept() ? [myDept()] : [];
    if (!keys.length) { host.innerHTML = ""; return; }
    host.innerHTML = keys.map((k) => {
      const url = libLinks[k] || "";
      const nm = deptName(k);
      const edit = isAdmin() ? `<button class="tb-lib-edit" data-edit="${esc(k)}" type="button">تعديل</button>` : "";
      if (url) {
        return `<div class="tb-lib-card has-link">
          <a class="tb-lib-main" href="${esc(url)}" target="_blank" rel="noopener">
            <span class="tb-lib-ico">${SP_ICON}</span>
            <span class="tb-lib-txt"><b>مكتبة ${esc(nm)}</b><span>ملفات القسم على SharePoint — اضغط للوصول</span></span>
            <span class="tb-lib-go">↗</span>
          </a>${edit}</div>`;
      }
      const main = isAdmin()
        ? `<button class="tb-lib-main unset" data-edit="${esc(k)}" type="button"><span class="tb-lib-ico">${SP_ICON}</span><span class="tb-lib-txt"><b>مكتبة ${esc(nm)}</b><span>لم يُضبط الرابط — اضغط للإعداد</span></span></button>`
        : `<div class="tb-lib-main unset"><span class="tb-lib-ico">${SP_ICON}</span><span class="tb-lib-txt"><b>مكتبة ${esc(nm)}</b><span>لم يُضبط رابط المكتبة بعد</span></span></div>`;
      return `<div class="tb-lib-card">${main}</div>`;
    }).join("");
  }

  // ── رأس اللوحة (الهوية + الفلتر + زر الإنشاء + الجرس) ────────
  function renderHead() {
    const roleLabel = ({ admin: "مدير الإدارة", manager: "مدير قسم", leader: "قائد فريق", engineer: "مهندس" })[identity.role] || "";
    const idSel = $("tb-role-select");
    if (ALLOW_SWITCHER) {
      // مبدّل الدور التجريبي — على المعاينة فقط
      if (idSel && !idSel.dataset.built) {
        let html = `<optgroup label="الإدارة"><option value="admin::">مدير الإدارة</option></optgroup>`;
        const grp = (role, label) => `<optgroup label="${esc(label)}">` +
          departments.map((d) => `<option value="${role}::${esc(d.key)}">${esc(d.name)}</option>`).join("") + `</optgroup>`;
        html += grp("manager", "مدير قسم");
        html += grp("leader", "قائد فريق");
        html += grp("engineer", "مهندس");
        idSel.innerHTML = html;
        idSel.dataset.built = "1";
        idSel.addEventListener("change", () => {
          const [role, deptKey] = idSel.value.split("::");
          const label = idSel.options[idSel.selectedIndex].textContent;
          identity = { role, deptKey: deptKey || "", name: label };
          saveIdentity(); deptFilter = "all"; renderAll();
        });
      }
      if (idSel) idSel.value = `${identity.role}::${identity.deptKey || ""}`;
    } else if (idSel) {
      // الإنتاج: لا مبدّل — نعرض هوية المستخدم الحقيقية كنص ثابت
      idSel.style.display = "none";
      const wrap = idSel.parentElement;
      if (wrap) wrap.title = (identity.name || "") + " — " + roleLabel + (identity.deptKey ? " · " + deptName(identity.deptKey) : "");
    }
    const badge = $("tb-id-badge");
    if (badge) {
      badge.textContent = ALLOW_SWITCHER ? roleLabel
        : roleLabel + (identity.deptKey ? " · " + deptName(identity.deptKey) : "");
    }

    // فلتر القسم (لمدير الإدارة فقط)
    const df = $("tb-deptfilter");
    if (df) {
      df.hidden = !isAdmin();
      if (isAdmin() && !df.dataset.built) {
        df.innerHTML = `<option value="all">كل الأقسام</option>` + departments.map((d) => `<option value="${esc(d.key)}">${esc(d.name)}</option>`).join("");
        df.dataset.built = "1";
        df.addEventListener("change", () => { deptFilter = df.value; renderAll(); });
      }
      df.value = deptFilter;
    }

    // زر الإنشاء
    const nb = $("tb-new-task");
    if (nb) nb.hidden = !canCreate();

    // جرس الإشعارات — لكل دور حسب هويته
    const bell = $("tb-bell");
    if (bell) {
      bell.hidden = false;
      const n = myNotifs().length;
      const cnt = $("tb-bell-count");
      if (cnt) { cnt.textContent = n; cnt.hidden = n === 0; }
      bell.classList.toggle("has-notif", n > 0);
    }
  }

  // ── المؤشرات ────────────────────────────────────────────────
  function renderKpis() {
    const list = visibleTasks();
    const by = (s) => list.filter((t) => t.status === s).length;
    const kpis = [
      { n: list.length, l: "إجمالي المهام" },
      { n: by("in-progress"), l: "قيد العمل" },
      { n: by("review"), l: "قيد المراجعة" },
      { n: by("completed"), l: "بانتظار الاعتماد" },
      { n: by("approved"), l: "معتمدة" }
    ];
    $("tb-kpis").innerHTML = kpis.map((k) => `<div class="tb-kpi"><b>${k.n}</b><span>${esc(k.l)}</span></div>`).join("");
  }

  // ── اللوحة ──────────────────────────────────────────────────
  function cardActions(t) {
    if (t.status === "in-progress") {
      return canComplete(t) ? `<div class="tb-actions"><button class="tb-btn primary" data-act="complete" data-id="${t.id}">تم الإنجاز ✓</button></div>` : "";
    }
    if (t.status === "review") {
      if (canReview(t)) return `<div class="tb-actions">
        <button class="tb-btn gold" data-act="approve-review" data-id="${t.id}">اعتماد الإنجاز</button>
        <button class="tb-btn ghost" data-act="reject" data-id="${t.id}">إرجاع</button></div>`;
      return `<div class="tb-waiting">بانتظار مراجعة مدير القسم</div>`;
    }
    if (t.status === "completed") {
      if (canApprove(t)) return `<div class="tb-actions"><button class="tb-btn primary" data-act="final" data-id="${t.id}">اعتماد نهائي</button></div>`;
      return `<div class="tb-waiting">بانتظار اعتماد مدير الإدارة</div>`;
    }
    return `<div class="tb-approved-tag">✓ معتمدة نهائياً</div>`;
  }

  function dueRow(t) {
    const di = dueInfo(t);
    const badge = di ? `<span class="tb-due-badge ${di.cls}">${esc(di.label)}</span>` : "";
    if (canEditDue(t) && t.status !== "approved") {
      return `<div class="tb-due">
        <span class="tb-due-pair"><label>البداية</label><input type="date" class="tb-due-input" data-id="${t.id}" data-field="startDate" value="${esc(t.startDate || "")}"></span>
        <span class="tb-due-pair"><label>النهاية</label><input type="date" class="tb-due-input" data-id="${t.id}" data-field="dueDate" value="${esc(t.dueDate || "")}"></span>
        ${badge}
      </div>`;
    }
    return `<div class="tb-due">
      <span class="tb-due-date">البداية: <b>${t.startDate ? esc(t.startDate) : "—"}</b> · النهاية: <b>${t.dueDate ? esc(t.dueDate) : "—"}</b></span>${badge}
    </div>`;
  }

  function cardHTML(t) {
    const tm = typeMeta(t.type);
    const assignees = (t.assignees || []).map((n) => `<span class="tb-chip">${esc(n)}</span>`).join("") || `<span class="tb-chip" style="color:#c0392b;background:#fbeae8;border-color:#f1cfc9">غير مسند</span>`;
    return `<div class="tb-card" data-id="${t.id}">
      <div class="tb-card-top">
        <span class="tb-type ${tm.cls}">${esc(tm.label)}</span>
        <span class="tb-dept">${esc(deptName(t.deptKey))}</span>
      </div>
      <div class="tb-card-title">${esc(t.title)}</div>
      ${(t.owner || t.submitDate) ? `<div class="tb-tinfo">
        ${t.owner ? `<span class="tb-tinfo-row"><i>المالك</i> ${esc(t.owner)}</span>` : ""}
        ${t.submitDate ? `<span class="tb-tinfo-row"><i>تاريخ التقديم</i> ${esc(t.submitDate)}</span>` : ""}
      </div>` : ""}
      <div class="tb-meta">
        <div class="tb-assignees">${assignees}</div>
        <div class="tb-date">أُسندت: <b>${fmtDate(t.assignedAt)}</b></div>
      </div>
      ${dueRow(t)}
      ${cardActions(t)}
    </div>`;
  }

  function renderBoard() {
    const list = visibleTasks();
    $("tb-board").innerHTML = COLUMNS.map((col) => {
      const items = list.filter((t) => t.status === col.key);
      const body = items.length ? items.map(cardHTML).join("") : `<div class="tb-empty">لا مهام</div>`;
      return `<section class="tb-col" data-col="${col.key}">
        <div class="tb-col-head">
          <span class="tb-col-name"><span class="tb-col-dot"></span>${esc(col.name)}</span>
          <span class="tb-col-count">${items.length}</span>
        </div>
        <div class="tb-col-body">${body}</div>
      </section>`;
    }).join("");
  }

  // ── مؤشرات أداء الموظفين (KPI) ──────────────────────────────
  function employeeKpis(list) {
    const map = {};
    list.forEach((t) => {
      (t.assignees || []).forEach((name) => {
        const key = normName(name);
        const s = map[key] || (map[key] = { name, deptKey: t.deptKey, total: 0, open: 0, done: 0, onTime: 0, late: 0, overdueOpen: 0 });
        s.total++;
        if (t.status === "in-progress") {
          s.open++;
          if (t.dueDate && dayDiff(new Date(), startOfDay(t.dueDate)) < 0) s.overdueOpen++;
        } else {
          s.done++;
          const fin = finishTime(t);
          if (t.dueDate && fin) { if (dayDiff(startOfDay(t.dueDate), fin) > 0) s.late++; else s.onTime++; }
          else s.onTime++;
        }
      });
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
  }
  function renderKpiView() {
    const host = $("tb-kpiview");
    if (!host) return;
    const list = visibleTasks();
    const rows = employeeKpis(list);
    const showDept = isAdmin() && deptFilter === "all";
    const tot = rows.reduce((a, r) => a + r.total, 0);
    const done = rows.reduce((a, r) => a + r.done, 0);
    const onT = rows.reduce((a, r) => a + r.onTime, 0);
    const lt = rows.reduce((a, r) => a + r.late, 0);
    const commit = (onT + lt) ? Math.round(onT / (onT + lt) * 100) : null;
    let html = `<div class="tb-kpi-bar-head">
      <div class="tb-kpi-summary">
        <div class="tb-kpi-s"><b>${rows.length}</b><span>موظف</span></div>
        <div class="tb-kpi-s"><b>${tot}</b><span>إجمالي المهام</span></div>
        <div class="tb-kpi-s"><b>${done}</b><span>منجزة</span></div>
        <div class="tb-kpi-s"><b>${commit == null ? "—" : commit + "%"}</b><span>الالتزام بالمواعيد</span></div>
      </div>
      ${canExport() ? `<button type="button" class="tb-export" id="tb-export" title="تصدير المؤشرات إلى Excel">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
        تصدير Excel
      </button>` : ""}
    </div>`;
    if (!rows.length) { host.innerHTML = html + `<div class="tb-empty">لا مهام مُسندة بعد</div>`; return; }
    // كروت الموظفين
    html += `<div class="tb-emp-grid">` + rows.map((r) => {
      const fin = r.onTime + r.late;
      const pct = fin ? Math.round(r.onTime / fin * 100) : null;
      const cls = pct == null ? "" : pct >= 80 ? "good" : pct >= 50 ? "mid" : "bad";
      const initials = esc(normName(r.name).split(" ").slice(0, 2).map((w) => w[0] || "").join(""));
      return `<div class="tb-emp-card" data-emp="${esc(normName(r.name))}" role="button" tabindex="0">
        <div class="tb-emp-top">
          <span class="tb-emp-avatar">${initials}</span>
          <div class="tb-emp-id">
            <b>${esc(r.name)}</b>
            ${showDept ? `<span>${esc(deptName(r.deptKey))}</span>` : ""}
          </div>
          ${r.overdueOpen ? `<span class="tb-emp-alert">${r.overdueOpen} متأخرة</span>` : ""}
        </div>
        <div class="tb-emp-stats">
          <div class="tb-emp-stat"><b>${r.total}</b><span>المهام</span></div>
          <div class="tb-emp-stat"><b>${r.open}</b><span>قيد العمل</span></div>
          <div class="tb-emp-stat"><b>${r.done}</b><span>منجزة</span></div>
        </div>
        <div class="tb-emp-commit">
          ${pct == null ? `<span class="tb-kpi-na">لا مهام منجزة بموعد بعد</span>`
            : `<div class="tb-kpi-bar"><div class="tb-kpi-bar-fill ${cls}" style="width:${pct}%"></div><span>التزام ${pct}%</span></div>`}
        </div>
        <div class="tb-emp-more">اضغط لعرض التفاصيل</div>
      </div>`;
    }).join("") + `</div>`;
    host.innerHTML = html;
  }

  // ── ملف الموظف التفصيلي ─────────────────────────────────────
  function empTasks(name) {
    const key = normName(name);
    return visibleTasks().filter((t) => (t.assignees || []).some((n) => normName(n) === key));
  }
  function openEmpProfile(name) {
    const listAll = empTasks(name);
    const r = employeeKpis(listAll)[0] || { name, total: 0, open: 0, done: 0, onTime: 0, late: 0, overdueOpen: 0, deptKey: "" };
    const fin = r.onTime + r.late;
    const pct = fin ? Math.round(r.onTime / fin * 100) : null;
    const cls = pct == null ? "" : pct >= 80 ? "good" : pct >= 50 ? "mid" : "bad";
    const stat = (n, l, extra) => `<div class="tb-ep-stat ${extra || ""}"><b>${n}</b><span>${esc(l)}</span></div>`;
    const statusName = (s) => (COLUMNS.find((c) => c.key === s) || {}).name || s;
    const taskRow = (t) => {
      const di = dueInfo(t);
      return `<div class="tb-ep-task" data-goto="${t.id}">
        <div class="tb-ep-task-main">
          <b>${esc(t.title)}</b>
          <span>${esc(typeMeta(t.type).label)} · ${esc(statusName(t.status))}${t.startDate ? " · من " + esc(t.startDate) : ""}${t.dueDate ? " إلى " + esc(t.dueDate) : ""}</span>
        </div>
        ${di ? `<span class="tb-due-badge ${di.cls}">${esc(di.label)}</span>` : ""}
      </div>`;
    };
    const open = listAll.filter((t) => t.status === "in-progress");
    const doneL = listAll.filter((t) => t.status !== "in-progress");
    let p = $("tb-emp-overlay");
    if (!p) {
      p = document.createElement("div");
      p.id = "tb-emp-overlay"; p.className = "tb-overlay";
      document.body.appendChild(p);
      p.addEventListener("click", (e) => {
        if (e.target.id === "tb-emp-overlay" || e.target.closest(".tb-ep-close")) { p.hidden = true; return; }
        const row = e.target.closest("[data-goto]");
        if (row) {
          p.hidden = true; currentView = "board"; renderAll();
          const card = document.querySelector(`.tb-card[data-id="${row.dataset.goto}"]`);
          if (card) { card.scrollIntoView({ behavior: "smooth", block: "center" }); card.classList.add("tb-flash"); setTimeout(() => card.classList.remove("tb-flash"), 1600); }
        }
      });
    }
    p.innerHTML = `<div class="tb-modal tb-ep">
      <div class="tb-modal-head">
        <h3>${esc(r.name)}${r.deptKey ? ` <small>${esc(deptName(r.deptKey))}</small>` : ""}</h3>
        <button class="tb-ep-close" type="button">✕</button>
      </div>
      <div class="tb-modal-body">
        <div class="tb-ep-stats">
          ${stat(r.total, "إجمالي المهام")}
          ${stat(r.open, "قيد العمل")}
          ${stat(r.done, "منجزة")}
          ${stat(r.onTime, "في الوقت", "ok")}
          ${stat(r.late, "منجزة متأخرة", r.late ? "bad" : "")}
          ${stat(r.overdueOpen, "متأخرة حالياً", r.overdueOpen ? "bad" : "")}
        </div>
        <div class="tb-ep-commit">
          ${pct == null ? `<span class="tb-kpi-na">لا مهام منجزة بموعد محدد بعد</span>`
            : `<div class="tb-kpi-bar big"><div class="tb-kpi-bar-fill ${cls}" style="width:${pct}%"></div><span>الالتزام بالمواعيد ${pct}%</span></div>`}
        </div>
        ${open.length ? `<div class="tb-ep-sec">قيد العمل (${open.length})</div>` + open.map(taskRow).join("") : ""}
        ${doneL.length ? `<div class="tb-ep-sec">المنجزة (${doneL.length})</div>` + doneL.map(taskRow).join("") : ""}
        ${!listAll.length ? `<div class="tb-empty">لا مهام لهذا الموظف</div>` : ""}
      </div>
    </div>`;
    p.hidden = false;
  }

  // ── تصدير المؤشرات إلى Excel ────────────────────────────────
  function exportKpiExcel() {
    if (!canExport()) return;
    if (typeof XLSX === "undefined") { toast("مكتبة Excel لم تُحمّل بعد — أعد المحاولة بعد لحظات"); return; }
    const list = visibleTasks();
    const rows = employeeKpis(list);
    const statusName = (s) => (COLUMNS.find((c) => c.key === s) || {}).name || s;
    const typeName = (k) => typeMeta(k).label;
    const scope = isAdmin() ? (deptFilter === "all" ? "كل الأقسام" : deptName(deptFilter)) : deptName(myDept());
    const stamp = todayPlus(0);

    // ورقة 1: ملخص عام
    const tot = rows.reduce((a, r) => a + r.total, 0);
    const done = rows.reduce((a, r) => a + r.done, 0);
    const onT = rows.reduce((a, r) => a + r.onTime, 0);
    const lt = rows.reduce((a, r) => a + r.late, 0);
    const overdue = rows.reduce((a, r) => a + r.overdueOpen, 0);
    const commit = (onT + lt) ? Math.round(onT / (onT + lt) * 100) : 0;
    const wsSummary = XLSX.utils.aoa_to_sheet([
      ["تقرير مؤشرات أداء العمليات"],
      ["النطاق", scope],
      ["تاريخ التقرير", stamp],
      [],
      ["عدد الموظفين", rows.length],
      ["إجمالي المهام", tot],
      ["المنجزة", done],
      ["قيد العمل", tot - done],
      ["في الوقت", onT],
      ["منجزة متأخرة", lt],
      ["متأخرة حالياً", overdue],
      ["نسبة الالتزام بالمواعيد", commit + "%"]
    ]);
    wsSummary["!cols"] = [{ wch: 24 }, { wch: 22 }];

    // ورقة 2: مؤشرات الموظفين
    const empHeader = ["#", "الموظف", "القسم", "إجمالي", "قيد العمل", "منجزة", "في الوقت", "متأخرة", "متأخرة حالياً", "الالتزام %"];
    const empRows = rows.map((r, i) => {
      const fin = r.onTime + r.late;
      const pct = fin ? Math.round(r.onTime / fin * 100) : "";
      return [i + 1, r.name, deptName(r.deptKey), r.total, r.open, r.done, r.onTime, r.late, r.overdueOpen, pct === "" ? "—" : pct];
    });
    const wsEmp = XLSX.utils.aoa_to_sheet([empHeader, ...empRows]);
    wsEmp["!cols"] = [{ wch: 5 }, { wch: 26 }, { wch: 24 }, { wch: 8 }, { wch: 9 }, { wch: 8 }, { wch: 9 }, { wch: 9 }, { wch: 12 }, { wch: 10 }];

    // ورقة 3: تفاصيل المهام
    const tHeader = ["#", "المهمة", "النوع", "القسم", "المُسنَد إليه", "الحالة", "تاريخ البداية", "الموعد النهائي", "تاريخ الإنجاز", "الالتزام"];
    const tRows = list.map((t, i) => {
      const fin = finishTime(t);
      const finStr = fin ? fin.slice(0, 10) : "";
      let commitStr = "";
      if (t.status === "in-progress") commitStr = (t.dueDate && dayDiff(new Date(), startOfDay(t.dueDate)) < 0) ? "متأخرة حالياً" : "قيد العمل";
      else if (t.dueDate && fin) commitStr = dayDiff(startOfDay(t.dueDate), fin) > 0 ? "متأخرة" : "في الوقت";
      else commitStr = "—";
      return [i + 1, t.title, typeName(t.type), deptName(t.deptKey), (t.assignees || []).join("، "), statusName(t.status), t.startDate || "", t.dueDate || "", finStr, commitStr];
    });
    const wsTasks = XLSX.utils.aoa_to_sheet([tHeader, ...tRows]);
    wsTasks["!cols"] = [{ wch: 5 }, { wch: 40 }, { wch: 14 }, { wch: 24 }, { wch: 28 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }, { wch: 13 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsSummary, "ملخص");
    XLSX.utils.book_append_sheet(wb, wsEmp, "مؤشرات الموظفين");
    XLSX.utils.book_append_sheet(wb, wsTasks, "تفاصيل المهام");
    XLSX.writeFile(wb, `مؤشرات_العمليات_${scope}_${stamp}.xlsx`);
    toast("تم تصدير تقرير Excel");
  }

  let currentView = "board";
  function renderAll() {
    renderHead(); renderLibrary(); renderKpis();
    const boardEl = $("tb-board"), kpiEl = $("tb-kpiview");
    if (currentView === "kpi") {
      if (boardEl) boardEl.style.display = "none";
      if (kpiEl) { kpiEl.hidden = false; renderKpiView(); }
    } else {
      if (kpiEl) kpiEl.hidden = true;
      if (boardEl) boardEl.style.display = "";
      renderBoard();
    }
    const vt = $("tb-viewtoggle");
    if (vt) vt.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.view === currentView));
  }

  // ── الحركات (سير العمل) ─────────────────────────────────────
  function logHist(t, action) {
    t.history = t.history || [];
    t.history.push({ at: new Date().toISOString(), by: identity.name, role: identity.role, action });
  }
  function moveTask(id, act) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const now = new Date().toISOString();
    if (act === "complete" && t.status === "in-progress" && canComplete(t)) {
      t.status = "review"; t.reviewedAt = now; logHist(t, "أنجز الفريق المهمة");
      toast("تم رفع المهمة لمراجعة مدير القسم");
    } else if (act === "approve-review" && t.status === "review" && canReview(t)) {
      t.status = "completed"; t.completedAt = now; logHist(t, "اعتمد مدير القسم الإنجاز");
      toast("اكتملت المهمة — أُشعِر مدير الإدارة للاعتماد");
    } else if (act === "reject" && t.status === "review" && canReview(t)) {
      t.status = "in-progress"; logHist(t, "أرجعها مدير القسم للعمل");
      toast("أُرجعت المهمة إلى قيد العمل");
    } else if (act === "final" && t.status === "completed" && canApprove(t)) {
      t.status = "approved"; t.approvedAt = now; logHist(t, "اعتماد نهائي من مدير الإدارة");
      toast("تم الاعتماد النهائي للمهمة");
    } else { return; }
    saveTasks(); renderAll();
  }

  // ── نافذة الإنشاء ───────────────────────────────────────────
  let modalState = { type: "tender", assignees: [] };
  function openModal() {
    if (!canCreate()) return;
    modalState = { type: "tender", assignees: [] };
    const dept = isAdmin() ? (deptFilter !== "all" ? deptFilter : (departments[0] && departments[0].key)) : myDept();
    buildModal(dept);
    $("tb-overlay").hidden = false;
  }
  function closeModal() { $("tb-overlay").hidden = true; }

  function buildModal(deptKey) {
    const deptPicker = isAdmin()
      ? `<div class="tb-field"><label>القسم</label><select id="tb-m-dept">${departments.map((d) => `<option value="${esc(d.key)}"${d.key === deptKey ? " selected" : ""}>${esc(d.name)}</option>`).join("")}</select></div>`
      : `<input type="hidden" id="tb-m-dept" value="${esc(deptKey)}">`;

    $("tb-modal-mount").innerHTML = `
      <div class="tb-field">
        <label>نوع المهمة</label>
        <div class="tb-types" id="tb-m-types">
          ${TYPES.map((t) => `<label class="tb-type-opt${t.key === "tender" ? " sel" : ""}" data-type="${t.key}"><span class="d" style="background:${t.dot}"></span>${esc(t.label)}</label>`).join("")}
        </div>
      </div>
      ${deptPicker}
      <div class="tb-field" id="tb-m-title-wrap"></div>
      <div class="tb-field tb-field-dates">
        <span><label>تاريخ بداية المهمة</label><input type="date" id="tb-m-start" value="${todayPlus(0)}"></span>
        <span><label>الموعد النهائي</label><input type="date" id="tb-m-due" value="${todayPlus(14)}"></span>
      </div>
      <div class="tb-field">
        <label>إسناد إلى</label>
        <div class="tb-assign-grid" id="tb-m-assign"></div>
      </div>`;

    // اختيار النوع
    $("tb-m-types").querySelectorAll(".tb-type-opt").forEach((el) => {
      el.addEventListener("click", () => {
        $("tb-m-types").querySelectorAll(".tb-type-opt").forEach((x) => x.classList.remove("sel"));
        el.classList.add("sel"); modalState.type = el.dataset.type; renderTitleField();
      });
    });
    if (isAdmin()) $("tb-m-dept").addEventListener("change", () => renderAssign($("tb-m-dept").value));
    renderTitleField();
    renderAssign(deptKey);
  }

  function renderTitleField() {
    const wrap = $("tb-m-title-wrap");
    const list = sourceTitles(modalState.type);
    if (list.length) {
      const label = modalState.type === "tender" ? "المناقصة الجارية"
        : modalState.type === "ptc" ? "المناقصة المقدَّمة (PTC)"
        : "المناقصة المقدَّمة (طلب تخفيض)";
      const hint = `اختر من ${list.length} مناقصة — اكتب للبحث`;
      wrap.innerHTML = `<label>${esc(label)}</label>
        <input type="text" id="tb-m-title" list="tb-m-title-dl" placeholder="${esc(hint)}" autocomplete="off">
        <datalist id="tb-m-title-dl">${list.map((t) => `<option value="${esc(t)}"></option>`).join("")}</datalist>`;
    } else {
      wrap.innerHTML = `<label>عنوان / وصف المهمة</label><input type="text" id="tb-m-title" placeholder="عنوان المهمة">`;
    }
  }

  function renderAssign(deptKey) {
    modalState.assignees = [];
    const dept = departments.find((d) => d.key === deptKey);
    const emps = (dept && dept.employees) || [];
    const roleLabel = (title) => /قائد فريق/.test(title) ? "قائد فريق" : /مدير وحدة/.test(title) ? "مدير وحدة" : /مدير قسم/.test(title) ? "مدير قسم" : "مهندس";
    $("tb-m-assign").innerHTML = emps.map((e) =>
      `<span class="tb-assign-opt" role="button" data-name="${esc(e.name)}">${esc(e.name)} <small>${esc(roleLabel(e.title))}</small></span>`
    ).join("") || `<small style="color:#9bb0a4">لا يوجد موظفون لهذا القسم</small>`;
    $("tb-m-assign").querySelectorAll(".tb-assign-opt").forEach((el) => {
      el.addEventListener("click", () => {
        el.classList.toggle("sel");
        const name = el.dataset.name;
        const i = modalState.assignees.indexOf(name);
        if (i >= 0) modalState.assignees.splice(i, 1); else modalState.assignees.push(name);
      });
    });
  }

  function saveNewTask() {
    const deptKey = $("tb-m-dept").value;
    const titleEl = $("tb-m-title");
    const title = (titleEl && titleEl.value || "").trim();
    if (!title) { toast("اكتب عنوان المهمة أو اختر المناقصة"); return; }
    if (!modalState.assignees.length) { toast("اختر مهندساً واحداً على الأقل"); return; }
    const now = new Date().toISOString();
    const info = tenderInfo[title] || {};
    const dueEl = $("tb-m-due"), startEl = $("tb-m-start");
    const startVal = (startEl && startEl.value) || todayPlus(0);
    const dueVal = (dueEl && dueEl.value) || "";
    if (dueVal && dueVal < startVal) { toast("الموعد النهائي قبل تاريخ البداية — صحّح التواريخ"); return; }
    const t = {
      id: uid(), type: modalState.type, title, deptKey,
      owner: info.owner || "", submitDate: info.submitDate || "",
      assignees: modalState.assignees.slice(), status: "in-progress",
      startDate: startVal, dueDate: dueVal,
      createdBy: identity.name, createdAt: now, assignedAt: now, history: []
    };
    logHist(t, "إسناد المهمة");
    tasks.unshift(t); saveTasks(); closeModal(); renderAll();
    toast("تم إسناد المهمة ووضعها قيد العمل");
  }

  // ── Toast ───────────────────────────────────────────────────
  let toastT = null;
  function toast(msg) {
    let el = $("tb-toast");
    if (!el) { el = document.createElement("div"); el.id = "tb-toast"; el.className = "tb-toast"; document.body.appendChild(el); }
    el.textContent = msg; el.style.display = "block";
    clearTimeout(toastT); toastT = setTimeout(() => { el.style.display = "none"; }, 2600);
  }

  // ── ربط الأحداث ─────────────────────────────────────────────
  function wire() {
    $("tb-new-task").addEventListener("click", openModal);
    $("tb-m-save").addEventListener("click", saveNewTask);
    $("tb-m-cancel").addEventListener("click", closeModal);
    $("tb-m-close").addEventListener("click", closeModal);
    $("tb-overlay").addEventListener("click", (e) => { if (e.target.id === "tb-overlay") closeModal(); });
    $("tb-board").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (btn) moveTask(btn.dataset.id, btn.dataset.act);
    });
    // تعديل تاريخَي البداية/النهاية من البطاقة
    $("tb-board").addEventListener("change", (e) => {
      const inp = e.target.closest(".tb-due-input");
      if (!inp) return;
      const t = tasks.find((x) => x.id === inp.dataset.id);
      if (!t || !canEditDue(t)) return;
      const field = inp.dataset.field === "startDate" ? "startDate" : "dueDate";
      const v = inp.value;
      if (field === "startDate" && t.dueDate && v && v > t.dueDate) { toast("البداية بعد الموعد النهائي — صحّح التواريخ"); renderAll(); return; }
      if (field === "dueDate" && t.startDate && v && v < t.startDate) { toast("الموعد النهائي قبل البداية — صحّح التواريخ"); renderAll(); return; }
      t[field] = v;
      logHist(t, field === "startDate" ? "تعديل تاريخ البداية" : "تعديل الموعد النهائي");
      saveTasks(); renderAll();
      toast(field === "startDate" ? "تم تحديث تاريخ البداية" : "تم تحديث الموعد النهائي");
    });
    // تبديل العرض: اللوحة / المؤشرات
    const vt = $("tb-viewtoggle");
    if (vt) vt.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-view]");
      if (!b) return;
      currentView = b.dataset.view; renderAll();
    });
    // كارت موظف / تصدير Excel من عرض المؤشرات
    const kv = $("tb-kpiview");
    if (kv) kv.addEventListener("click", (e) => {
      if (e.target.closest("#tb-export")) { exportKpiExcel(); return; }
      const card = e.target.closest(".tb-emp-card");
      if (card) openEmpProfile(card.dataset.emp);
    });
    const lib = $("tb-library");
    if (lib) lib.addEventListener("click", (e) => {
      const ed = e.target.closest("[data-edit]");
      if (!ed || !isAdmin()) return;
      e.preventDefault();
      const k = ed.dataset.edit;
      const v = window.prompt(`رابط مكتبة SharePoint لـ ${deptName(k)}:`, libLinks[k] || "");
      if (v !== null) { saveLibLink(k, v); renderLibrary(); toast(String(v).trim() ? "تم حفظ رابط المكتبة" : "تم حذف الرابط"); }
    });
    const bell = $("tb-bell");
    if (bell) bell.addEventListener("click", (e) => { e.stopPropagation(); toggleNotifPanel(); });
    document.addEventListener("click", (e) => {
      const p = $("tb-notif-panel");
      if (p && !p.hidden && !e.target.closest("#tb-notif-panel") && !e.target.closest("#tb-bell")) p.hidden = true;
    });
  }

  // ── لوحة الإشعارات المنسدلة ──────────────────────────────────
  function buildNotifPanel() {
    let p = $("tb-notif-panel");
    if (p) return p;
    p = document.createElement("div");
    p.id = "tb-notif-panel";
    p.className = "tb-notif-panel";
    p.hidden = true;
    document.body.appendChild(p);
    p.addEventListener("click", (e) => {
      const item = e.target.closest("[data-task]");
      if (!item) return;
      const id = item.dataset.task;
      p.hidden = true;
      if (id.indexOf("db:") === 0) { dismissDB(id.slice(3)); renderAll(); toast("تم استلام إشعار المناقصة"); return; }
      const card = document.querySelector(`.tb-card[data-id="${id}"]`);
      if (card) { card.scrollIntoView({ behavior: "smooth", block: "center" }); card.classList.add("tb-flash"); setTimeout(() => card.classList.remove("tb-flash"), 1600); }
    });
    return p;
  }
  function renderNotifPanel() {
    const p = buildNotifPanel();
    const list = myNotifs();
    p.innerHTML = `<div class="tb-np-head">الإشعارات<span>${list.length}</span></div>` +
      (list.length
        ? `<div class="tb-np-body">` + list.map((n) =>
            `<div class="tb-np-item ${n.kind}" data-task="${esc(n.id)}">
               <div class="tb-np-dot"></div>
               <div class="tb-np-txt"><b>${esc(n.text)}</b><span>${esc(n.title)} · ${esc(n.dept)}</span></div>
             </div>`).join("") + `</div>`
        : `<div class="tb-np-empty">لا توجد إشعارات حالياً</div>`);
  }
  function toggleNotifPanel() {
    const p = buildNotifPanel();
    if (!p.hidden) { p.hidden = true; return; }
    renderNotifPanel();
    const bell = $("tb-bell");
    const r = bell.getBoundingClientRect();
    p.style.top = (r.bottom + 8) + "px";
    // محاذاة يمين البطاقة مع الجرس (واجهة RTL)
    p.style.left = Math.max(12, r.left - 280 + r.width) + "px";
    p.hidden = false;
  }

  // ── الإقلاع ─────────────────────────────────────────────────
  // مزامنة دورية: التقاط تغييرات المتصفحات/المستخدمين الآخرين
  let pollT = null;
  function startPolling() {
    if (!useRemote || pollT) return;
    pollT = setInterval(async () => {
      let changed = false;
      const rt = await sbGet("tasks", null);
      if (rt && JSON.stringify(rt) !== JSON.stringify(tasks)) { tasks = rt; saveTasksLocal(); changed = true; }
      const rtt = await sbGet("tender_types", null);
      if (rtt && JSON.stringify(rtt) !== JSON.stringify(tenderTypes)) { tenderTypes = rtt; changed = true; }
      if (changed) renderAll();
    }, 15000);
  }
  async function init() {
    SB = initSB();
    await initRemote();
    loadIdentity(); loadTasksLocal(); loadLibLinksLocal(); loadTenderTypesLocal();
    await loadDepartments();
    refineRole();
    renderAll(); wire();
    loadTenders().then(() => { /* العناوين جاهزة للنافذة */ });
    // تحميل النسخة المشتركة (إن وُجدت) ثم إعادة العرض وبدء المزامنة
    Promise.all([loadTasksRemote(), loadLibLinks(), loadTenderTypesRemote()]).then(() => { renderLibrary(); renderAll(); startPolling(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
