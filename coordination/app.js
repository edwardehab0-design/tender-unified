const SESSION_KEY = "alrawafPortalRole";
const STATE_KEY = "alrawafCoordinationStateV1";

const fallbackDepartments = [
  {
    key: "BS",
    name: "إدارة دراسات السوق",
    short: "BS",
    manager: "مدير دراسات السوق",
    library: "SharePoint/BS",
    engineers: ["أحمد", "عبدالله", "نواف", "سلمان"],
    tasks: ["تحليل المنافسة", "قراءة المتطلبات", "تحديد المخاطر", "رفع توصية المشاركة"]
  },
  {
    key: "INF",
    name: "إدارة البنية التحتية",
    short: "INF",
    manager: "مدير البنية التحتية",
    library: "SharePoint/INF",
    engineers: ["خالد", "فيصل", "مازن", "تركي"],
    tasks: ["مراجعة النطاق الفني", "تقدير الموارد", "حصر البنود الحرجة", "رفع الملاحظات الفنية"]
  },
  {
    key: "TECH",
    name: "الإدارة الفنية",
    short: "TECH",
    manager: "المدير الفني",
    library: "SharePoint/TECH",
    engineers: ["محمد", "راكان", "بندر", "مشاري"],
    tasks: ["مراجعة المواصفات", "تحليل المخططات", "مطابقة المتطلبات", "تجهيز الاستفسارات"]
  },
  {
    key: "DESIGN",
    name: "إدارة التصميم",
    short: "DESIGN",
    manager: "مدير التصميم",
    library: "SharePoint/DESIGN",
    engineers: ["سارة", "ريما", "لينا", "هند"],
    tasks: ["تقييم متطلبات التصميم", "مراجعة المخططات", "حصر النواقص", "رفع ملفات التصميم"]
  }
];

let departments = fallbackDepartments;
let techOfferData = null;

const fallbackTenders = [
  {
    id: "TND-106-26",
    title: "تنفيذ وتشغيل وصيانة الحدائق العامة والسقيا لوجهة صفوى",
    client: "الشركة الوطنية للإسكان",
    sector: "محفظة مشاريع البنية التحتية",
    submitDate: "2026-06-05"
  },
  {
    id: "TND-81-26",
    title: "توريد وتركيب أنابيب الألياف الزجاجية لنظام نقل الرياض القصيم",
    client: "الهيئة السعودية للمياه",
    sector: "محفظة مشاريع المياه والنقل",
    submitDate: "2026-06-08"
  },
  {
    id: "TND-73-26",
    title: "مشروع إنشاء دور إيواء في مناطق متعددة",
    client: "وزارة الداخلية",
    sector: "محفظة مشاريع المباني",
    submitDate: "2026-06-12"
  }
];

const PREF_KEY = "alrawafOpsPrefsV1";
const ACTIVITY_KEY = "alrawafActivityLogV1";
const SP_KEY = "alrawafSharePointBaseV1";
const MAX_ACTIVITY_ENTRIES = 200;

function readPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREF_KEY) || "{}");
  } catch {
    return {};
  }
}

function writePrefs() {
  try {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {}
}

let prefs = readPrefs();
// تطبيق السمة فوراً لتفادي الوميض قبل تحميل البيانات (الثيم مشترك)
try {
  document.documentElement.setAttribute("data-theme", localStorage.getItem("alrawafTheme") === "green" ? "green" : "grad");
  if (prefs.density === "compact" && document.body) document.body.classList.add("density-compact");
} catch {}
let tenders = [];
let selectedDepartment = "all";
let selectedFilter = ["all", "new", "active", "late", "ready"].includes(prefs.filter) ? prefs.filter : "all";
let searchTerm = "";
let selectedContext = null;
let selectedIds = new Set();
let selectedView = ["board", "table", "calendar", "analytics"].includes(prefs.view) ? prefs.view : "board";
let advFilters = { sector: "", client: "", from: "", to: "" };
let calendarRef = new Date();
let savedState = readState();
let deptNotifications = [];
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function qs(id) {
  return document.getElementById(id);
}

function role() {
  try {
    return sessionStorage.getItem(SESSION_KEY) || "manager";
  } catch {
    return "manager";
  }
}

function isExecutive() {
  const current = role();
  return current === "manager" || current === "vp";
}

function currentDepartmentKey() {
  try {
    return sessionStorage.getItem("alrawafDepartmentKey") || "BS";
  } catch {
    return "BS";
  }
}

// ── تمييز مدير القسم عن الموظف ──
// رؤساء الأقسام: يرون قسمهم بالكامل. باقي الموظفين: يرون مهامهم المسندة فقط.
const DEPT_MANAGER_EMAILS = new Set([
  "mohamed.salama@alrawaf.com.sa",        // العروض الفنية والتأهيل (TECH)
  "mahmoud.a.abdelghany@alrawaf.com.sa",  // الإنشاءات والتكاليف (BS)
  "nassersonbl2017@alrawaf.com.sa",       // البنية التحتية (INF)
  "mostafa.moawed@alrawaf.com.sa"         // الدراسات والتصاميم (DESIGN)
]);

function viewerEmail() {
  try { return (sessionStorage.getItem("alrawafUserEmail") || "").trim().toLowerCase(); } catch { return ""; }
}

function viewerName() {
  try { return (sessionStorage.getItem("alrawafUserName") || "").trim(); } catch { return ""; }
}

function isDeptManager() {
  return !isExecutive() && DEPT_MANAGER_EMAILS.has(viewerEmail());
}

// ── طبقات الصلاحية حسب منطق الأعمدة الصارم ──
// المعتمِدون: مدير الإدارة + مالك الموقع فقط — العمود «جاهزة للاعتماد» → «معتمدة»
const APPROVER_EMAILS = new Set([
  "alaaaboelnaja@alrawaf.com.sa", // علاء أبو النجا — مدير الإدارة
  "ehab.edward@alrawaf.com.sa",   // إيهاب ادوارد — مالك الموقع
  "edwardehab0@gmail.com"         // إيهاب — حساب بديل
]);

function isApprover() {
  return APPROVER_EMAILS.has(viewerEmail());
}

// قادة الفرق = مديرو الأقسام (حسب اعتماد الإدارة) — العمودان «مهام جديدة» و«قيد العمل»
function isTeamLeader() {
  return isDeptManager();
}

// نمط العرض: تنفيذي (الكل) · مدير قسم (قسمه) · موظف (مهامه فقط)
function viewerMode() {
  if (isExecutive()) return "executive";
  if (isDeptManager()) return "manager";
  return "employee";
}

// هل المنافسة مسندة للموظف الحالي داخل قسمه؟
function assignedToViewer(tender) {
  const myName = viewerName();
  if (!myName) return false;
  const myRow = departmentRows(tender).find((row) => row.key === currentDepartmentKey());
  if (!myRow) return false;
  const target = normalizeText(myName);
  return myRow.engineers.some((eng) => normalizeText(personName(eng)) === target);
}

function readState() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeState() {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(savedState));
  } catch {}
}

function isManagerTitle(title = "") {
  const value = String(title).toLowerCase();
  return value.includes("manager") || value.includes("director") || value.includes("office manager");
}

function isSupportTitle(title = "") {
  const value = String(title).toLowerCase();
  return value.includes("administrative") || value.includes("document controller") || value.includes("office manager");
}

function personName(person) {
  return typeof person === "string" ? person : person?.name || "";
}

function personTitle(person) {
  return typeof person === "string" ? "" : person?.title || "";
}

function rosterEmployees(dept) {
  const employees = Array.isArray(dept.employees) ? dept.employees : [];
  if (employees.length) return employees;
  return (dept.engineers || []).map((name) => ({ name, title: "Engineer" }));
}

function assignableEmployees(dept) {
  return rosterEmployees(dept);
}

function autoAssignableEmployees(dept) {
  const employees = rosterEmployees(dept);
  const technical = employees.filter((employee) => !isManagerTitle(employee.title) && !isSupportTitle(employee.title));
  if (technical.length) return technical;
  return employees;
}

function assignmentRoleLabel(person) {
  const title = personTitle(person);
  if (isSupportTitle(title)) return "دعم";
  if (isManagerTitle(title)) return "قيادي";
  return "مهندس";
}

function assignmentRoleKey(person) {
  const title = personTitle(person);
  if (isSupportTitle(title)) return "support";
  if (isManagerTitle(title)) return "leader";
  return "engineer";
}

async function loadEmployees() {
  try {
    const response = await fetch("./employees.json?v=2", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.departments) || !data.departments.length) return;
    departments = data.departments.map((dept) => ({
      key: dept.key,
      name: dept.name,
      short: dept.key,
      manager: dept.manager || "",
      library: dept.library || `SharePoint/${dept.key}`,
      tasks: Array.isArray(dept.tasks) ? dept.tasks : [],
      employees: Array.isArray(dept.employees) ? dept.employees : [],
      sourceLabel: dept.sourceLabel || ""
    }));
  } catch (error) {
    departments = fallbackDepartments;
  }
}

async function loadTechOffers() {
  try {
    const response = await fetch("./tech-offers.json?v=2", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    techOfferData = await response.json();
  } catch {
    techOfferData = null;
  }
}

function normalizeText(value) {
  return String(value || "")
    .replace(/[\u064B-\u065F]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ـ/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function techRecordForTender(tender) {
  if (!techOfferData || !Array.isArray(techOfferData.inProgress)) return null;
  const title = normalizeText(tender.title);
  const id = normalizeText(tender.id);
  return techOfferData.inProgress.find((row) => {
    const rowTitle = normalizeText(row.projectName);
    const rowId = normalizeText(row.tenderId);
    return (rowTitle && rowTitle === title) || (rowId && rowId === id);
  }) || null;
}

function employeeByFullName(dept, fullName) {
  const target = normalizeText(fullName);
  if (!target) return null;
  return (dept.employees || []).find((employee) => normalizeText(employee.name) === target) || null;
}

function safe(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[ch]));
}

function pick(row, labels, fallbackIndex) {
  for (const label of labels) {
    if (row[label]) return row[label];
  }
  const keys = Object.keys(row);
  const matched = keys.find((key) => labels.some((label) => key.includes(label)));
  if (matched && row[matched]) return row[matched];
  return row[keys[fallbackIndex]] || "";
}

function normalizeTender(row, index) {
  return {
    id: row.tender_id || row.id || `TND-${String(index + 1).padStart(3, "0")}`,
    title: pick(row, ["اسم المناقصة", "Tender Title", "tender_title", "name"], 1) || fallbackTenders[index % fallbackTenders.length].title,
    client: pick(row, ["المالك", "Client", "client", "owner"], 4) || "غير محدد",
    sector: pick(row, ["القطاع", "Sector", "sector"], 6) || "غير محدد",
    submitDate: pick(row, ["تاريخ التقديم", "Submission", "submission", "date"], 2) || "2026-06-01",
    guarantee: pick(row, ["تاريخ الضمان الابتدائي", "guarantee", "Guarantee"], -1) || ""
  };
}

function statusFor(tender, deptIndex) {
  const state = savedState[tender.id]?.departments?.[departments[deptIndex].key];
  if (state) return state;
  // لا توجد حالة محفوظة: القسم قيد العمل حتى يُحدّثه شخص فعلياً
  return "in-progress";
}

function setDepartmentStatus(tenderId, departmentKey, status) {
  savedState[tenderId] = savedState[tenderId] || {};
  savedState[tenderId].departments = savedState[tenderId].departments || {};
  savedState[tenderId].departments[departmentKey] = status;
  if (status === "completed") {
    savedState[tenderId].timing = savedState[tenderId].timing || {};
    savedState[tenderId].timing[departmentKey] = savedState[tenderId].timing[departmentKey] || {};
    savedState[tenderId].timing[departmentKey].completedAt = new Date().toISOString();
  }
  const tender = tenders.find((t) => t.id === tenderId);
  // عند اكتمال كل الأقسام نُزيل أي تجاوز يدوي للمرحلة كي تتدفق البطاقة تلقائيا إلى "جاهزة للاعتماد"
  let clearedStage = false;
  if (tender && departmentRows(tender).every((row) => row.status === "completed")) {
    delete savedState[tenderId].stage;
    clearedStage = true;
  }
  writeState();
  if (window.SB?.enabled) {
    window.SB.setDeptStatus(tenderId, departmentKey, status);
    if (clearedStage) window.SB.setStageOverride(tenderId, null);
  }
  const dept = departments.find((d) => d.key === departmentKey);
  if (tender && status === "completed") {
    addActivityEntry(tenderId, tender.title, "complete", `اعتماد إكمال ${dept?.name || departmentKey}`);
  }
}

function setApproval(tenderId, status) {
  savedState[tenderId] = savedState[tenderId] || {};
  savedState[tenderId].approval = status;
  writeState();
  if (window.SB?.enabled) window.SB.setApproval(tenderId, status);
  const tender = tenders.find((t) => t.id === tenderId);
  if (tender) {
    addActivityEntry(tenderId, tender.title, status === "approved" ? "approve" : "reject",
      status === "approved" ? "تم الاعتماد النهائي للمنافسة" : "تم رفض المنافسة");
  }
}

function savedAssignedNames(tenderId, departmentKey) {
  const names = savedState[tenderId]?.assignments?.[departmentKey];
  return Array.isArray(names) ? names : [];
}

function setAssignment(tenderId, departmentKey, names) {
  const tender = tenders.find((t) => t.id === tenderId);
  // التقط المرحلة قبل الحفظ لاكتشاف الانتقال التلقائي «جديدة» → «قيد العمل»
  const wasNew = tender ? tenderStage(tender) === "new" : false;
  savedState[tenderId] = savedState[tenderId] || {};
  savedState[tenderId].assignments = savedState[tenderId].assignments || {};
  savedState[tenderId].assignments[departmentKey] = names;
  savedState[tenderId].timing = savedState[tenderId].timing || {};
  savedState[tenderId].timing[departmentKey] = savedState[tenderId].timing[departmentKey] || {};
  savedState[tenderId].timing[departmentKey].assignedAt = new Date().toISOString();
  writeState();
  if (window.SB?.enabled) window.SB.setAssignments(tenderId, departmentKey, names);
  const dept = departments.find((d) => d.key === departmentKey);
  if (tender && names.length) {
    addActivityEntry(tenderId, tender.title, "assign",
      `تعيين ${names.join("، ")} في ${dept?.name || departmentKey}`);
    // منطق الأعمدة الصارم: أول تعيين فعلي للفريق ينقل المهمة تلقائيا إلى «قيد العمل»
    // (يتم النقل عبر boardColumn تلقائيا بمجرد وجود تعيين محفوظ)
    if (wasNew) {
      addActivityEntry(tenderId, tender.title, "stage", "نقل تلقائي إلى «قيد العمل» بعد تعيين الفريق");
    }
  }
}

function departmentComments(tenderId, departmentKey) {
  const comments = savedState[tenderId]?.comments?.[departmentKey];
  return Array.isArray(comments) ? comments : [];
}

function addDepartmentComment(tenderId, departmentKey, text) {
  const value = String(text || "").trim();
  if (!value) return;
  savedState[tenderId] = savedState[tenderId] || {};
  savedState[tenderId].comments = savedState[tenderId].comments || {};
  savedState[tenderId].comments[departmentKey] = savedState[tenderId].comments[departmentKey] || [];
  savedState[tenderId].comments[departmentKey].unshift({
    text: value,
    at: new Date().toISOString(),
    by: isExecutive() ? "مدير الإدارة" : "مدير القسم"
  });
  writeState();
  if (window.SB?.enabled) window.SB.addComment(tenderId, departmentKey, value);
  const tender = tenders.find((t) => t.id === tenderId);
  const dept = departments.find((d) => d.key === departmentKey);
  if (tender) {
    addActivityEntry(tenderId, tender.title, "comment",
      `ملاحظة (${dept?.name || departmentKey}): ${value.slice(0, 80)}${value.length > 80 ? "…" : ""}`);
  }
}

// ── سجل النشاط ──
function readActivityLog() {
  try { return JSON.parse(localStorage.getItem(ACTIVITY_KEY) || "[]"); } catch { return []; }
}

function writeActivityLog(log) {
  try { localStorage.setItem(ACTIVITY_KEY, JSON.stringify(log)); } catch {}
}

function addActivityEntry(tenderId, tenderTitle, type, text) {
  const log = readActivityLog();
  log.unshift({
    id: tenderId,
    title: tenderTitle,
    type,
    text,
    at: new Date().toISOString(),
    by: isExecutive() ? "مدير الإدارة" : "مدير القسم"
  });
  if (log.length > MAX_ACTIVITY_ENTRIES) log.length = MAX_ACTIVITY_ENTRIES;
  writeActivityLog(log);
}

function tenderActivityLog(tenderId) {
  return readActivityLog().filter((entry) => entry.id === tenderId);
}

// ── إعداد SharePoint ──
const SP_DEPT_PREFIX = "alrawafSPDeptLink_";

// يُملأ فوراً من localStorage بشكل متزامن — الـ render الأول يرى البيانات مباشرة
const _libLinkCache = (() => {
  const cache = {};
  try {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith(SP_DEPT_PREFIX)) {
        const val = localStorage.getItem(k);
        if (val) cache[k.slice(SP_DEPT_PREFIX.length)] = val;
      }
    });
  } catch {}
  return cache;
})();

