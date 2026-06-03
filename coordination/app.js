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
// تطبيق السمة فوراً لتفادي وميض الوضع النهاري قبل تحميل البيانات
try {
  document.documentElement.setAttribute("data-theme", prefs.theme === "dark" ? "dark" : "light");
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
    const response = await fetch("./employees.json?v=1", { cache: "no-store" });
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
    submitDate: pick(row, ["تاريخ التقديم", "Submission", "submission", "date"], 2) || "2026-06-01"
  };
}

function statusFor(tender, deptIndex) {
  const state = savedState[tender.id]?.departments?.[departments[deptIndex].key];
  if (state) return state;
  const seed = [...String(tender.id)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) + deptIndex;
  if (seed % 4 === 0) return "completed";
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
  savedState[tenderId] = savedState[tenderId] || {};
  savedState[tenderId].assignments = savedState[tenderId].assignments || {};
  savedState[tenderId].assignments[departmentKey] = names;
  savedState[tenderId].timing = savedState[tenderId].timing || {};
  savedState[tenderId].timing[departmentKey] = savedState[tenderId].timing[departmentKey] || {};
  savedState[tenderId].timing[departmentKey].assignedAt = new Date().toISOString();
  writeState();
  if (window.SB?.enabled) window.SB.setAssignments(tenderId, departmentKey, names);
  const tender = tenders.find((t) => t.id === tenderId);
  const dept = departments.find((d) => d.key === departmentKey);
  if (tender && names.length) {
    addActivityEntry(tenderId, tender.title, "assign",
      `تعيين ${names.join("، ")} في ${dept?.name || departmentKey}`);
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
function getSharePointBase() {
  try { return localStorage.getItem(SP_KEY) || ""; } catch { return ""; }
}

function saveSharePointBase(url) {
  try { localStorage.setItem(SP_KEY, String(url || "").trim()); } catch {}
}

function openSharePointConfig() {
  const modal = qs("sp-modal");
  if (!modal) return;
  qs("sp-url-input").value = getSharePointBase();
  modal.hidden = false;
}

function closeSharePointConfig() {
  const modal = qs("sp-modal");
  if (modal) modal.hidden = true;
}

function openDeptLibrary(deptKey) {
  const dept = departments.find((d) => d.key === deptKey);
  const lib = dept?.library || deptKey;
  const base = getSharePointBase();
  if (!base) {
    openSharePointConfig();
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
function applyTheme() {
  const dark = prefs.theme === "dark";
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const btn = qs("theme-toggle");
  if (btn) {
    btn.setAttribute("aria-pressed", dark ? "true" : "false");
    btn.title = dark ? "الوضع النهاري" : "الوضع الليلي";
  }
}

function toggleTheme() {
  prefs.theme = prefs.theme === "dark" ? "light" : "dark";
  writePrefs();
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

// ── الإشعارات ──
function renderNotifications() {
  const countBadge = qs("notif-count");
  if (!countBadge) return;
  const alerts = smartAlerts();
  const critical = alerts.filter((a) => a.tone === "danger").length;
  if (critical > 0) {
    countBadge.textContent = critical;
    countBadge.hidden = false;
  } else {
    countBadge.hidden = true;
  }
}

function buildNotifPanel() {
  const panel = qs("notif-panel");
  if (!panel) return;
  const alerts = smartAlerts();
  panel.innerHTML = `
    <div class="notif-panel-head">
      <strong>الإشعارات (${alerts.length})</strong>
      <button type="button" id="notif-close" aria-label="إغلاق">×</button>
    </div>
    <div class="notif-items">
      ${alerts.length ? alerts.map((alert) => `
        <div class="notif-item ${safe(alert.tone)}">
          <strong>${safe(alert.title)}</strong>
          <span>${safe(alert.text)}</span>
        </div>
      `).join("") : `<div class="notif-empty">لا توجد إشعارات حرجة الآن.</div>`}
    </div>
  `;
  panel.querySelector("#notif-close")?.addEventListener("click", closeNotifPanel);
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
  const seed = [...String(tender.id)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) + index * 3;
  const count = (seed % 3) + 1;
  const pool = autoAssignableEmployees(dept);
  if (!pool.length) return [];
  return Array.from({ length: Math.min(count, pool.length) }, (_, offset) => pool[(seed + offset) % pool.length]);
}

function fileCount(tender, index) {
  const seed = [...String(tender.id)].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return (seed + index) % 5;
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
  return tenders.filter((tender) => {
    const visibleByRole = isExecutive() || selectedDepartment === "all" || selectedDepartment === currentDepartmentKey();
    const matchesDepartment = selectedDepartment === "all" || departmentRows(tender).some((row) => row.key === selectedDepartment);
    const column = tenderStage(tender);
    const matchesFilter = selectedFilter === "all"
      || column === selectedFilter
      || (selectedFilter === "ready" && column === "approved");
    const matchesSearch = !term || `${tender.title} ${tender.client} ${tender.sector}`.toLowerCase().includes(term);
    const matchesAdvanced = matchesAdvancedFilters(tender);
    return visibleByRole && matchesDepartment && matchesFilter && matchesSearch && matchesAdvanced;
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
  const now = new Date();
  tenders.forEach((tender) => {
    const rows = departmentRows(tender);
    const closeLabel = daysTo(tender.submitDate);
    rows.forEach((row, index) => {
      const timeline = timelineFor(tender, row.key, index, row.status);
      const assignmentAge = hoursBetween(timeline.taskCreatedAt, now);
      const workAge = hoursBetween(timeline.assignedAt, now);
      if (!row.engineers.length) {
        alerts.push({ tone: "danger", title: "مهمة غير مسندة", text: `${row.short} · ${tender.title}` });
      } else if (row.status !== "completed" && workAge > 48) {
        alerts.push({ tone: "warning", title: "مفتوحة أكثر من يومين", text: `${row.short} · ${formatHours(workAge)} · ${tender.title}` });
      } else if (row.status !== "completed" && assignmentAge > 6) {
        alerts.push({ tone: "soft", title: "تحتاج متابعة", text: `${row.short} · ${formatHours(assignmentAge)} منذ إنشاء المهمة` });
      }
    });
    if (rows.every((row) => row.status === "completed")) {
      alerts.push({ tone: "good", title: "جاهزة للاعتماد", text: tender.title });
    } else if (closeLabel.includes("اليوم") || closeLabel.includes("متأخر")) {
      alerts.push({ tone: "danger", title: "موعد إغلاق حرج", text: `${closeLabel} · ${tender.title}` });
    }
  });
  return alerts.slice(0, 6);
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
  const executive = isExecutive();
  qs("role-label").textContent = executive ? "مدير الإدارة - عرض شامل" : "مدير قسم - عرض محدود";
  qs("role-note").textContent = executive
    ? "تظهر كل الأقسام وأزرار الاعتماد النهائي عند اكتمال المسارات"
    : "تظهر مهام القسم المرتبط بصلاحيتك فقط";
  if (!executive && selectedDepartment === "all") selectedDepartment = currentDepartmentKey();
}

function boardColumn(tender) {
  const approval = savedState[tender.id]?.approval;
  if (approval === "approved") return "approved";
  const state = tenderState(tender);
  if (state === "ready") return "ready";
  const left = daysLeft(tender.submitDate);
  if (left <= 3) return "late";
  const rows = departmentRows(tender);
  const anyCompleted = rows.some((row) => row.status === "completed");
  const anyUnassigned = rows.some((row) => !row.engineers.length);
  if (!anyCompleted && anyUnassigned) return "new";
  return "active";
}

// المرحلة المعروضة على اللوحة: يدوية (سحب) إن وُجدت، وإلا محسوبة تلقائيا
function tenderStage(tender) {
  const manual = savedState[tender.id]?.stage;
  if (manual && KANBAN_COLUMNS.some((col) => col.key === manual)) return manual;
  return boardColumn(tender);
}

// نقل منافسة إلى عمود عبر السحب والإفلات
function setTenderStage(tenderId, stage) {
  if (!KANBAN_COLUMNS.some((col) => col.key === stage)) return;
  const tender = tenders.find((item) => item.id === tenderId);
  if (!tender) return;
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

function renderDepartments() {
  const executive = isExecutive();
  const departmentButtons = executive
    ? [{ key: "all", name: "كل الإدارات", short: "ALL", virtual: true }, ...departments]
    : departments.filter((dept) => dept.key === currentDepartmentKey());

  qs("department-list").innerHTML = departmentButtons.map((dept) => {
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
    return `
      <button class="department-button ${selectedDepartment === dept.key ? "active" : ""}" type="button" data-department="${dept.key}">
        <div class="dept-row">
          <span class="dept-code">${safe(dept.short)}</span>
          <strong>${safe(dept.name)}</strong>
          <span class="dept-flag ${flag}">${safe(status)}</span>
        </div>
        <span class="dept-bar"><i style="width:${Math.min(stats.load, 100)}%"></i></span>
        <span class="dept-meta">${meta}</span>
      </button>
    `;
  }).join("");

  const active = departmentButtons.find((dept) => dept.key === selectedDepartment);
  qs("toolbar-title").textContent = active ? active.name : "كل الأقسام";
}

const KANBAN_COLUMNS = [
  { key: "new", label: "مهام جديدة" },
  { key: "active", label: "قيد العمل" },
  { key: "late", label: "متأخرة" },
  { key: "ready", label: "جاهزة للاعتماد" },
  { key: "approved", label: "معتمدة" }
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
  const late = rows.filter((row) => row.status === "late").length;
  const unassigned = rows.filter((row) => !row.engineers.length).length;
  const left = daysLeft(tender.submitDate);
  let score = late * 3 + unassigned * 2;
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
  const canManage = isExecutive();
  board.classList.toggle("can-drag", canManage);
  board.innerHTML = columns.map((col) => {
    const cards = list.filter((tender) => tenderStage(tender) === col.key);
    return `
      <div class="kan-col" data-col="${col.key}">
        <div class="kan-col-head">
          <span class="kan-col-title"><i></i>${safe(col.label)}</span>
          <span class="kan-col-count">${cards.length}</span>
        </div>
        <div class="kan-col-body" data-drop="${col.key}">
          ${cards.length ? cards.map(renderKanCard).join("") : `<div class="kan-empty">${canManage ? "أفلت ملفا هنا" : "لا توجد ملفات هنا"}</div>`}
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
  const canManage = isExecutive();
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
    <article class="kan-card state-${col} ${isSelected ? "is-selected" : ""}" data-tender="${safe(tender.id)}" data-dept="${safe(rows[0].key)}" ${canManage ? 'draggable="true"' : ""}>
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
  const rows = departmentRows(tender);
  const doneCount = rows.filter((row) => row.status === "completed").length;
  nav.innerHTML = `
    ${rows.map((row) => {
      const done = row.status === "completed";
      const isActive = row.key === activeKey;
      return `<button type="button" class="dept-chip-nav ${done ? "is-done" : ""} ${isActive ? "is-active" : ""}" data-dept-nav="${safe(row.key)}" title="${safe(row.name)}">
        <span class="dcn-mark">${done ? "✓" : ""}</span>
        <span class="dcn-code">${safe(row.short)}</span>
      </button>`;
    }).join("")}
    <span class="dept-nav-progress">${doneCount}/${rows.length} مكتملة</span>
  `;
}

function openDrawer(tenderId, departmentKey) {
  const tender = tenders.find((item) => item.id === tenderId);
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

  const canComplete = isExecutive() || departmentKey === currentDepartmentKey();
  qs("complete-department").disabled = !canComplete || row.status === "completed";
  qs("complete-department").textContent = row.status === "completed" ? "القسم مكتمل" : "اعتماد إكمال القسم";
  qs("open-library").textContent = `فتح مكتبة ${row.short}`;
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
  const canManage = isExecutive();
  bar.innerHTML = `
    <span class="bulk-count"><b>${count}</b> منافسة محددة</span>
    <div class="bulk-actions">
      <button type="button" data-bulk="ready" ${canManage ? "" : "disabled"}>نقل إلى جاهزة</button>
      <button type="button" data-bulk="approve" ${canManage ? "" : "disabled"}>اعتماد المحدد</button>
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
  if (!isExecutive()) return;
  selectedIds.forEach((id) => {
    const tender = tenders.find((item) => item.id === id);
    if (!tender) return;
    if (action === "ready") {
      setTenderStage(id, "ready");
    } else if (action === "approve") {
      const done = departmentRows(tender).every((row) => row.status === "completed");
      if (done) setApproval(id, "approved");
    }
  });
  if (action === "approve") selectedIds.clear();
  render();
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
}

// يشترك في تحديثات قاعدة البيانات الفورية مرة واحدة فقط
let _realtimeSubscribed = false;
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
    setApproval(approve.dataset.approve, "approved");
    render();
    return;
  }

  const reject = event.target.closest("[data-reject]");
  if (reject && !reject.disabled) {
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

// ── Theme + density toggles ──
qs("theme-toggle")?.addEventListener("click", toggleTheme);
qs("density-toggle")?.addEventListener("click", toggleDensity);

// ── SharePoint modal ──
qs("sp-save")?.addEventListener("click", () => {
  const url = qs("sp-url-input")?.value?.trim() || "";
  saveSharePointBase(url);
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

  board.addEventListener("dragstart", (event) => {
    const card = event.target.closest(".kan-card[draggable='true']");
    if (!card) return;
    draggingId = card.dataset.tender;
    card.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
    try { event.dataTransfer.setData("text/plain", draggingId); } catch {}
  });

  board.addEventListener("dragend", () => {
    draggingId = null;
    board.querySelectorAll(".dragging").forEach((el) => el.classList.remove("dragging"));
    board.querySelectorAll(".drop-active").forEach((el) => el.classList.remove("drop-active"));
  });

  board.addEventListener("dragover", (event) => {
    const zone = event.target.closest(".kan-col");
    if (!zone) return;
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
    if (!id || !isExecutive()) return;
    setTenderStage(id, zone.dataset.col);
    render();
  });
})();

loadData();