// يُستدعى في loadData: يُزامن مع Supabase ويُهاجر localStorage إليه
async function loadLibraryLinksCache() {
  if (!window.SB?.enabled) return;
  try {
    const remote = await window.SB.fetchLibraryLinks();
    // هجّر ما في localStorage إلى Supabase إن لم يكن موجوداً فيه بعد
    for (const [key, url] of Object.entries(_libLinkCache)) {
      if (!remote[key] && url) {
        await window.SB.setLibraryLink(key, url);
        remote[key] = url;
      }
    }
    // Supabase هو المرجع النهائي — أضف/اكتب فوق cache
    Object.assign(_libLinkCache, remote);
  } catch (e) {
    console.warn("[libLinks] Supabase sync failed, using localStorage:", e);
  }
}

function getSharePointBase() {
  try { return localStorage.getItem(SP_KEY) || ""; } catch { return ""; }
}

function saveSharePointBase(url) {
  try { localStorage.setItem(SP_KEY, String(url || "").trim()); } catch {}
}

function getDeptLibraryLink(deptKey) {
  return _libLinkCache[deptKey] || "";
}

function saveDeptLibraryLink(deptKey, url) {
  const cleaned = String(url || "").trim();
  _libLinkCache[deptKey] = cleaned;
  // احفظ على Supabase (مشترك بين كل المتصفحات)
  if (window.SB?.enabled) window.SB.setLibraryLink(deptKey, cleaned);
  // احفظ على localStorage كـ fallback
  try { localStorage.setItem(SP_DEPT_PREFIX + deptKey, cleaned); } catch {}
}

let _spModalDeptKey = null;

function openSharePointConfig(deptKey) {
  const modal = qs("sp-modal");
  if (!modal) return;
  _spModalDeptKey = deptKey || null;
  const dept = deptKey ? departments.find((d) => d.key === deptKey) : null;
  const title = qs("sp-modal-title");
  if (title) title.textContent = dept ? `رابط مكتبة ${dept.name}` : "إعداد رابط SharePoint";
  const urlInput = qs("sp-url-input");
  if (urlInput) urlInput.value = deptKey ? getDeptLibraryLink(deptKey) : getSharePointBase();
  modal.hidden = false;
}

function closeSharePointConfig() {
  const modal = qs("sp-modal");
  if (modal) modal.hidden = true;
  _spModalDeptKey = null;
}

function openDeptLibrary(deptKey) {
  const perLink = getDeptLibraryLink(deptKey);
  if (perLink) { window.open(perLink, "_blank", "noopener"); return; }
  const dept = departments.find((d) => d.key === deptKey);
  const lib = dept?.library || deptKey;
  const base = getSharePointBase();
  if (!base) {
    openSharePointConfig(deptKey);
    return;
  }
  const url = lib.startsWith("http") ? lib : `${base.replace(/\/$/, "")}/${lib}`;
  window.open(url, "_blank", "noopener");
}

// ── البحث المتقدم بفلاتر مركّبة ──
function uniqueValues(key) {
  return [...new Set(tenders.map((tender) => tender[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ar"));
}

function renderAdvancedFilters() {
  const container = qs("adv-filters");
  if (!container) return;
  const sectors = uniqueValues("sector");
  const clients = uniqueValues("client");
  const active = hasActiveAdvanced();
  document.querySelector(".rail-advanced")?.classList.toggle("has-active", active);
  container.innerHTML = `
    <label class="adv-field">
      <span>القطاع</span>
      <select data-adv="sector">
        <option value="">كل القطاعات</option>
        ${sectors.map((value) => `<option value="${safe(value)}" ${advFilters.sector === value ? "selected" : ""}>${safe(value)}</option>`).join("")}
      </select>
    </label>
    <label class="adv-field">
      <span>العميل</span>
      <select data-adv="client">
        <option value="">كل العملاء</option>
        ${clients.map((value) => `<option value="${safe(value)}" ${advFilters.client === value ? "selected" : ""}>${safe(value)}</option>`).join("")}
      </select>
    </label>
    <div class="adv-dates">
      <label class="adv-field"><span>إغلاق من</span><input type="date" data-adv="from" value="${safe(advFilters.from)}"></label>
      <label class="adv-field"><span>إلى</span><input type="date" data-adv="to" value="${safe(advFilters.to)}"></label>
    </div>
    ${active ? `<button type="button" class="adv-clear" id="adv-clear">مسح الفلاتر المتقدمة</button>` : ""}
  `;
}

// ── الوضع الليلي ──
// الثيم موحّد بين كل الصفحات عبر localStorage["alrawafTheme"] = "grad" | "green"
function savedTheme() {
  try { return localStorage.getItem("alrawafTheme") === "green" ? "green" : "grad"; } catch { return "grad"; }
}

function applyTheme() {
  const green = savedTheme() === "green";
  document.documentElement.setAttribute("data-theme", green ? "green" : "grad");
  const btn = qs("theme-toggle");
  if (btn) {
    btn.setAttribute("aria-pressed", green ? "true" : "false");
    btn.title = green ? "المظهر البنفسجي" : "المظهر الأخضر";
  }
}

function toggleTheme() {
  const next = savedTheme() === "green" ? "grad" : "green";
  try { localStorage.setItem("alrawafTheme", next); } catch {}
  applyTheme();
}

// ── كثافة البطاقات ──
function applyDensity() {
  const compact = prefs.density === "compact";
  document.body.classList.toggle("density-compact", compact);
  const btn = qs("density-toggle");
  if (btn) {
    btn.setAttribute("aria-pressed", compact ? "true" : "false");
    btn.title = compact ? "عرض مريح" : "عرض مضغوط";
  }
}

function toggleDensity() {
  prefs.density = prefs.density === "compact" ? "comfortable" : "compact";
  writePrefs();
  applyDensity();
}

// ── مساعدات الإشعارات ──

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "الآن";
  if (m < 60) return `منذ ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return `منذ ${h} ساعة`;
  return `منذ ${Math.floor(h / 24)} يوم`;
}

function notifTypeLabel(type) {
  const map = { done: "انتهينا ✓", started: "بدأنا", coord: "طلب تنسيق", custom: "رسالة" };
  return map[type] || "إشعار";
}

function notifTypeDefaultMsg(type) {
  const map = {
    done: "انتهى قسمنا من العمل على هذه المنافسة.",
    started: "بدأ قسمنا العمل على هذه المنافسة.",
    coord: "مطلوب التنسيق معنا بخصوص هذه المنافسة."
  };
  return map[type] || "";
}

function showToast(msg) {
  let t = document.querySelector(".ops-toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "ops-toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("visible");
  setTimeout(() => t.classList.remove("visible"), 2800);
}

async function loadDeptNotifications() {
  if (!window.SB?.enabled) return;
  deptNotifications = await window.SB.fetchDeptNotifications(currentDepartmentKey());
  renderNotifications();
}

// ── الإشعارات ──
function renderNotifications() {
  const countBadge = qs("notif-count");
  if (!countBadge) return;
  const sysCount = smartAlerts().length;
  const unreadDept = deptNotifications.filter((n) => !n.is_read).length;
  const total = sysCount + unreadDept;
  countBadge.textContent = total;
  countBadge.hidden = total === 0;
}

function buildNotifPanel() {
  const panel = qs("notif-panel");
  if (!panel) return;
  const alerts = smartAlerts();
  const deadlines  = alerts.filter((a) => a.type === "deadline");
  const guarantees = alerts.filter((a) => a.type === "guarantee");
  const unreadDept = deptNotifications.filter((n) => !n.is_read);

  function renderGroup(title, icon, items) {
    if (!items.length) return "";
    return `
      <div class="notif-group-head">${icon} ${safe(title)} (${items.length})</div>
      ${items.map((a) => `
        <div class="notif-item ${safe(a.tone)}">
          <div class="notif-item-top">
            <strong>${safe(a.text)}</strong>
            <span class="notif-label ${safe(a.tone)}">${safe(a.label)}</span>
          </div>
          <span class="notif-sub">${safe(a.sub)}</span>
        </div>
      `).join("")}
    `;
  }

  const deptSection = deptNotifications.length ? `
    <div class="notif-group-head">💬 إشعارات الأقسام (${deptNotifications.length})</div>
    ${deptNotifications.map((n) => `
      <div class="notif-item ${n.is_read ? "soft" : "info"}" data-notif-id="${safe(n.id)}" style="cursor:pointer">
        <div class="notif-item-top">
          <strong>${safe(n.message)}</strong>
          <span class="notif-label ${n.is_read ? "soft" : "info"}">${safe(notifTypeLabel(n.type))}</span>
        </div>
        <span class="notif-sub">من: ${safe(n.from_dept)}${n.from_name ? ` (${safe(n.from_name)})` : ""} • ${safe(n.tender_title || n.tender_id)} • ${safe(timeAgo(n.created_at))}</span>
      </div>
    `).join("")}
  ` : "";

  const total = alerts.length + unreadDept.length;

  panel.innerHTML = `
    <div class="notif-panel-head">
      <strong>الإشعارات${total ? ` (${total})` : ""}</strong>
      <div style="display:flex;gap:6px;align-items:center">
        ${unreadDept.length ? `<button type="button" id="notif-mark-all" style="font-size:11px;padding:0 8px;height:24px;border:1px solid var(--border);border-radius:6px;background:var(--surface-2);color:var(--muted);cursor:pointer;font-family:inherit;font-weight:800">قراءة الكل</button>` : ""}
        <button type="button" id="notif-close" aria-label="إغلاق">×</button>
      </div>
    </div>
    <div class="notif-items">
      ${alerts.length === 0 && deptNotifications.length === 0
        ? `<div class="notif-empty">لا توجد إشعارات حالياً.</div>`
        : renderGroup("مواعيد إغلاق خلال 3 أيام", "📅", deadlines)
          + renderGroup("ضمانات ابتدائية مستحقة", "🔐", guarantees)
          + deptSection
      }
    </div>
  `;
  panel.querySelector("#notif-close")?.addEventListener("click", closeNotifPanel);
  panel.querySelector("#notif-mark-all")?.addEventListener("click", async () => {
    if (!window.SB?.enabled) return;
    await window.SB.markAllDeptNotifsRead(currentDepartmentKey());
    await loadDeptNotifications();
    buildNotifPanel();
  });
  panel.querySelectorAll("[data-notif-id]").forEach((item) => {
    item.addEventListener("click", async () => {
      const id = item.dataset.notifId;
      const notif = deptNotifications.find((n) => n.id === id);
      if (!notif || notif.is_read) return;
      notif.is_read = true;
      renderNotifications();
      item.classList.replace("info", "soft");
      item.querySelector(".notif-label")?.classList.replace("info", "soft");
      if (window.SB?.enabled) await window.SB.markDeptNotifRead(id);
    });
  });
}

function openNotifPanel() {
  buildNotifPanel();
  qs("notif-panel").hidden = false;
  qs("notif-wrap")?.classList.add("open");
}

function closeNotifPanel() {
  qs("notif-panel").hidden = true;
  qs("notif-wrap")?.classList.remove("open");
}

function openSendNotifModal() {
  if (!selectedContext) return;
  const tender = tenders.find((t) => t.id === selectedContext.tenderId);
  const myDept = currentDepartmentKey();
  const others = departments.filter((d) => d.key !== myDept);
  const nameEl = qs("sn-tender-name");
  const deptSel = qs("sn-dept-select");
  const msgEl = qs("sn-message");
  if (!nameEl || !deptSel || !msgEl) return;
  nameEl.textContent = tender ? tender.title : selectedContext.tenderId;
  deptSel.innerHTML = `<option value="">اختر القسم المستقبِل…</option>` +
    others.map((d) => `<option value="${safe(d.key)}">${safe(d.name)}</option>`).join("");
  msgEl.value = "";
  document.querySelectorAll("[name='sn-type']").forEach((r) => { r.checked = false; });
  const modal = qs("sn-modal");
  if (modal) modal.hidden = false;
}

function closeSendNotifModal() {
  const modal = qs("sn-modal");
  if (modal) modal.hidden = true;
}

// ── تصدير CSV ──
function exportCSV() {
  const list = visibleTenders();
  const headers = ["رقم المنافسة", "اسم المنافسة", "العميل", "القطاع", "موعد الإغلاق", "الحالة", "نسبة التقدم", "قرار المدير"];
  const rows = list.map((tender) => {
    const dRows = departmentRows(tender);
    const completed = dRows.filter((row) => row.status === "completed").length;
    const pct = Math.round((completed / departments.length) * 100);
    const approval = savedState[tender.id]?.approval;
    return [
      tender.id,
      tender.title,
      tender.client,
      tender.sector,
      tender.submitDate,
      columnLabel(tenderStage(tender)),
      `${pct}%`,
      approval ? statusLabel(approval) : "—"
    ];
  });
  const csvContent = "﻿" + [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `تقرير-العمليات-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function personLoad(name) {
  const target = normalizeText(name);
  let open = 0;
  let late = 0;
  let completed = 0;
  let totalHours = 0;
  let completedWithTime = 0;

  tenders.forEach((tender) => {
    departmentRows(tender).forEach((row, index) => {
      if (!row.engineers.some((person) => normalizeText(personName(person)) === target)) return;
      const timeline = timelineFor(tender, row.key, index, row.status);
      if (row.status === "completed" && timeline.completedAt) {
        completed += 1;
        completedWithTime += 1;
        totalHours += hoursBetween(timeline.assignedAt, timeline.completedAt);
      } else {
        open += 1;
        if (row.status === "late") late += 1;
      }
    });
  });

  return {
    open,
    late,
    completed,
    avgHours: completedWithTime ? totalHours / completedWithTime : 0
  };
}

function personLoadLabel(name) {
  const load = personLoad(name);
  const avg = load.avgHours ? ` · متوسط ${formatHours(load.avgHours)}` : "";
  return `${load.open} مهام مفتوحة · ${load.late} متأخرة${avg}`;
}

function statusLabel(status) {
  return {
    completed: "مكتمل",
    "in-progress": "قيد العمل",
    late: "متأخر",
    rejected: "مرفوض",
    approved: "معتمد"
  }[status] || "لم يبدأ";
}

function departmentRows(tender) {
  return departments.map((dept, index) => {
    const engineers = assignedEngineers(tender, dept, index);
    return {
      ...dept,
      status: statusFor(tender, index),
      engineers,
      assignmentNote: dept.key === "TECH" && !engineers.length ? techAssignmentNote(tender) : "",
      files: fileCount(tender, index)
    };
  });
}

function assignedEngineers(tender, dept, index) {
  const savedNames = savedAssignedNames(tender.id, dept.key);
  if (savedNames.length) {
    return savedNames
      .map((name) => employeeByFullName(dept, name) || { name, title: "Assigned Engineer" })
      .filter(Boolean);
  }
  if (dept.key === "TECH") {
    const record = techRecordForTender(tender);
    const matched = record?.ownerIsValid ? employeeByFullName(dept, record.ownerFullName) : null;
    return matched ? [matched] : [];
  }
  // لا تعبئة تلقائية: يبقى القسم بلا تعيين حتى يُسنِد قائد الفريق فريقا فعليا
  return [];
}

function fileCount(tender, index) {
  // عدد المرفقات الحقيقي لكل قسم؛ يبقى 0 حتى نربط جدول attachments باللوحة
  const dept = departments[index];
  const files = savedState[tender.id]?.files?.[dept?.key];
  return Array.isArray(files) ? files.length : 0;
}

function techAssignmentNote(tender) {
  const record = techRecordForTender(tender);
  if (!record) return "لا يوجد سجل مطابق لهذه المنافسة داخل شيت العروض الفنية.";
  const owner = record.ownerShortName ? `الاسم المختصر في الشيت: ${record.ownerShortName}. ` : "";
  return `${owner}هذا الاسم غير موجود داخل ملف منسوبي قسم العروض الفنية، لذلك لم يتم إسناده تلقائيا.`;
}

function daysTo(dateValue) {
  const target = new Date(dateValue);
  if (Number.isNaN(target.getTime())) return "غير محدد";
  const now = new Date();
  const diff = Math.ceil((target - now) / 86400000);
  if (diff < 0) return "متأخر";
  if (diff === 0) return "اليوم";
  return `${diff} يوم`;
}

function seedFor(value) {
  return [...String(value)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * HOUR_MS);
}

function timelineFor(tender, departmentKey, departmentIndex, status) {
  const seed = seedFor(`${tender.id}-${departmentKey}`);
  const submitDate = new Date(tender.submitDate);
  const anchor = Number.isNaN(submitDate.getTime()) ? new Date() : submitDate;
  const receivedAt = new Date(anchor.getTime() - ((8 + (seed % 7)) * DAY_MS));
  const taskCreatedAt = addHours(receivedAt, 3 + (seed % 12));
  const assignedAt = addHours(taskCreatedAt, 4 + ((seed + departmentIndex) % 20));
  const workStartedAt = addHours(assignedAt, 1 + (seed % 7));
  const generatedCompletedAt = addHours(assignedAt, 14 + (seed % 76));
  const savedCompletedAt = savedState[tender.id]?.timing?.[departmentKey]?.completedAt;
  const savedAssignedAt = savedState[tender.id]?.timing?.[departmentKey]?.assignedAt;
  return {
    receivedAt,
    taskCreatedAt,
    assignedAt: savedAssignedAt ? new Date(savedAssignedAt) : assignedAt,
    workStartedAt,
    completedAt: status === "completed" ? new Date(savedCompletedAt || generatedCompletedAt) : null
  };
}

function hoursBetween(start, end) {
  return Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / HOUR_MS);
}

function formatHours(hours) {
  if (!Number.isFinite(hours)) return "-";
  if (hours < 24) return `${Math.round(hours)} ساعة`;
  return `${(hours / 24).toFixed(hours > 72 ? 0 : 1)} يوم`;
}

function formatDateTime(date) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("ar-SA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(date));
}

function progress(tender) {
  const rows = departmentRows(tender);
  return rows.filter((row) => row.status === "completed").length;
}

function tenderState(tender) {
  const rows = departmentRows(tender);
  if (rows.every((row) => row.status === "completed")) return "ready";
  return "active";
}

function visibleTenders() {
  const term = searchTerm.trim().toLowerCase();
  const mode = viewerMode();
  return tenders.filter((tender) => {
    const visibleByRole = isExecutive() || selectedDepartment === "all" || selectedDepartment === currentDepartmentKey();
    const matchesDepartment = selectedDepartment === "all" || departmentRows(tender).some((row) => row.key === selectedDepartment);
    // الموظف العادي يرى فقط المنافسات المسندة إليه؛ المدير والتنفيذي يريان قسمهما/الكل
    const matchesViewer = mode !== "employee" || assignedToViewer(tender);
    const column = tenderStage(tender);
    const matchesFilter = selectedFilter === "all"
      || column === selectedFilter
      || (selectedFilter === "ready" && column === "approved");
    const matchesSearch = !term || `${tender.title} ${tender.client} ${tender.sector}`.toLowerCase().includes(term);
    const matchesAdvanced = matchesAdvancedFilters(tender);
    return visibleByRole && matchesDepartment && matchesViewer && matchesFilter && matchesSearch && matchesAdvanced;
  });
}

function matchesAdvancedFilters(tender) {
  if (advFilters.sector && tender.sector !== advFilters.sector) return false;
  if (advFilters.client && tender.client !== advFilters.client) return false;
  const close = new Date(tender.submitDate);
  if (advFilters.from && !Number.isNaN(close.getTime()) && close < new Date(advFilters.from)) return false;
  if (advFilters.to && !Number.isNaN(close.getTime()) && close > new Date(advFilters.to)) return false;
  return true;
}

function hasActiveAdvanced() {
  return Boolean(advFilters.sector || advFilters.client || advFilters.from || advFilters.to);
}

function departmentStats(dept) {
  const pairs = tenders.map((tender) => {
    const row = departmentRows(tender).find((r) => r.key === dept.key);
    return row ? { row, tender } : null;
  }).filter(Boolean);
  const open = pairs.filter(({ row }) => row.status !== "completed").length;
  const completed = pairs.filter(({ row }) => row.status === "completed").length;
  const late = pairs.filter(({ row, tender }) => row.status !== "completed" && daysLeft(tender.submitDate) <= 3).length;
  const unassigned = pairs.filter(({ row }) => row.key === "TECH" && !row.engineers.length).length;
  const load = tenders.length ? Math.round((open / tenders.length) * 100) : 0;
  return { open, completed, late, unassigned, load };
}

function stateText(state) {
  return {
    ready: "جاهزة للاعتماد",
    late: "تحتاج تدخل",
    active: "قيد التنسيق"
  }[state] || "قيد التنسيق";
}

function rowStateClass(status, row) {
  if (!row.engineers.length && row.key === "TECH") return "unassigned";
  return status;
}

function renderInsights() {
  const health = qs("data-health-list");
  const best = qs("ops-best-employee");
  const bestNote = qs("ops-best-note");
  const pulse = qs("ops-pulse-list");
  if (!health || !best || !bestNote || !pulse) return;

  const unmatched = techOfferData?.validation?.unmatchedActiveOwners || {};
  const unmatchedEntries = Object.entries(unmatched);
  const missingRecords = tenders.filter((tender) => !techRecordForTender(tender)).length;
  health.innerHTML = unmatchedEntries.length || missingRecords ? `
    ${unmatchedEntries.map(([name, count]) => `
      <div class="health-row danger">
        <strong>${safe(name)}</strong>
        <span>${count} منافسات غير مربوطة بموظف حقيقي</span>
      </div>
    `).join("")}
    ${missingRecords ? `
      <div class="health-row warning">
        <strong>${missingRecords}</strong>
        <span>منافسات لا يوجد لها سجل مطابق في شيت العروض الفنية</span>
      </div>
    ` : ""}
  ` : `
    <div class="health-row good">
      <strong>ممتاز</strong>
      <span>كل أسماء العروض الفنية مطابقة لملف المنسوبين</span>
    </div>
  `;

  const metrics = employeeMetrics();
  const top = metrics[0];
  best.textContent = top ? top.name : "-";
  bestNote.textContent = top ? `${top.department} · ${top.score} نقطة · ${top.open} مهام مفتوحة` : "لا توجد مهام محسوبة بعد";

  const ready = tenders.filter((tender) => tenderState(tender) === "ready").length;
  const late = tenders.filter((tender) => tenderStage(tender) === "late").length;
  const unassigned = tenders.reduce((sum, tender) => sum + departmentRows(tender).filter((row) => row.key === "TECH" && !row.engineers.length).length, 0);
  pulse.innerHTML = `
    <div><b>${ready}</b><span>ملفات تنتظر قرار المدير</span></div>
    <div><b>${late}</b><span>ملفات تحتاج متابعة فورية</span></div>
    <div><b>${unassigned}</b><span>مهام عروض فنية غير مسندة</span></div>
  `;
}

// اسم مختصر للـ BIC يظهر في chip الكارت
function shortBicLabel(bic) {
  if (!bic) return "";
  if (bic.type === "manager") return "المدير";
  if (bic.type === "unassigned") return "غير مسندة";
  return bic.label.split("·")[0].trim().split(" ")[0]; // الاسم الأول فقط
}

// ── Ball-in-court: القسم/الشخص الذي يملك الكرة الآن ──
function ballInCourt(tender) {
  const stage = tenderStage(tender);
  if (stage === "approved") return null;
  const rows = departmentRows(tender);
  if (rows.every((r) => r.status === "completed")) {
    return { label: "المدير التنفيذي", type: "manager" };
  }
  const pending = rows.find((r) => r.status !== "completed");
  if (!pending) return null;
  if (!pending.engineers.length) {
    return { label: `${pending.short} · غير مسندة`, type: "unassigned" };
  }
  const name = personName(pending.engineers[0]);
  return { label: `${safe(name)} · ${pending.short}`, type: "engineer" };
}

// ── Workflow Stepper: مراحل مسار المنافسة (Oracle-style) ──
const WF_STEPS = [
  { key: "received",    label: "الاستلام" },
  { key: "distributed", label: "التوزيع" },
  { key: "preparing",   label: "الإعداد" },
  { key: "review",      label: "المراجعة" },
  { key: "approved",    label: "الاعتماد" }
];
const WF_STAGE_MAP = { new: 1, active: 2, late: 2, ready: 3, approved: 5 };

function renderWorkflowStepper(tender) {
  const stage = tenderStage(tender);
  const activeStep = WF_STAGE_MAP[stage] ?? 1;
  const isLate = stage === "late";
  return `<div class="wf-track">${WF_STEPS.map((s, i) => {
    const done = i < activeStep;
    const current = i === activeStep;
    const cls = done ? "done" : current ? (isLate ? "current-late" : "current") : "pending";
    const icon = done ? "✓" : String(i + 1);
    const conn = i < WF_STEPS.length - 1
      ? `<div class="wf-conn ${i < activeStep ? "done" : ""}"></div>` : "";
    return `<div class="wf-step ${cls}"><div class="wf-dot">${icon}</div><span class="wf-label">${safe(s.label)}</span></div>${conn}`;
  }).join("")}</div>`;
}

// ── Workload View: أعباء العمل الحالية (Monday-style) ──
function renderWorkloadList() {
  const container = qs("workload-list");
  if (!container) return;
  const load = new Map();
  tenders.forEach((tender) => {
    departmentRows(tender).forEach((row) => {
      if (row.status === "completed") return;
      row.engineers.forEach((person) => {
        const name = personName(person);
        const key = `${name}|${row.short}`;
        if (!load.has(key)) {
          load.set(key, { name, dept: row.short, title: personTitle(person), active: 0, late: 0 });
        }
        const item = load.get(key);
        item.active += 1;
        if (row.status === "late") item.late += 1;
      });
    });
  });
  const sorted = [...load.values()].sort((a, b) => b.active - a.active || b.late - a.late);
  if (!sorted.length) {
    container.innerHTML = `<div class="activity-empty">لا توجد مهام نشطة حالياً.</div>`;
    return;
  }
  container.innerHTML = sorted.slice(0, 12).map((item) => {
    const isOverload = item.active >= 3;
    const hasLate = item.late > 0;
    const avatarClass = hasLate ? "wl-danger" : isOverload ? "wl-warn" : "wl-ok";
    const initials = item.name.split(" ").slice(0, 2).map((w) => w[0]).join("");
    const lateTag = item.late ? `<span class="wl-late-tag">${item.late} متأخرة</span>` : "";
    return `
      <div class="wl-person-card">
        <div class="wl-person-top">
          <span class="wl-avatar ${avatarClass}">${safe(initials)}</span>
          <div class="wl-person-info">
            <strong class="wl-name">${safe(item.name)}</strong>
            <small class="wl-dept">${safe(item.dept)}${item.title ? ` · ${safe(item.title)}` : ""}</small>
          </div>
        </div>
        <div class="wl-person-foot">
          <span class="wl-task-count ${avatarClass}">${item.active} مهمة</span>
          ${lateTag}
        </div>
      </div>
    `;
  }).join("");
}

function renderStatusChart() {
  const container = qs("status-dist-chart");
  if (!container) return;
  const counts = { new: 0, active: 0, late: 0, ready: 0, approved: 0 };
  tenders.forEach((tender) => {
    const s = tenderStage(tender);
    if (s in counts) counts[s] += 1;
  });
  const total = tenders.length || 1;
  const rows = [
    { key: "new",      label: "مهام جديدة",      color: "var(--blue)" },
    { key: "active",   label: "قيد العمل",        color: "var(--amber)" },
    { key: "late",     label: "متأخرة",           color: "var(--red)" },
    { key: "ready",    label: "جاهزة",            color: "var(--green)" },
    { key: "approved", label: "معتمدة",           color: "var(--navy)" }
  ];
  container.innerHTML = rows.filter((r) => counts[r.key] > 0).map((r) => {
    const pct = Math.round((counts[r.key] / total) * 100);
    return `
      <div class="sdc-row">
        <span class="sdc-label">${safe(r.label)}</span>
        <div class="sdc-track"><i style="width:${pct}%;background:${r.color}"></i></div>
        <span class="sdc-val">${counts[r.key]}</span>
      </div>
    `;
  }).join("");
}

function renderDeptChart() {
  const container = qs("dept-comp-chart");
  if (!container) return;
  container.innerHTML = departments.map((dept) => {
    const rows = tenders.map((tender) => departmentRows(tender).find((r) => r.key === dept.key)).filter(Boolean);
    const total = rows.length || 1;
    const completed = rows.filter((r) => r.status === "completed").length;
    const hasLate = rows.some((r) => r.status === "late");
    const pct = Math.round((completed / total) * 100);
    const barClass = hasLate ? "bar-danger" : pct >= 75 ? "bar-good" : pct >= 40 ? "bar-ok" : "bar-warn";
    return `
      <div class="dcc-row">
        <span class="dcc-code">${safe(dept.short)}</span>
        <div class="dcc-track"><i class="${barClass}" style="width:${Math.max(pct, 4)}%"></i></div>
        <span class="dcc-pct">${pct}%</span>
      </div>
    `;
  }).join("");
}

function smartAlerts() {
  const alerts = [];
  tenders.forEach((tender) => {
    const left = daysLeft(tender.submitDate);
    if (left !== Infinity && left <= 3) {
      const label = left < 0 ? "متأخرة" : left === 0 ? "اليوم" : `بعد ${left} ${left === 1 ? "يوم" : "أيام"}`;
      const tone  = left <= 0 ? "danger" : left === 1 ? "warning" : "soft";
      alerts.push({ type: "deadline", tone, title: "موعد إغلاق قريب", label, text: tender.title, sub: tender.client });
    }
    if (tender.guarantee) {
      const gLeft = daysLeft(tender.guarantee);
      if (gLeft !== Infinity && gLeft <= 3) {
        const label = gLeft < 0 ? "متأخر" : gLeft === 0 ? "اليوم" : `بعد ${gLeft} ${gLeft === 1 ? "يوم" : "أيام"}`;
        const tone  = gLeft <= 0 ? "danger" : gLeft === 1 ? "warning" : "soft";
        alerts.push({ type: "guarantee", tone, title: "ضمان ابتدائي مستحق", label, text: tender.title, sub: tender.client });
      }
    }
  });
  alerts.sort((a, b) => {
    const order = { danger: 0, warning: 1, soft: 2 };
    return (order[a.tone] ?? 3) - (order[b.tone] ?? 3);
  });
  return alerts;
}

function renderSmartAlerts() {
  const container = qs("smart-alerts");
  if (!container) return;
  const alerts = smartAlerts();
  container.innerHTML = alerts.length ? alerts.map((alert) => `
    <article class="smart-alert ${safe(alert.tone)}">
      <strong>${safe(alert.title)}</strong>
      <span>${safe(alert.text)}</span>
    </article>
  `).join("") : `
    <article class="smart-alert good">
      <strong>الوضع مستقر</strong>
      <span>لا توجد تنبيهات تشغيلية حرجة الآن.</span>
    </article>
  `;
}

function renderRole() {
  const deptName = (departments.find((d) => d.key === currentDepartmentKey()) || {}).name || "قسمي";
  const label = qs("role-label");
  const note = qs("role-note");
  if (isApprover()) {
    if (label) label.textContent = "اعتماد نهائي — مدير الإدارة/مالك الموقع";
    if (note) note.textContent = "تنقل المنافسات من «جاهزة للاعتماد» إلى «معتمدة»";
  } else if (isTeamLeader()) {
    if (label) label.textContent = `قائد فريق — ${deptName}`;
    if (note) note.textContent = "تُسند الفرق وتنقل من «جديدة» إلى «قيد العمل» ثم «جاهزة للاعتماد»";
    if (selectedDepartment === "all") selectedDepartment = currentDepartmentKey();
  } else if (isExecutive()) {
    if (label) label.textContent = "عرض تنفيذي — شامل";
    if (note) note.textContent = "متابعة كل الأقسام دون صلاحية نقل على اللوحة";
  } else {
    if (label) label.textContent = "عرض الموظف — مهامي";
    if (note) note.textContent = "تظهر المهام المسندة إليك فقط";
    if (selectedDepartment === "all") selectedDepartment = currentDepartmentKey();
  }
  // زر تصفير اللوحة يظهر لمالك الموقع/مدير الإدارة فقط
  const resetBtn = qs("reset-board-btn");
  if (resetBtn) resetBtn.hidden = !isOwner();
}

function boardColumn(tender) {
  const approval = savedState[tender.id]?.approval;
  if (approval === "approved") return "approved";
  const state = tenderState(tender);
  if (state === "ready") return "ready";
  const left = daysLeft(tender.submitDate);
  // عمود «متأخرة»: فقط المنافسات التي تجاوزت موعد تقديمها فعلا
  if (left < 0) return "late";
  const rows = departmentRows(tender);
  const anyCompleted = rows.some((row) => row.status === "completed");
  // «مهام جديدة»: لم يُسنِد قائد الفريق فريقا فعليا بعد (نتجاهل التعبئة التلقائية)
  const hasTeamAssigned = departments.some((d) => savedAssignedNames(tender.id, d.key).length > 0);
  if (!anyCompleted && !hasTeamAssigned) return "new";
  return "active";
}

// المرحلة المعروضة على اللوحة: يدوية (سحب) إن وُجدت، وإلا محسوبة تلقائيا
function tenderStage(tender) {
  const manual = savedState[tender.id]?.stage;
  if (manual && KANBAN_COLUMNS.some((col) => col.key === manual)) return manual;
  return boardColumn(tender);
}

// ── منطق الأعمدة الصارم: مَن ينقل ومِن أين إلى أين ──
// قادة الفرق: «مهام جديدة» → «قيد العمل» ثم «قيد العمل» → «جاهزة للاعتماد»
// المعتمِدون: «جاهزة للاعتماد» → «معتمدة»
// «متأخرة» (متجاوزة الموعد) يدفعها القائد للأمام ويعتمدها المعتمِد
function allowedStageTargets(fromStage) {
  if (isTeamLeader()) {
    if (fromStage === "new")    return ["active"];
    if (fromStage === "active") return ["ready"];
    if (fromStage === "late")   return ["ready"]; // إنهاء المتأخرة وتجهيزها للاعتماد
  }
  if (isApprover()) {
    if (fromStage === "ready")  return ["approved"];
  }
  return [];
}

function canMoveStage(fromStage, toStage) {
  return allowedStageTargets(fromStage).includes(toStage);
}

function canDragStage(stage) {
  return allowedStageTargets(stage).length > 0;
}

// نقل منافسة إلى عمود عبر السحب والإفلات
function setTenderStage(tenderId, stage) {
  if (!KANBAN_COLUMNS.some((col) => col.key === stage)) return;
  const tender = tenders.find((item) => item.id === tenderId);
  if (!tender) return;
  // حارس الصلاحية الصارم: ارفض أي نقل غير مسموح به للدور الحالي
  if (!canMoveStage(tenderStage(tender), stage)) return;
  savedState[tenderId] = savedState[tenderId] || {};
  let approvalChange;
  if (stage === "approved") {
    savedState[tenderId].approval = "approved";
    approvalChange = "approved";
  } else if (savedState[tenderId].approval === "approved") {
    savedState[tenderId].approval = "";
    approvalChange = "";
  }
  if (stage === "ready") completeAllDepartments(tenderId, { skipWrite: true });
  // إن طابقت المرحلة المحسوبة تلقائيا نمسح التجاوز ليبقى السجل نظيفا
  const autoAfter = boardColumn(tender);
  if (stage === autoAfter) delete savedState[tenderId].stage;
  else savedState[tenderId].stage = stage;
  writeState();
  if (window.SB?.enabled) {
    if (approvalChange !== undefined) window.SB.setApproval(tenderId, approvalChange);
    window.SB.setStageOverride(tenderId, savedState[tenderId].stage || null);
  }
  addActivityEntry(tenderId, tender.title, "stage", `نقل إلى: ${columnLabel(stage)}`);
}

// اعتماد إكمال كل أقسام المنافسة دفعة واحدة
function completeAllDepartments(tenderId, options = {}) {
  savedState[tenderId] = savedState[tenderId] || {};
  savedState[tenderId].departments = savedState[tenderId].departments || {};
  savedState[tenderId].timing = savedState[tenderId].timing || {};
  departments.forEach((dept) => {
    savedState[tenderId].departments[dept.key] = "completed";
    savedState[tenderId].timing[dept.key] = savedState[tenderId].timing[dept.key] || {};
    if (!savedState[tenderId].timing[dept.key].completedAt) {
      savedState[tenderId].timing[dept.key].completedAt = new Date().toISOString();
    }
    if (window.SB?.enabled) window.SB.setDeptStatus(tenderId, dept.key, "completed");
  });
  if (!options.skipWrite) writeState();
}

function renderKpis() {
  const source = tenders;
  const ready = source.filter((tender) => tenderState(tender) === "ready").length;
  const late = source.filter((tender) => tenderStage(tender) === "late").length;
  const unassigned = source.reduce((sum, tender) => sum + departmentRows(tender).filter((row) => !row.engineers.length).length, 0);
  const files = source.reduce((sum, tender) => sum + departmentRows(tender).reduce((inner, dept) => inner + dept.files, 0), 0);
  setText("kpi-active", source.length);
  setText("kpi-ready", ready);
  setText("kpi-late", late);
  setText("kpi-attention", source.length - ready);
  setText("kpi-unassigned", unassigned);
  setText("kpi-files", files);
}

function setText(id, value) {
  const el = qs(id);
  if (el) el.textContent = value;
}

function renderFilterCounts() {
  const cols = { all: tenders.length, new: 0, active: 0, late: 0, ready: 0 };
  tenders.forEach((tender) => {
    const col = tenderStage(tender);
    if (cols[col] !== undefined && col !== "all") cols[col] += 1;
  });
  setText("count-all", cols.all);
  setText("count-new", cols.new);
  setText("count-active", cols.active);
  setText("count-late", cols.late);
  setText("count-ready", cols.ready + tenders.filter((tender) => tenderStage(tender) === "approved").length);
}

function employeeMetrics() {
  const metrics = new Map();
  const now = new Date();

  function ensure(name, department) {
    if (!metrics.has(name)) {
      metrics.set(name, {
        name,
        department,
        title: "",
        assigned: 0,
        completed: 0,
        open: 0,
        late: 0,
        onTime: 0,
        files: 0,
        totalHours: 0,
        fastest: Infinity,
        slowest: 0,
        currentLoadHours: 0,
        score: 0
      });
    }
    return metrics.get(name);
  }

  tenders.forEach((tender) => {
    departmentRows(tender).forEach((row, index) => {
      const timeline = timelineFor(tender, row.key, index, row.status);
      const engineers = row.engineers;
      if (!engineers.length) return;
      const fileShare = row.files / engineers.length;
      engineers.forEach((engineer) => {
        const item = ensure(personName(engineer), row.short);
        item.title = item.title || personTitle(engineer);
        item.assigned += 1;
        item.files += fileShare;
        if (row.status === "completed" && timeline.completedAt) {
          const duration = hoursBetween(timeline.assignedAt, timeline.completedAt);
          item.completed += 1;
          item.totalHours += duration;
          item.fastest = Math.min(item.fastest, duration);
          item.slowest = Math.max(item.slowest, duration);
          if (new Date(timeline.completedAt) <= new Date(tender.submitDate)) item.onTime += 1;
        } else {
          item.open += 1;
          item.currentLoadHours += hoursBetween(timeline.assignedAt, now);
          if (row.status === "late") item.late += 1;
        }
      });
    });
  });

  return [...metrics.values()].map((item) => {
    const avgHours = item.completed ? item.totalHours / item.completed : 0;
    const completionRate = item.assigned ? item.completed / item.assigned : 0;
    const onTimeRate = item.completed ? item.onTime / item.completed : 0;
    const speedBonus = avgHours ? Math.max(0, 32 - avgHours / 4) : 0;
    item.avgHours = avgHours;
    item.completionRate = completionRate;
    item.onTimeRate = onTimeRate;
    item.score = Math.max(0, Math.round((completionRate * 42) + (onTimeRate * 28) + speedBonus + Math.min(item.files, 18) - (item.late * 12)));
    if (!Number.isFinite(item.fastest)) item.fastest = 0;
    return item;
  }).sort((a, b) => b.score - a.score || b.completed - a.completed || a.avgHours - b.avgHours);
}

function renderEmployeePerformance() {
  const metrics = employeeMetrics();
  const top = metrics[0];
  const avg = metrics.filter((item) => item.completed).reduce((sum, item, _, arr) => sum + (item.avgHours / arr.length), 0);
  const openTasks = metrics.reduce((sum, item) => sum + item.open, 0);
  const lateTasks = metrics.reduce((sum, item) => sum + item.late, 0);

  qs("kpi-best-score").textContent = top ? top.score : 0;
  qs("employee-summary").innerHTML = `
    <article>
      <span>أفضل أداء</span>
      <strong>${safe(top?.name || "-")}</strong>
      <small>${top ? `${top.department} · ${top.title || "فريق العمل"} · ${top.completed} مهمة مكتملة` : "-"}</small>
    </article>
    <article>
      <span>متوسط الإنجاز</span>
      <strong>${formatHours(avg)}</strong>
      <small>من وقت التعيين إلى Complete</small>
    </article>
    <article>
      <span>مهام مفتوحة</span>
      <strong>${openTasks}</strong>
      <small>قيد العمل لدى المهندسين</small>
    </article>
    <article>
      <span>مهام متأخرة</span>
      <strong>${lateTasks}</strong>
      <small>تحتاج متابعة مباشرة</small>
    </article>
  `;

  qs("employee-ranking").innerHTML = metrics.slice(0, 8).map((item, index) => `
    <div class="rank-card ${index === 0 ? "is-top" : ""}">
      <div class="rank-index">${index + 1}</div>
      <div>
        <strong>${safe(item.name)}</strong>
        <span>${safe(item.department)} · ${safe(item.title || "فريق العمل")} · ${item.assigned} مهمة · ${item.completed} مكتملة</span>
      </div>
      <b>${item.score}</b>
    </div>
  `).join("");

  const maxScore = Math.max(...metrics.map((item) => item.score), 1);
  qs("employee-time-grid").innerHTML = metrics.slice(0, 10).map((item) => `
    <div class="time-row">
      <div>
        <strong>${safe(item.name)}</strong>
        <span>${safe(item.department)} · ${safe(item.title || "فريق العمل")} · متوسط ${formatHours(item.avgHours)} · أسرع ${formatHours(item.fastest)}</span>
      </div>
      <div class="time-track"><i style="width:${Math.max(8, (item.score / maxScore) * 100)}%"></i></div>
      <em>${item.open} مفتوحة</em>
    </div>
  `).join("");
}

const DEPT_COLORS = {
  all:    "#64748b",
  BS:     "#0f766e",
  INF:    "#1d4ed8",
  TECH:   "#6d28d9",
  DESIGN: "#be185d",
  FIN:    "#b45309",
  HR:     "#0369a1",
  OPS:    "#15803d",
  LEGAL:  "#7e22ce",
  PROC:   "#c2410c",
  QA:     "#0e7490",
};
const DEPT_PALETTE = ["#0f766e","#1d4ed8","#6d28d9","#be185d","#b45309","#0369a1","#15803d","#0e7490","#c2410c","#7e22ce"];

function deptAccent(key, index) {
  return DEPT_COLORS[key] || DEPT_PALETTE[index % DEPT_PALETTE.length];
}

function renderDepartments() {
  const executive = isExecutive();
  const departmentButtons = executive
    ? [{ key: "all", name: "كل الإدارات", short: "ALL", virtual: true }, ...departments]
    : departments.filter((dept) => dept.key === currentDepartmentKey());

  qs("department-list").innerHTML = departmentButtons.map((dept, i) => {
    const accent = deptAccent(dept.key, i);
    const stats = dept.key === "all"
      ? {
        open: tenders.filter((tender) => tenderStage(tender) !== "ready" && tenderStage(tender) !== "approved").length,
        completed: tenders.filter((tender) => tenderState(tender) === "ready").length,
        late: tenders.filter((tender) => tenderStage(tender) === "late").length,
        unassigned: tenders.reduce((sum, tender) => sum + departmentRows(tender).filter((row) => row.key === "TECH" && !row.engineers.length).length, 0),
        load: tenders.length ? Math.round((tenders.filter((tender) => tenderStage(tender) !== "ready" && tenderStage(tender) !== "approved").length / tenders.length) * 100) : 0
      }
      : departmentStats(dept);
    const flag = stats.late >= 2 ? "risk" : stats.late === 1 ? "busy" : stats.load > 80 ? "busy" : "calm";
    const status = flag === "risk" ? "خطر" : flag === "busy" ? "مزدحم" : "هادئ";
    const meta = [
      `${stats.open} مفتوحة`,
      `${stats.completed} مكتملة`,
      stats.late ? `<span class="m-late">${stats.late} متأخرة</span>` : "",
      stats.unassigned ? `<span class="m-warn">${stats.unassigned} غير مسندة</span>` : ""
    ].filter(Boolean).join('<i class="dept-sep"></i>');
    const libLink = dept.virtual ? "" : getDeptLibraryLink(dept.key);
    const canEditLib = !dept.virtual && (isExecutive() || (isDeptManager() && dept.key === currentDepartmentKey()));
    return `
      <div class="dept-card-wrap">
        <button class="dept-card ${selectedDepartment === dept.key ? "active" : ""}" type="button" data-department="${safe(dept.key)}" style="--da:${accent}">
          <div class="dept-card-body">
            <div class="dept-card-header">
              <span class="dept-card-badge">${safe(dept.short)}</span>
              <div class="dept-card-titles">
                <strong>${safe(dept.name)}</strong>
                ${dept.manager ? `<small>${safe(dept.manager)}</small>` : ""}
              </div>
            </div>
            <div class="dept-card-metrics">
              <div class="dept-metric"><b>${stats.open}</b><span>نشطة</span></div>
              <div class="dept-metric"><b>${stats.completed}</b><span>مكتملة</span></div>
              <div class="dept-metric ${stats.late ? "is-late" : ""}"><b>${stats.late}</b><span>متأخرة</span></div>
            </div>
            <div class="dept-card-prog">
              <div class="dept-prog-track"><div class="dept-prog-fill" style="width:${Math.min(stats.load, 100)}%"></div></div>
              <div class="dept-prog-label"><span>حجم العمل</span><span>${stats.load}%</span></div>
            </div>
          </div>
        </button>
        ${dept.virtual ? "" : `
          <div class="dept-lib-card ${libLink ? "has-link" : "no-link"}">
            <div class="dept-lib-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div class="dept-lib-text">
              <strong>مكتبة القسم</strong>
              <span>${libLink ? "رابط SharePoint مُضبط" : "الرابط لم يُضبط بعد"}</span>
            </div>
            <div class="dept-lib-actions">
              ${libLink
                ? `<button class="dept-lib-open" type="button" data-dept-lib="${safe(dept.key)}">فتح ↗</button>`
                : (canEditLib ? `<button class="dept-lib-add" type="button" data-dept-lib-edit="${safe(dept.key)}">+ إضافة</button>` : "")}
              ${libLink && canEditLib ? `<button class="dept-lib-edit" type="button" data-dept-lib-edit="${safe(dept.key)}" title="تعديل الرابط">✏</button>` : ""}
            </div>
          </div>
        `}
      </div>
    `;
  }).join("");

  const active = departmentButtons.find((dept) => dept.key === selectedDepartment);
  qs("toolbar-title").textContent = active ? active.name : "كل الأقسام";
}

const KANBAN_COLUMNS = [
  { key: "new",      label: "مهام جديدة",      role: "قادة الفرق",            flows: true,  hint: "صلاحية قادة الفرق · تعيين الفريق ينقلها تلقائيا إلى «قيد العمل»" },
  { key: "active",   label: "قيد العمل",        role: "قادة الفرق",            flows: true,  hint: "صلاحية قادة الفرق · تُنقل عند الانتهاء إلى «جاهزة للاعتماد»" },
  { key: "late",     label: "متأخرة",           role: "متابعة عاجلة",          flows: true,  hint: "تجاوزت موعد التقديم · يُنهيها قائد الفريق وينقلها إلى «جاهزة للاعتماد»" },
  { key: "ready",    label: "جاهزة للاعتماد",   role: "مدير الإدارة + المالك", flows: true,  hint: "الاعتماد لمدير الإدارة ومالك الموقع فقط · يُنقل إلى «معتمدة»" },
  { key: "approved", label: "معتمدة",           role: "مكتملة",                flows: false, hint: "اكتمل مسار المنافسة" }
];

function columnLabel(col) {
  return { new: "جديدة", active: "قيد العمل", late: "متأخرة", ready: "جاهزة", approved: "معتمدة" }[col] || col;
}

function isUrgentClose(label) {
  return label === "اليوم" || label === "متأخر";
}

function daysLeft(dateValue) {
  const target = new Date(dateValue);
  if (Number.isNaN(target.getTime())) return Infinity;
  return Math.ceil((target - new Date()) / DAY_MS);
}

// نقاط مخاطرة المنافسة: تأخر + غير مسند + قرب الإغلاق
function riskScore(tender) {
  const rows = departmentRows(tender);
  const stage = tenderStage(tender);
  const late = rows.filter((row) => row.status === "late").length;
  const unassigned = rows.filter((row) => !row.engineers.length).length;
  const left = daysLeft(tender.submitDate);
  let score = late * 3;
  // نقص التعيين يُحتسب خطرا فقط للمهام التي بدأت فعلا أو اقترب موعدها
  // (المهمة الجديدة البعيدة عن الموعد ليست خطرا — هي بانتظار الإسناد طبيعيا)
  if (stage !== "new" || left <= 5) score += unassigned * 2;
  if (left <= 0) score += 5;
  else if (left <= 2) score += 3;
  else if (left <= 5) score += 1;
  if (savedState[tender.id]?.approval === "approved") score = 0;
  const level = score >= 6 ? "high" : score >= 3 ? "watch" : "ok";
  return { score, level, late, unassigned, left };
}

function riskLabel(level) {
  return { high: "مخاطرة عالية", watch: "تحتاج انتباه", ok: "تحت السيطرة" }[level] || "";
}

function renderDeadlineBar() {
  const bar = qs("deadline-bar");
  if (!bar) return;
  const upcoming = tenders
    .filter((tender) => savedState[tender.id]?.approval !== "approved")
    .map((tender) => ({ tender, left: daysLeft(tender.submitDate), rows: departmentRows(tender) }))
    .filter((item) => Number.isFinite(item.left))
    .sort((a, b) => a.left - b.left)
    .slice(0, 5);

  if (!upcoming.length) {
    bar.innerHTML = "";
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  bar.innerHTML = `
    <div class="deadline-bar-head">
      <span class="deadline-pulse"></span>
      <strong>مواعيد إغلاق قريبة</strong>
    </div>
    <div class="deadline-track">
      ${upcoming.map(({ tender, left, rows }) => {
        const urgency = left <= 0 ? "over" : left <= 2 ? "soon" : "ok";
        const text = left < 0 ? `متأخرة ${Math.abs(left)} يوم` : left === 0 ? "تغلق اليوم" : `بعد ${left} يوم`;
        return `
          <button class="deadline-chip ${urgency}" type="button" data-tender="${safe(tender.id)}" data-dept="${safe(rows[0].key)}" title="${safe(tender.title)}">
            <em>${safe(text)}</em>
            <span>${safe(tender.title)}</span>
            <small>${safe(tender.client)}</small>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderKanban() {
  const board = qs("kanban");
  if (!board) return;
  const list = visibleTenders();
  let columns = KANBAN_COLUMNS;
  if (selectedFilter !== "all") {
    const allowed = selectedFilter === "ready" ? ["ready", "approved"] : [selectedFilter];
    columns = KANBAN_COLUMNS.filter((col) => allowed.includes(col.key));
  }
  const canManage = isTeamLeader() || isApprover();
  board.classList.toggle("can-drag", canManage);
  const flowArrowSvg = `<svg class="kan-col-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>`;
  board.innerHTML = columns.map((col) => {
    const cards = list.filter((tender) => tenderStage(tender) === col.key);
    // هل يمكن للدور الحالي إفلات بطاقة في هذا العمود؟ (لتلوين العمود كهدف صالح)
    const isDropTarget = canManage && KANBAN_COLUMNS.some((c) => canMoveStage(c.key, col.key));
    return `
      <div class="kan-col${isDropTarget ? " is-droppable" : ""}" data-col="${col.key}">
        <div class="kan-col-head">
          <span class="kan-col-title"><i></i>${safe(col.label)}</span>
          <span class="kan-col-count">${cards.length}</span>
        </div>
        <div class="kan-col-role" data-role-col="${col.key}" title="${safe(col.hint || "")}">
          <span class="kan-col-role-tag">${safe(col.role || "")}</span>
          ${col.flows ? flowArrowSvg : ""}
        </div>
        <div class="kan-col-body" data-drop="${col.key}">
          ${cards.length ? cards.map(renderKanCard).join("") : `<div class="kan-empty">${isDropTarget ? "أفلت ملفا هنا" : "لا توجد ملفات هنا"}</div>`}
        </div>
      </div>
    `;
  }).join("");
}

function quickEngineerOptions(dept) {
  const pool = dept ? assignableEmployees(dept) : [];
  return `<option value="">إسناد سريع…</option>` + pool.map((person) => `<option value="${safe(personName(person))}">${safe(personName(person))} · ${safe(assignmentRoleLabel(person))}</option>`).join("");
}

function renderKanCard(tender) {
  const rows = departmentRows(tender);
  const col = tenderStage(tender);
  const close = daysTo(tender.submitDate);
  const urgent = isUrgentClose(close);
  const approval = savedState[tender.id]?.approval || "";
  const risk = riskScore(tender);
  // أدوات الإدارة (التحديد الجماعي) تظهر لمن يملك صلاحية تشغيلية، والسحب فقط للبطاقات المسموح نقلها
  const canManage = isTeamLeader() || isApprover();
  const canDragCard = canDragStage(col);
  const isSelected = selectedIds.has(tender.id);
  const stateTag = approval === "approved" ? "معتمد" : columnLabel(col);
  const bic = ballInCourt(tender);
  const hasHeadEnd = risk.level === "high" || canManage;
  const headEnd = hasHeadEnd ? `<div class="kan-head-end">
    ${risk.level === "high" ? `<span class="kan-risk-dot" title="${safe(riskLabel(risk.level))}"></span>` : ""}
    ${canManage ? `<label class="kan-select" data-stop-open title="تحديد للإجراء الجماعي"><input type="checkbox" data-select="${safe(tender.id)}" ${isSelected ? "checked" : ""}></label>` : ""}
  </div>` : "";
  const hasHead = bic || hasHeadEnd;
  return `
    <article class="kan-card state-${col} ${isSelected ? "is-selected" : ""} ${canDragCard ? "is-draggable" : ""}" data-tender="${safe(tender.id)}" data-dept="${safe(rows[0].key)}" ${canDragCard ? 'draggable="true"' : ""}>
      ${hasHead ? `<div class="kan-head">
        ${bic ? `<span class="kan-bic-chip ${safe(bic.type)}" title="${safe(bic.label)}">${safe(shortBicLabel(bic))}</span>` : ""}
        ${headEnd}
      </div>` : ""}
      <h3 class="kan-title">${safe(tender.title)}</h3>
      <div class="kan-meta">
        <span class="kan-state-tag ${col}">${safe(stateTag)}</span>
        <span class="kan-close ${urgent ? "is-urgent" : ""}">${safe(close)}</span>
      </div>
    </article>
  `;
}

function renderTable() {
  const body = qs("table-body");
  if (!body) return;
  const list = visibleTenders();
  body.innerHTML = list.length ? list.map((tender) => {
    const rows = departmentRows(tender);
    const completed = rows.filter((row) => row.status === "completed").length;
    const pct = Math.round((completed / departments.length) * 100);
    const col = tenderStage(tender);
    const close = daysTo(tender.submitDate);
    const urgent = isUrgentClose(close);
    const approval = savedState[tender.id]?.approval || "";
    return `
      <tr data-tender="${safe(tender.id)}" data-dept="${safe(rows[0].key)}">
        <td><div class="tbl-title">${safe(tender.title)}<small>${safe(tender.id)}</small></div></td>
        <td>${safe(tender.client)}</td>
        <td>${safe(tender.sector)}</td>
        <td><div class="tbl-progress"><i><b style="width:${pct}%"></b></i><em>${pct}%</em></div></td>
        <td class="tbl-deadline ${urgent ? "urgent" : ""}">${safe(close)}</td>
        <td><span class="status-tag ${col}">${safe(columnLabel(col))}</span></td>
        <td>${approval ? safe(statusLabel(approval)) : "—"}</td>
      </tr>
    `;
  }).join("") : `<tr><td colspan="7"><div class="empty-state">لا توجد منافسات مطابقة للتصفية الحالية.</div></td></tr>`;
}

const CAL_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function renderCalendar() {
  const grid = qs("calendar-grid");
  const title = qs("cal-title");
  if (!grid || !title) return;
  const year = calendarRef.getFullYear();
  const month = calendarRef.getMonth();
  title.textContent = `${CAL_MONTHS[month]} ${year}`;
  const startDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const byDay = {};
  visibleTenders().forEach((tender) => {
    const date = new Date(tender.submitDate);
    if (Number.isNaN(date.getTime())) return;
    if (date.getFullYear() === year && date.getMonth() === month) {
      const day = date.getDate();
      (byDay[day] = byDay[day] || []).push(tender);
    }
  });
  let cells = "";
  for (let i = 0; i < startDay; i += 1) cells += `<div class="cal-cell empty"></div>`;
  for (let day = 1; day <= daysInMonth; day += 1) {
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
    const events = byDay[day] || [];
    cells += `
      <div class="cal-cell ${isToday ? "today" : ""}">
        <div class="cal-date">${day}</div>
        <div class="cal-events">
          ${events.map((tender) => {
            const col = tenderStage(tender);
            const cls = col === "late" ? "late" : (col === "ready" || col === "approved") ? "ready" : "";
            const rows = departmentRows(tender);
            return `<button class="cal-event ${cls}" type="button" data-tender="${safe(tender.id)}" data-dept="${safe(rows[0].key)}" title="${safe(tender.title)}">${safe(tender.title)}</button>`;
          }).join("")}
        </div>
      </div>
    `;
  }
  grid.innerHTML = cells;
}

// شريط تنقل بين أقسام المنافسة داخل الدرج مع حالة إكمال كل قسم
function renderDrawerDeptNav(tender, activeKey) {
  const nav = qs("drawer-dept-nav");
  if (!nav) return;
  const allRows = departmentRows(tender);
  const doneCount = allRows.filter((row) => row.status === "completed").length;
  // قائد الفريق/مدير القسم يرى قسمه فقط؛ التنفيذي والمعتمِد يريان كل الأقسام
  const navRows = isTeamLeader() ? allRows.filter((row) => row.key === currentDepartmentKey()) : allRows;
  nav.innerHTML = `
    ${navRows.map((row) => {
      const done = row.status === "completed";
      const isActive = row.key === activeKey;
      return `<button type="button" class="dept-chip-nav ${done ? "is-done" : ""} ${isActive ? "is-active" : ""}" data-dept-nav="${safe(row.key)}" title="${safe(row.name)}">
        <span class="dcn-mark">${done ? "✓" : ""}</span>
        <span class="dcn-code">${safe(row.short)}</span>
      </button>`;
    }).join("")}
    ${isTeamLeader() ? "" : `<span class="dept-nav-progress">${doneCount}/${allRows.length} مكتملة</span>`}
  `;
}

function openDrawer(tenderId, departmentKey) {
  const tender = tenders.find((item) => item.id === tenderId);
  // قائد الفريق/مدير القسم: يفتح ويعدّل قسمه فقط مهما كانت البطاقة المنقورة
  if (isTeamLeader()) departmentKey = currentDepartmentKey();
  const row = tender && departmentRows(tender).find((dept) => dept.key === departmentKey);
  if (!tender || !row) return;
  selectedContext = { tenderId, departmentKey };

  qs("drawer-department").textContent = `${row.short} - ${row.manager}`;
  qs("drawer-title").textContent = row.name;
  qs("drawer-subtitle").textContent = tender.title;
  qs("drawer-status").textContent = statusLabel(row.status);
  qs("drawer-engineers-count").textContent = row.engineers.length;
  qs("drawer-files-count").textContent = row.files;
  renderDrawerDeptNav(tender, departmentKey);
  const stepperEl = qs("drawer-wf-stepper");
  if (stepperEl) stepperEl.innerHTML = renderWorkflowStepper(tender);
  qs("drawer-tender-overview").innerHTML = `
    <div><span>العميل</span><strong>${safe(tender.client)}</strong></div>
    <div><span>القطاع</span><strong>${safe(tender.sector)}</strong></div>
    <div><span>موعد الإغلاق</span><strong>${safe(daysTo(tender.submitDate))}</strong></div>
    <div><span>تعليقات القسم</span><strong>${departmentComments(tender.id, row.key).length}</strong></div>
  `;
  const departmentIndex = departments.findIndex((dept) => dept.key === departmentKey);
  const timeline = timelineFor(tender, departmentKey, departmentIndex, row.status);
  qs("drawer-timing").innerHTML = `
    <div class="timing-item"><span>وصول المنافسة</span><strong>${formatDateTime(timeline.receivedAt)}</strong></div>
    <div class="timing-item"><span>إنشاء مهمة القسم</span><strong>${formatDateTime(timeline.taskCreatedAt)}</strong></div>
    <div class="timing-item"><span>تعيين المهندس</span><strong>${formatDateTime(timeline.assignedAt)}</strong></div>
    <div class="timing-item"><span>بداية العمل</span><strong>${formatDateTime(timeline.workStartedAt)}</strong></div>
    <div class="timing-item"><span>الإكمال</span><strong>${timeline.completedAt ? formatDateTime(timeline.completedAt) : "لم يكتمل"}</strong></div>
    <div class="timing-item is-total"><span>زمن إنجاز الموظف</span><strong>${timeline.completedAt ? formatHours(hoursBetween(timeline.assignedAt, timeline.completedAt)) : formatHours(hoursBetween(timeline.assignedAt, new Date()))}</strong></div>
  `;

  qs("drawer-engineers").innerHTML = row.engineers.length ? row.engineers.map((person, index) => `
    <div class="engineer-item">
      <span class="avatar">${safe(personName(person).slice(0, 1))}</span>
      <div>
        <strong>${safe(personName(person))}</strong>
        <span>${safe(personTitle(person) || (index === 0 ? "مسؤول رئيسي" : "مساند"))}</span>
      </div>
    </div>
  `).join("") : `
    <div class="engineer-item is-unassigned">
      <span class="avatar">!</span>
      <div>
        <strong>لا يوجد مهندس مطابق</strong>
        <span>${safe(row.assignmentNote || "الاسم المختصر في شيت العروض الفنية غير موجود داخل ملف منسوبي قسم العروض الفنية.")}</span>
      </div>
    </div>
  `;

  renderAssignmentTools(tender, row);

  qs("drawer-tasks").innerHTML = row.tasks.map((task, index) => `
    <div class="task-item">
      <div>
        <strong>${safe(task)}</strong>
        <span>${row.status === "completed" ? "تم الإنجاز" : index === 0 ? "قيد التنفيذ" : "بانتظار التحديث"}</span>
      </div>
      <span class="lane-status">${index + 1}</span>
    </div>
  `).join("");

  renderComments(tender.id, row.key);
  renderActivityLog(tender.id);

  const files = Array.from({ length: Math.max(row.files, 1) }, (_, index) => index + 1);
  qs("drawer-files").innerHTML = files.map((item) => `
    <div class="file-item">
      <div>
        <strong>${row.files ? `ملف القسم ${item}` : "لا توجد ملفات مرفوعة بعد"}</strong>
        <span>${safe(row.library)}</span>
      </div>
      <span class="lane-status">${row.files ? "SharePoint" : "فارغ"}</span>
    </div>
  `).join("");

  // اعتماد إكمال القسم: صلاحية قائد الفريق/مدير القسم لقسمه فقط (منطق صارم)
  const canComplete = isTeamLeader() && departmentKey === currentDepartmentKey();
  qs("complete-department").disabled = !canComplete || row.status === "completed";
  qs("complete-department").textContent = row.status === "completed" ? "القسم مكتمل" : "اعتماد إكمال القسم";
  qs("open-library").textContent = `فتح مكتبة ${row.short}`;
  if (qs("send-notif-btn")) qs("send-notif-btn").hidden = !isDeptManager();
  qs("detail-drawer").classList.add("open");
  qs("detail-drawer").setAttribute("aria-hidden", "false");
}

function renderComments(tenderId, departmentKey) {
  const comments = departmentComments(tenderId, departmentKey);
  const list = qs("drawer-comments");
  if (!list) return;
  list.innerHTML = comments.length ? comments.map((comment) => `
    <div class="comment-item">
      <strong>${safe(comment.by || "فريق العمل")}</strong>
      <span>${safe(formatDateTime(comment.at))}</span>
      <p>${safe(comment.text)}</p>
    </div>
  `).join("") : `
    <div class="comment-empty">لا توجد ملاحظات بعد.</div>
  `;
}

function renderActivityLog(tenderId) {
  const container = qs("drawer-activity");
  if (!container) return;
  const log = tenderActivityLog(tenderId);
  container.innerHTML = log.length ? log.slice(0, 25).map((entry) => `
    <div class="activity-item">
      <span class="activity-dot ${safe(entry.type)}"></span>
      <div>
        <strong>${safe(entry.text)}</strong>
        <span>${safe(entry.by)}</span>
        <em>${safe(formatDateTime(entry.at))}</em>
      </div>
    </div>
  `).join("") : `<div class="activity-empty">لا يوجد نشاط مسجل لهذه المنافسة بعد.</div>`;
}

function renderAssignmentTools(tender, row) {
  const container = qs("drawer-assignment-tools");
  if (!container) return;
  // التعيين صلاحية قائد الفريق/مدير القسم فقط (وهو ما ينقل المهمة من «جديدة» إلى «قيد العمل»)
  if (!isTeamLeader()) {
    container.innerHTML = `<div class="assignment-empty">التعيين متاح لقائد الفريق/مدير القسم فقط.</div>`;
    return;
  }
  // حماية صارمة: لا يعيّن قائد الفريق إلا داخل قسمه هو
  if (row.key !== currentDepartmentKey()) {
    container.innerHTML = `<div class="assignment-empty">يمكنك تعيين موظفي قسمك فقط.</div>`;
    return;
  }
  const pool = assignableEmployees(row);
  const selected = new Set(row.engineers.map(personName));
  if (!pool.length) {
    container.innerHTML = `<div class="assignment-empty">لا توجد قائمة موظفين متاحة لهذا القسم حتى الآن.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="assignment-controls">
      <label class="assignment-search">
        <span>بحث داخل القسم</span>
        <input type="search" data-assignment-search placeholder="اكتب اسم الموظف أو المسمى">
      </label>
      <div class="assignment-tabs" aria-label="تصفية قائمة القسم">
        <button type="button" class="active" data-assignment-filter="all">الكل</button>
        <button type="button" data-assignment-filter="engineer">مهندسون</button>
        <button type="button" data-assignment-filter="leader">قياديون</button>
        <button type="button" data-assignment-filter="support">دعم</button>
      </div>
      <small class="assignment-count" data-assignment-count></small>
    </div>
    <div class="assignment-roster">
      ${pool.map((person) => {
        const name = personName(person);
        const roleKey = assignmentRoleKey(person);
        const searchText = `${name} ${personTitle(person)} ${assignmentRoleLabel(person)}`;
        return `
          <label class="assign-person ${selected.has(name) ? "selected" : ""}" data-role="${safe(roleKey)}" data-search="${safe(searchText.toLowerCase())}">
            <input type="checkbox" name="engineer-assignment" value="${safe(name)}" ${selected.has(name) ? "checked" : ""}>
            <span>${safe(name.slice(0, 1))}</span>
            <b>${safe(name)}</b>
            <small>
              <i class="assign-tag">${safe(assignmentRoleLabel(person))}</i>
              ${safe(personTitle(person) || "فريق العمل")} · ${safe(personLoadLabel(name))}
            </small>
          </label>
        `;
      }).join("")}
    </div>
    <div class="assignment-actions">
      <button type="button" id="save-assignment">حفظ التعيين</button>
      <small>${row.key === "TECH" ? "يمكنك تصحيح أي اسم غير مطابق من الشيت بتعيين مهندس فعلي من القائمة." : "التعيين محفوظ محليا في نسخة التجربة الحالية."}</small>
    </div>
  `;

  const applyAssignmentFilter = () => {
    const activeFilter = container.querySelector("[data-assignment-filter].active")?.dataset.assignmentFilter || "all";
    const term = (container.querySelector("[data-assignment-search]")?.value || "").trim().toLowerCase();
    const people = [...container.querySelectorAll(".assign-person")];
    let shown = 0;
    people.forEach((person) => {
      const matchesRole = activeFilter === "all" || person.dataset.role === activeFilter;
      const matchesSearch = !term || (person.dataset.search || "").includes(term);
      const visible = matchesRole && matchesSearch;
      person.hidden = !visible;
      if (visible) shown += 1;
    });
    const count = container.querySelector("[data-assignment-count]");
    if (count) count.textContent = `${shown} ظاهر من ${people.length} موظف`;
  };

  container.querySelector("[data-assignment-search]")?.addEventListener("input", applyAssignmentFilter);
  container.querySelectorAll("[data-assignment-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      container.querySelectorAll("[data-assignment-filter]").forEach((item) => item.classList.toggle("active", item === button));
      applyAssignmentFilter();
    });
  });
  applyAssignmentFilter();

  const saveButton = qs("save-assignment");
  if (saveButton) {
    saveButton.addEventListener("click", () => {
      const names = [...container.querySelectorAll('input[name="engineer-assignment"]:checked')].map((input) => input.value);
      setAssignment(tender.id, row.key, names);
      openDrawer(tender.id, row.key);
      render();
    });
  }
}

function closeDrawer() {
  qs("detail-drawer").classList.remove("open");
  qs("detail-drawer").setAttribute("aria-hidden", "true");
}

function renderActiveView() {
  if (selectedView === "board") {
    renderKanban();
  } else if (selectedView === "table") {
    renderTable();
  } else if (selectedView === "calendar") {
    renderCalendar();
  } else if (selectedView === "analytics") {
    renderStatusChart();
    renderDeptChart();
    renderWorkloadList();
    renderInsights();
    renderSmartAlerts();
    renderEmployeePerformance();
  }
}

function switchView(view) {
  selectedView = view;
  prefs.view = view;
  writePrefs();
  document.querySelectorAll("#view-tabs button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  document.querySelectorAll(".ops-view").forEach((panel) => { panel.hidden = panel.dataset.view !== view; });
  renderActiveView();
}

function render() {
  renderRole();
  renderKpis();
  renderFilterCounts();
  renderDeadlineBar();
  renderDepartments();
  renderAdvancedFilters();
  renderActiveView();
  renderBulkBar();
  renderNotifications();
}

// شريط عائم للإجراءات الجماعية على المنافسات المحددة
function renderBulkBar() {
  let bar = qs("bulk-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "bulk-bar";
    bar.className = "bulk-bar";
    document.body.appendChild(bar);
  }
  // أزل المعرّفات التي لم تعد ظاهرة
  const visibleIds = new Set(tenders.map((tender) => tender.id));
  selectedIds.forEach((id) => { if (!visibleIds.has(id)) selectedIds.delete(id); });

  const count = selectedIds.size;
  if (!count) {
    bar.classList.remove("show");
    bar.innerHTML = "";
    return;
  }
  // نقل إلى «جاهزة» لقادة الفرق · «اعتماد» للمعتمِدين فقط
  const canReady = isTeamLeader();
  const canApprove = isApprover();
  bar.innerHTML = `
    <span class="bulk-count"><b>${count}</b> منافسة محددة</span>
    <div class="bulk-actions">
      <button type="button" data-bulk="ready" ${canReady ? "" : "disabled"}>نقل إلى جاهزة</button>
      <button type="button" data-bulk="approve" ${canApprove ? "" : "disabled"}>اعتماد المحدد</button>
      <button type="button" class="ghost" data-bulk="clear">إلغاء التحديد</button>
    </div>
  `;
  bar.classList.add("show");
}

function runBulkAction(action) {
  if (action === "clear") {
    selectedIds.clear();
    render();
    return;
  }
  // منطق صارم: «جاهزة» لقادة الفرق · «اعتماد» للمعتمِدين — ويُحترم المسار المسموح لكل بطاقة
  selectedIds.forEach((id) => {
    const tender = tenders.find((item) => item.id === id);
    if (!tender) return;
    const from = tenderStage(tender);
    if (action === "ready" && isTeamLeader() && canMoveStage(from, "ready")) {
      setTenderStage(id, "ready");
    } else if (action === "approve" && isApprover() && canMoveStage(from, "approved")) {
      setTenderStage(id, "approved");
    }
  });
  if (action === "approve") selectedIds.clear();
  render();
}

// مالك الموقع/مدير الإدارة فقط لهما حق تصفير اللوحة
function isOwner() {
  return isApprover();
}

// تصفير اللوحة: إلغاء كل التعيينات والحالات والمراحل والاعتمادات (تبقى الملاحظات)
// لإرجاع كل المنافسات إلى «مهام جديدة» وبدء العمل الفعلي
async function resetBoardToFresh() {
  if (!isOwner()) return;
  const ok = window.confirm(
    "سيتم إلغاء جميع التعيينات والحالات وإرجاع كل المنافسات إلى «مهام جديدة».\n" +
    "هذا الإجراء لا يمكن التراجع عنه. هل تريد المتابعة؟"
  );
  if (!ok) return;
  // امسح الحالة المحلية مع الإبقاء على الملاحظات
  Object.keys(savedState).forEach((id) => {
    if (!savedState[id]) return;
    delete savedState[id].assignments;
    delete savedState[id].departments;
    delete savedState[id].stage;
    delete savedState[id].approval;
    delete savedState[id].timing;
  });
  writeState();
  // امسح الحالة المشتركة على Supabase إن كانت مهيّأة
  if (window.SB?.enabled && window.SB.resetAllState) {
    const result = await window.SB.resetAllState();
    if (result && result.ok === false && result.errors?.length) {
      window.alert("تعذّر تصفير بعض البيانات على الخادم:\n" + result.errors.join("\n"));
    }
  }
  selectedIds.clear();
  render();
  window.alert("تم تصفير اللوحة. كل المنافسات الآن في «مهام جديدة» وجاهزة لبدء العمل الفعلي.");
}

// استعادة تفضيلات العرض المحفوظة على واجهة المستخدم
function applySavedPrefs() {
  applyTheme();
  applyDensity();
  document.querySelectorAll("#view-tabs button").forEach((button) => button.classList.toggle("active", button.dataset.view === selectedView));
  document.querySelectorAll(".ops-view").forEach((panel) => { panel.hidden = panel.dataset.view !== selectedView; });
  document.querySelectorAll("[data-filter]").forEach((button) => button.classList.toggle("active", button.dataset.filter === selectedFilter));
}

async function loadData() {
  try {
    await loadEmployees();
    await loadTechOffers();
    await loadLibraryLinksCache();
    let rows = null;
    // المصدر الأساسي: قاعدة بيانات Supabase (إن كانت مهيّأة)
    if (window.SB?.enabled) {
      try {
        const [dbTenders, dbState] = await Promise.all([
          window.SB.fetchTenders(),
          window.SB.fetchState()
        ]);
        if (Array.isArray(dbTenders) && dbTenders.length) {
          rows = dbTenders;
          if (dbState) savedState = dbState;
        }
      } catch (err) {
        console.warn("[loadData] Supabase fetch failed, falling back:", err);
      }
    }
    // احتياطي: ملف data.json الثابت
    if (!rows) {
      const sources = window.TENDER_PORTAL_CONFIG?.sources?.liveTenders || ["../data.json"];
      let data = null;
      for (const source of sources) {
        try {
          const response = await fetch(source, { cache: "no-store" });
          if (response.ok) {
            data = await response.json();
            break;
          }
        } catch {}
      }
      rows = Array.isArray(data?.tenders) ? data.tenders : fallbackTenders;
    }
    tenders = rows.map(normalizeTender);
  } catch {
    tenders = fallbackTenders;
  }
  applySavedPrefs();
  render();
  subscribeRealtime();
  loadDeptNotifications();
  subscribeDeptNotifsRealtime();
}

// يشترك في تحديثات قاعدة البيانات الفورية مرة واحدة فقط
let _realtimeSubscribed = false;

let _deptNotifSubscribed = false;
function subscribeDeptNotifsRealtime() {
  if (_deptNotifSubscribed || !window.SB?.enabled) return;
  _deptNotifSubscribed = true;
  window.SB.subscribeDeptNotifs(currentDepartmentKey(), async () => {
    await loadDeptNotifications();
  });
}
function subscribeRealtime() {
  if (_realtimeSubscribed || !window.SB?.enabled) return;
  _realtimeSubscribed = true;
  let pending = false;
  window.SB.subscribe(async () => {
    if (pending) return;
    pending = true;
    setTimeout(async () => {
      pending = false;
      try {
        const st = await window.SB.fetchState();
        if (st) { savedState = st; render(); }
      } catch {}
    }, 400);
  });
}

document.addEventListener("click", (event) => {
  // مكتبة القسم — زر التعديل (يجب أن يأتي قبل زر المكتبة العادي)
  const libEditBtn = event.target.closest("[data-dept-lib-edit]");
  if (libEditBtn) {
    event.stopPropagation();
    openSharePointConfig(libEditBtn.dataset.deptLibEdit);
    return;
  }

  // مكتبة القسم — زر الفتح
  const libBtn = event.target.closest("[data-dept-lib]");
  if (libBtn) {
    event.stopPropagation();
    const key = libBtn.dataset.deptLib;
    const link = getDeptLibraryLink(key);
    if (link) { window.open(link, "_blank", "noopener"); }
    else if (isExecutive() || (isDeptManager() && key === currentDepartmentKey())) { openSharePointConfig(key); }
    else { showToast("لم يتم ضبط رابط المكتبة بعد — تواصل مع مدير القسم"); }
    return;
  }

  const kpiCard = event.target.closest(".kpi[data-kpi-filter]");
  if (kpiCard) {
    selectedFilter = kpiCard.dataset.kpiFilter;
    prefs.filter = selectedFilter;
    writePrefs();
    document.querySelectorAll("[data-filter]").forEach((btn) => btn.classList.toggle("active", btn.dataset.filter === selectedFilter));
    switchView("board");
    return;
  }

  const deptButton = event.target.closest("[data-department]");
  if (deptButton) {
    selectedDepartment = deptButton.dataset.department;
    render();
    return;
  }

  const viewButton = event.target.closest("#view-tabs button[data-view]");
  if (viewButton) {
    switchView(viewButton.dataset.view);
    return;
  }

  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    selectedFilter = filterButton.dataset.filter;
    prefs.filter = selectedFilter;
    writePrefs();
    document.querySelectorAll("[data-filter]").forEach((button) => button.classList.toggle("active", button === filterButton));
    renderActiveView();
    return;
  }

  const bulkButton = event.target.closest("[data-bulk]");
  if (bulkButton && !bulkButton.disabled) {
    runBulkAction(bulkButton.dataset.bulk);
    return;
  }

  if (event.target.closest("#adv-clear")) {
    advFilters = { sector: "", client: "", from: "", to: "" };
    render();
    return;
  }

  if (event.target.closest("[data-stop-open]")) return;

  const opener = event.target.closest(".kan-card[data-tender][data-dept], .dept-chip[data-tender][data-dept], tr[data-tender][data-dept], .cal-event[data-tender][data-dept], .deadline-chip[data-tender][data-dept]");
  if (opener) {
    openDrawer(opener.dataset.tender, opener.dataset.dept);
    return;
  }

  const approve = event.target.closest("[data-approve]");
  if (approve && !approve.disabled) {
    if (!isApprover()) return; // الاعتماد النهائي للمعتمِدين فقط
    setApproval(approve.dataset.approve, "approved");
    render();
    return;
  }

  const reject = event.target.closest("[data-reject]");
  if (reject && !reject.disabled) {
    if (!isApprover()) return;
    setApproval(reject.dataset.reject, "rejected");
    render();
  }
});

qs("search-input").addEventListener("input", (event) => {
  searchTerm = event.target.value;
  renderActiveView();
});

document.addEventListener("keydown", (event) => {
  if ((event.key === "Enter" || event.key === " ") && event.target.closest(".kpi[data-kpi-filter]")) {
    event.preventDefault();
    event.target.closest(".kpi[data-kpi-filter]").click();
  }
});

qs("cal-prev")?.addEventListener("click", () => {
  calendarRef = new Date(calendarRef.getFullYear(), calendarRef.getMonth() - 1, 1);
  renderCalendar();
});
qs("cal-next")?.addEventListener("click", () => {
  calendarRef = new Date(calendarRef.getFullYear(), calendarRef.getMonth() + 1, 1);
  renderCalendar();
});

qs("drawer-close").addEventListener("click", closeDrawer);
qs("drawer-backdrop").addEventListener("click", closeDrawer);

qs("save-comment").addEventListener("click", () => {
  if (!selectedContext) return;
  const input = qs("comment-input");
  const text = input.value.trim();
  if (!text) return;
  addDepartmentComment(selectedContext.tenderId, selectedContext.departmentKey, text);
  input.value = "";
  openDrawer(selectedContext.tenderId, selectedContext.departmentKey);
});

qs("complete-department").addEventListener("click", () => {
  if (!selectedContext) return;
  const { tenderId, departmentKey } = selectedContext;
  setDepartmentStatus(tenderId, departmentKey, "completed");
  const tender = tenders.find((item) => item.id === tenderId);
  const allDone = tender && departmentRows(tender).every((row) => row.status === "completed");
  render();
  // إذا اكتملت كل الأقسام تُغلق وتنتقل البطاقة تلقائيا إلى "جاهزة للاعتماد"،
  // وإلا نُبقي الدرج مفتوحا ليكمل المستخدم القسم التالي
  if (allDone) closeDrawer();
  else openDrawer(tenderId, departmentKey);
});

qs("drawer-dept-nav").addEventListener("click", (event) => {
  const chip = event.target.closest("[data-dept-nav]");
  if (!chip || !selectedContext) return;
  openDrawer(selectedContext.tenderId, chip.dataset.deptNav);
});

qs("open-library").addEventListener("click", () => {
  if (!selectedContext) return;
  openDeptLibrary(selectedContext.departmentKey);
});

qs("config-sharepoint")?.addEventListener("click", openSharePointConfig);

qs("send-notif-btn")?.addEventListener("click", openSendNotifModal);

qs("sn-cancel")?.addEventListener("click", closeSendNotifModal);
qs("sn-modal-overlay")?.addEventListener("click", closeSendNotifModal);

qs("sn-send")?.addEventListener("click", async () => {
  const toDept = qs("sn-dept-select")?.value;
  if (!toDept || !selectedContext) return;
  const typeEl = document.querySelector("[name='sn-type']:checked");
  const type = typeEl?.value || "custom";
  const extra = qs("sn-message")?.value.trim() || "";
  const msg = extra || notifTypeDefaultMsg(type);
  if (!msg) { showToast("يرجى اختيار نوع الإشعار أو كتابة رسالة"); return; }
  const tender = tenders.find((t) => t.id === selectedContext.tenderId);
  if (window.SB?.enabled) {
    await window.SB.sendDeptNotification(
      currentDepartmentKey(), viewerName(),
      toDept, selectedContext.tenderId,
      tender?.title || selectedContext.tenderId,
      type, msg
    );
  }
  closeSendNotifModal();
  showToast("تم إرسال الإشعار بنجاح ✓");
});

// ── Notification bell ──
qs("notif-bell")?.addEventListener("click", (event) => {
  event.stopPropagation();
  if (qs("notif-panel").hidden) openNotifPanel();
  else closeNotifPanel();
});

document.addEventListener("click", (event) => {
  if (!qs("notif-wrap")?.classList.contains("open")) return;
  if (!qs("notif-wrap")?.contains(event.target)) closeNotifPanel();
}, true);

// ── Export CSV ──
qs("export-btn")?.addEventListener("click", exportCSV);

// ── تصفير اللوحة (مالك الموقع/مدير الإدارة) ──
qs("reset-board-btn")?.addEventListener("click", resetBoardToFresh);

// ── Theme + density toggles ──
qs("theme-toggle")?.addEventListener("click", toggleTheme);
qs("density-toggle")?.addEventListener("click", toggleDensity);

// ── SharePoint modal ──
qs("sp-save")?.addEventListener("click", () => {
  const url = qs("sp-url-input")?.value?.trim() || "";
  if (_spModalDeptKey) {
    saveDeptLibraryLink(_spModalDeptKey, url);
    renderDepartments();
  } else {
    saveSharePointBase(url);
  }
  closeSharePointConfig();
  if (selectedContext) openDeptLibrary(selectedContext.departmentKey);
});

qs("sp-cancel")?.addEventListener("click", closeSharePointConfig);
qs("sp-modal-overlay")?.addEventListener("click", closeSharePointConfig);

// ── التحديد الجماعي + التعيين السريع (أحداث change) ──
document.addEventListener("change", (event) => {
  const advField = event.target.closest("[data-adv]");
  if (advField) {
    advFilters[advField.dataset.adv] = advField.value;
    render();
    return;
  }

  const selectBox = event.target.closest("[data-select]");
  if (selectBox) {
    const id = selectBox.dataset.select;
    if (selectBox.checked) selectedIds.add(id);
    else selectedIds.delete(id);
    const card = selectBox.closest(".kan-card");
    if (card) card.classList.toggle("is-selected", selectBox.checked);
    renderBulkBar();
    return;
  }

  const deptSelect = event.target.closest(".kan-quick-dept");
  if (deptSelect) {
    const card = deptSelect.closest(".kan-card");
    const engSelect = card?.querySelector(".kan-quick-eng");
    const dept = departments.find((item) => item.key === deptSelect.value);
    if (engSelect) engSelect.innerHTML = quickEngineerOptions(dept);
    return;
  }

  const engSelect = event.target.closest(".kan-quick-eng");
  if (engSelect && engSelect.value) {
    const tenderId = engSelect.dataset.tender;
    const card = engSelect.closest(".kan-card");
    const deptKey = card?.querySelector(".kan-quick-dept")?.value;
    if (tenderId && deptKey) {
      setAssignment(tenderId, deptKey, [engSelect.value]);
      render();
    }
  }
});

// ── السحب والإفلات بين أعمدة اللوحة (للصلاحية التنفيذية) ──
(() => {
  const board = qs("kanban");
  if (!board) return;
  let draggingId = null;
  let draggingFrom = null;

  board.addEventListener("dragstart", (event) => {
    const card = event.target.closest(".kan-card[draggable='true']");
    if (!card) return;
    draggingId = card.dataset.tender;
    const dragged = tenders.find((item) => item.id === draggingId);
    draggingFrom = dragged ? tenderStage(dragged) : null;
    card.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    try { event.dataTransfer.setData("text/plain", draggingId); } catch {}
  });

  board.addEventListener("dragend", () => {
    draggingId = null;
    draggingFrom = null;
    board.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
    board.querySelectorAll(".drop-active").forEach((el) => el.classList.remove("drop-active"));
  });

  board.addEventListener("dragover", (event) => {
    const zone = event.target.closest(".kan-col[data-col]");
    if (!zone) return;
    // أبرز فقط الأعمدة المسموح للدور الحالي الإفلات فيها (منطق صارم)
    if (draggingFrom && !canMoveStage(draggingFrom, zone.dataset.col)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    board.querySelectorAll(".drop-active").forEach((el) => { if (el !== zone) el.classList.remove("drop-active"); });
    zone.classList.add("drop-active");
  });

  board.addEventListener("drop", (event) => {
    const zone = event.target.closest(".kan-col[data-col]");
    if (!zone) return;
    event.preventDefault();
    const id = draggingId || (() => { try { return event.dataTransfer.getData("text/plain"); } catch { return null; } })();
    zone.classList.remove("drop-active");
    if (!id) return;
    const tender = tenders.find((item) => item.id === id);
    // الحارس الصارم: لا نقل إلا إذا كان مسموحا للدور من المرحلة الحالية إلى الهدف
    if (!tender || !canMoveStage(tenderStage(tender), zone.dataset.col)) return;
    setTenderStage(id, zone.dataset.col);
    render();
  });
})();

loadData();
