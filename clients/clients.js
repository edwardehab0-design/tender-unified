(function () {
  "use strict";

  const AR = {
    title: "اسم المناقصة",
    submitDate: "تاريخ التقديم",
    guaranteeDate: "تاريخ الضمان الابتدائي",
    owner: "المالك",
    workType: "نوع الأعمال",
    sector: "القطاع",
    status: "الحالة",
  };

  const state = {
    rows: [],
    allTenderRows: [],
    portfolioProjects: [],
    externalReferences: {
      sources: [],
      clientReferences: [],
      sectorReferences: [],
    },
    opportunityRules: null,
    etimadCandidates: [],
    opportunityAlerts: [],
    profiles: [],
    filtered: [],
    selectedOwner: "",
    windowStartYear: new Date().getFullYear() - 1,
    windowEndYear: new Date().getFullYear(),
    filters: {
      search: "",
      segment: "all",
      sector: "all",
      stage: "all",
    },
  };

  const els = {};
  const strengthTerms = [
    "بنية",
    "طرق",
    "سيول",
    "مياه",
    "مباني",
    "إنشاء",
    "صيانة",
    "تشغيل",
    "كهرباء",
    "محطات",
    "خطوط",
    "سفلتة",
    "أرصفة",
    "فلل",
  ];

  Object.keys(AR).forEach((key) => {
    AR[key] = decodeMojibake(AR[key]);
  });
  strengthTerms.forEach((term, index) => {
    strengthTerms[index] = decodeMojibake(term);
  });
  const LIVE_STATUS = decodeMojibake("جارية");

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    bindEvents();
    window.clearClientFilters = clearFilters;
    loadData();
  }

  function cacheElements() {
    [
      "data-status",
      "period-window",
      "refresh-btn",
      "export-btn",
      "focus-client",
      "focus-reason",
      "risk-client",
      "risk-reason",
      "gap-client",
      "gap-reason",
      "kpi-clients",
      "kpi-live",
      "kpi-submitted",
      "kpi-won",
      "kpi-external",
      "kpi-alerts",
      "kpi-decision",
      "client-search",
      "segment-filter",
      "sector-filter",
      "stage-filter",
      "clear-filters",
      "client-list",
      "client-detail",
      "result-count",
      "opportunity-alerts",
      "priority-matrix",
      "sector-bars",
      "toast",
    ].forEach((id) => {
      els[toCamel(id)] = document.getElementById(id);
    });
  }

  function bindEvents() {
    els.refreshBtn.addEventListener("click", loadData);
    els.exportBtn.addEventListener("click", exportProfiles);
    els.clearFilters.addEventListener("click", clearFilters);
    document.addEventListener("click", (event) => {
      if (event.target.closest("#clear-filters, #top-clear-filters")) clearFilters();
    });
    els.clientSearch.addEventListener("input", (event) => {
      state.filters.search = event.target.value.trim().toLowerCase();
      applyFilters();
    });
    els.segmentFilter.addEventListener("change", (event) => {
      state.filters.segment = event.target.value;
      applyFilters();
    });
    els.sectorFilter.addEventListener("change", (event) => {
      state.filters.sector = event.target.value;
      applyFilters();
    });
    els.stageFilter.addEventListener("change", (event) => {
      state.filters.stage = event.target.value;
      applyFilters();
    });
  }

  async function loadData() {
    setStatus("جاري تحميل البيانات...");
    const sources = getDataSources();
    state.windowEndYear = new Date().getFullYear();
    state.windowStartYear = state.windowEndYear - 1;
    state.externalReferences = await loadExternalReferences();
    state.opportunityRules = await loadOpportunityRules();
    state.etimadCandidates = await loadEtimadCandidates();
    state.portfolioProjects = await loadPortfolioProjects();

    for (const source of sources) {
      try {
        const response = await fetch(source, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        state.allTenderRows = normalizePayload(payload);
        state.rows = filterRowsByReportingWindow(state.allTenderRows);
        state.profiles = buildProfiles(state.rows);
        state.opportunityAlerts = buildOpportunityAlerts(state.etimadCandidates, state.profiles, state.rows);
        state.filtered = state.profiles.slice();
        state.selectedOwner = state.filtered[0]?.owner || "";
        hydrateFilters();
        render();
        setStatus(`آخر تحديث: ${formatDateTime(payload.last_updated)}`);
        return;
      } catch (error) {
        console.warn(`Unable to load ${source}`, error);
      }
    }

    setStatus("تعذر تحميل البيانات");
    renderLoadError();
  }

  function getDataSources() {
    const configured = getPortalConfig().sources?.liveTenders || [];
    return unique([
      ...configured,
      "/api/live-tenders",
      "../tenders/data.json",
      "data.json",
    ]);
  }

  function getPortfolioSources() {
    const configured = getPortalConfig().sources?.portfolio || [];
    return unique([
      ...configured,
      "/api/portfolio",
      "../portfolio/data.json",
    ]);
  }

  function getClientReferenceSources() {
    const configured = getPortalConfig().sources?.clientReferences || [];
    return unique([
      ...configured,
      "/api/client-references",
      "./references.json",
    ]);
  }

  function getOpportunityRuleSources() {
    const configured = getPortalConfig().sources?.opportunityRules || [];
    return unique([
      ...configured,
      "/api/opportunity-rules",
      "./opportunity-rules.json",
    ]);
  }

  function getEtimadCandidateSources() {
    const configured = getPortalConfig().sources?.etimadCandidates || [];
    return unique([
      ...configured,
      "/api/etimad-candidates",
      "./etimad-candidates.json",
    ]);
  }

  async function loadExternalReferences() {
    for (const source of getClientReferenceSources()) {
      try {
        const response = await fetch(source, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        return normalizeExternalReferences(payload);
      } catch (error) {
        console.warn(`Unable to load client references ${source}`, error);
      }
    }
    return normalizeExternalReferences({});
  }

  function normalizeExternalReferences(payload) {
    const sources = Array.isArray(payload.sources) ? payload.sources : [];
    const clientReferences = Array.isArray(payload.clientReferences) ? payload.clientReferences : [];
    const sectorReferences = Array.isArray(payload.sectorReferences) ? payload.sectorReferences : [];
    return { sources, clientReferences, sectorReferences };
  }

  async function loadOpportunityRules() {
    for (const source of getOpportunityRuleSources()) {
      try {
        const response = await fetch(source, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        return normalizeOpportunityRules(payload);
      } catch (error) {
        console.warn(`Unable to load opportunity rules ${source}`, error);
      }
    }
    return normalizeOpportunityRules({});
  }

  function normalizeOpportunityRules(payload) {
    return {
      thresholds: {
        minimumAlertScore: 68,
        megaProjectScore: 72,
        highPriorityScore: 82,
        maxAlerts: 10,
        ...(payload.thresholds || {}),
      },
      deadline: {
        urgentDays: 3,
        healthyDays: 14,
        stalePenalty: 18,
        tooSoonPenalty: 8,
        ...(payload.deadline || {}),
      },
      links: {
        etimadSearchUrl: "https://tenders.etimad.sa/Tender/AllTendersForVisitor?IsSearch=true&PageNumber=1&PageSize=6&MultipleSearch=",
        ...(payload.links || {}),
      },
      fitKeywords: Array.isArray(payload.fitKeywords) ? payload.fitKeywords : [],
      largeProjectKeywords: Array.isArray(payload.largeProjectKeywords) ? payload.largeProjectKeywords : [],
      strategicOwnerKeywords: Array.isArray(payload.strategicOwnerKeywords) ? payload.strategicOwnerKeywords : [],
      excludeKeywords: Array.isArray(payload.excludeKeywords) ? payload.excludeKeywords : [],
    };
  }

  async function loadEtimadCandidates() {
    for (const source of getEtimadCandidateSources()) {
      try {
        const response = await fetch(source, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        return normalizeEtimadCandidates(payload);
      } catch (error) {
        console.warn(`Unable to load Etimad candidates ${source}`, error);
      }
    }
    return [];
  }

  function normalizeEtimadCandidates(payload) {
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload.opportunities) ? payload.opportunities : [];
    return rows
      .map((row, index) => normalizeEtimadCandidate(row, index))
      .filter((row) => row.owner && row.title);
  }

  function normalizeEtimadCandidate(row, index) {
    const submitDate = value(row, AR.submitDate, "submitDate", "deadline", "lastOfferDate", "آخر موعد لتقديم العروض") || "";
    const guaranteeDate = value(row, AR.guaranteeDate, "guaranteeDate", "guarantee", "تاريخ الضمان") || "";
    return {
      id: value(row, "tender_id", "id", "referenceNumber", "رقم المنافسة") || `etimad-candidate-${index}`,
      title: value(row, AR.title, "title", "name", "competitionName", "اسم المنافسة", "إسم المشروع") || "فرصة اعتماد بدون اسم",
      owner: value(row, AR.owner, "owner", "agency", "governmentAgency", "الجهة", "الجهة الحكومية") || "غير محدد",
      workType: value(row, AR.workType, "workType", "activity", "نوع الأعمال", "طبيعة المشروع") || "غير مصنف",
      sector: value(row, AR.sector, "sector", "category", "القطاع", "مكان التنفيذ") || "غير مصنف",
      submitDate,
      guaranteeDate,
      status: value(row, AR.status, "status", "الحالة") || "مرشح من اعتماد",
      isCandidate: true,
      source: value(row, "source") || "etimad",
      year: extractYear(submitDate) || extractYear(guaranteeDate),
    };
  }

  async function loadPortfolioProjects() {
    for (const source of getPortfolioSources()) {
      try {
        const response = await fetch(source, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        const projects = Array.isArray(payload.projects) ? payload.projects : [];
        return projects.map(normalizePortfolioProject).filter(isPortfolioProjectInWindow);
      } catch (error) {
        console.warn(`Unable to load portfolio ${source}`, error);
      }
    }
    return [];
  }

  function normalizePayload(payload) {
    const live = Array.isArray(payload.tenders) ? payload.tenders : [];
    const submitted = Array.isArray(payload.submitted) ? payload.submitted : [];
    return [...live, ...submitted]
      .map((row, index) => normalizeTender(row, index))
      .filter((row) => row.owner && row.title);
  }

  function filterRowsByReportingWindow(rows) {
    return rows.filter((row) => {
      if (Number.isFinite(row.year)) return row.year >= state.windowStartYear && row.year <= state.windowEndYear;
      return row.isLive;
    });
  }

  function isPortfolioProjectInWindow(project) {
    if (!Number.isFinite(project.year)) return true;
    return project.year >= state.windowStartYear && project.year <= state.windowEndYear;
  }

  function normalizePortfolioProject(project, index) {
    const amount = Number(project.amountExclVat || project.amount || 0);
    return {
      id: value(project, "number", "id") || `portfolio-${index}`,
      project: value(project, "project", "name", "title") || "مشروع محفظة بدون اسم",
      client: value(project, "client", "owner") || "غير محدد",
      portfolio: value(project, "portfolio", "sector") || "غير مصنف",
      status: value(project, "status") || "",
      statusLabel: value(project, "statusLabel", "status") || "ضمن المحفظة",
      amount,
      amountInclVat: Number(project.amountInclVat || amount || 0),
      year: extractYear(value(project, "date", "awardDate", "contractDate", "year")),
    };
  }

  function normalizeTender(row, index) {
    const status = value(row, AR.status, "status") || "غير محدد";
    const submitDate = value(row, AR.submitDate, "date", "submitDate") || "";
    const guaranteeDate = value(row, AR.guaranteeDate, "guarantee", "guaranteeDate") || "";
    return {
      id: value(row, "tender_id", "id") || `row-${index}`,
      title: value(row, AR.title, "name", "title") || "مناقصة بدون اسم",
      owner: value(row, AR.owner, "owner") || "غير محدد",
      workType: value(row, AR.workType, "type", "workType") || "غير مصنف",
      sector: value(row, AR.sector, "sector") || "غير مصنف",
      submitDate,
      guaranteeDate,
      status,
      isLive: status.includes(LIVE_STATUS),
      year: extractYear(submitDate) || extractYear(guaranteeDate),
    };
  }

  function buildProfiles(rows) {
    const groups = new Map();
    rows.forEach((row) => {
      if (!groups.has(row.owner)) groups.set(row.owner, []);
      groups.get(row.owner).push(row);
    });
    state.portfolioProjects.forEach((project) => {
      const owner = findMatchingOwner(project.client, groups) || project.client;
      if (!groups.has(owner)) groups.set(owner, []);
    });

    return Array.from(groups, ([owner, tenders]) => {
      const portfolioProjects = state.portfolioProjects.filter((project) => clientNamesMatch(owner, project.client));
      const portfolioAmount = portfolioProjects.reduce((sum, project) => sum + (project.amount || 0), 0);
      const live = tenders.filter((tender) => tender.isLive);
      const submitted = tenders.filter((tender) => !tender.isLive);
      const sectors = countBy(tenders, "sector");
      const workTypes = countBy(tenders, "workType");
      const portfolioSectors = countBy(portfolioProjects, "portfolio");
      const topSector = topEntry(sectors)?.[0] || topEntry(portfolioSectors)?.[0] || "غير مصنف";
      const topWorkType = topEntry(workTypes)?.[0] || (portfolioProjects.length ? "مشروع محفظة" : "غير مصنف");
      const externalInsights = buildExternalInsights({ owner, tenders, portfolioProjects, topSector, topWorkType });
      const nearest = getNearestTender(live);
      const daysToNext = nearest ? daysUntil(nearest.submitDate) : null;
      const urgentLive = live.filter((tender) => {
        const days = daysUntil(tender.submitDate);
        return Number.isFinite(days) && days <= 7;
      }).length;
      const missingClassification = tenders.filter((tender) => tender.sector === "غير مصنف" || tender.workType === "غير مصنف").length;

      const opportunityScore = clamp(live.length * 28 + submitted.length * 1.2 + tenders.length * 1.4 + portfolioProjects.length * 6 + externalInsights.priorityBoost, 0, 100);
      const fitScore = clamp(calculateFitScore(tenders, live, submitted) + externalInsights.fitBoost, 0, 100);
      const relationshipScore = clamp(18 + submitted.length * 5 + portfolioProjects.length * 14 + Math.min(Object.keys(workTypes).length, 6) * 3 + externalInsights.relationshipBoost, 0, 100);
      const urgencyScore = calculateUrgencyScore(live, daysToNext);
      const riskScore = calculateRiskScore({ live, submitted, daysToNext, missingClassification, sectors, portfolioProjects });
      const priorityScore = clamp(
        opportunityScore * .30 +
        fitScore * .25 +
        relationshipScore * .20 +
        urgencyScore * .15 +
        (100 - riskScore) * .10,
        0,
        100
      );

      const segment = classifyClient({ priorityScore, riskScore, live, submitted, relationshipScore, portfolioProjects });
      const recommendation = buildRecommendation({ priorityScore, riskScore, live, submitted, daysToNext, relationshipScore, portfolioProjects, externalInsights });

      return {
        owner,
        tenders: sortByDate(tenders),
        live,
        submitted,
        portfolioProjects,
        portfolioAmount,
        total: tenders.length,
        sectors,
        workTypes,
        topSector,
        topWorkType,
        externalInsights,
        nearest,
        daysToNext,
        urgentLive,
        missingClassification,
        opportunityScore: Math.round(opportunityScore),
        fitScore: Math.round(fitScore),
        relationshipScore: Math.round(relationshipScore),
        urgencyScore: Math.round(urgencyScore),
        riskScore: Math.round(riskScore),
        priorityScore: Math.round(priorityScore),
        segment,
        recommendation,
        actions: buildActions({ live, submitted, daysToNext, riskScore, relationshipScore, missingClassification, portfolioProjects, externalInsights }),
      };
    }).sort((a, b) => (
      b.priorityScore - a.priorityScore ||
      b.live.length - a.live.length ||
      b.portfolioProjects.length - a.portfolioProjects.length ||
      b.portfolioAmount - a.portfolioAmount ||
      b.total - a.total
    ));
  }

  function buildExternalInsights({ owner, tenders, portfolioProjects, topSector, topWorkType }) {
    const references = state.externalReferences || {};
    const sourceMap = new Map((references.sources || []).map((source) => [source.id, source]));
    const matchedIds = new Set();
    const signals = [];
    const actions = [];
    const haystack = [
      owner,
      topSector,
      topWorkType,
      ...tenders.map((tender) => `${tender.title} ${tender.sector} ${tender.workType} ${tender.owner}`),
      ...portfolioProjects.map((project) => `${project.project} ${project.portfolio} ${project.client}`),
    ].join(" ");
    let fitBoost = 0;
    let priorityBoost = 0;
    let relationshipBoost = 0;

    const addSource = (id, signal, action) => {
      if (!sourceMap.has(id)) return;
      matchedIds.add(id);
      if (signal && !signals.includes(signal)) signals.push(signal);
      if (action && !actions.includes(action)) actions.push(action);
    };

    if (tenders.length) {
      addSource(
        "etimad",
        "اعتماد هو مرجع التحقق الأول للمنافسات والمواعيد والضمانات.",
        "فتح المنافسات المرتبطة في اعتماد وتثبيت رقم المنافسة قبل قرار التسعير."
      );
      priorityBoost += tenders.some((tender) => tender.isLive) ? 5 : 2;
    }

    (references.clientReferences || []).forEach((rule) => {
      if (!matchesAnyKeyword(owner, rule.clientKeywords)) return;
      (rule.sourceIds || []).forEach((id) => addSource(id, rule.signal));
      fitBoost += Number(rule.fitBoost) || 0;
      priorityBoost += Number(rule.priorityBoost) || 0;
      relationshipBoost += 4;
    });

    (references.sectorReferences || []).forEach((rule) => {
      if (!matchesAnyKeyword(haystack, rule.sectorKeywords)) return;
      (rule.sourceIds || []).forEach((id) => addSource(id, rule.signal));
      fitBoost += Number(rule.fitBoost) || 0;
      priorityBoost += Number(rule.priorityBoost) || 0;
    });

    (references.sources || []).forEach((source) => {
      if (matchesAnyKeyword(owner, source.ownerKeywords) || matchesAnyKeyword(haystack, source.sectorKeywords)) {
        addSource(source.id, source.note, source.action);
        if (source.priority === "primary") priorityBoost += 3;
      }
    });

    const matchedSources = Array.from(matchedIds)
      .map((id) => sourceMap.get(id))
      .filter(Boolean)
      .sort((a, b) => sourceWeight(b) - sourceWeight(a));
    const primarySource = matchedSources[0] || null;

    return {
      sources: matchedSources,
      sourceIds: matchedSources.map((source) => source.id),
      primarySource,
      primaryLabel: primarySource?.name || "بدون مرجع خارجي",
      signals: signals.slice(0, 4),
      actions: actions.slice(0, 3),
      fitBoost: Math.min(16, fitBoost),
      priorityBoost: Math.min(16, priorityBoost),
      relationshipBoost: Math.min(8, relationshipBoost),
    };
  }

  function buildOpportunityAlerts(candidateRows, profiles, knownRows) {
    const rules = state.opportunityRules || normalizeOpportunityRules({});
    const thresholds = rules.thresholds;
    return candidateRows
      .filter((row) => !isKnownLiveTender(row, knownRows))
      .map((tender) => scoreOpportunity(tender, profiles, rules))
      .filter((alert) => alert.alertScore >= thresholds.minimumAlertScore || alert.scaleScore >= thresholds.megaProjectScore)
      .sort((a, b) => (
        b.alertScore - a.alertScore ||
        b.scaleScore - a.scaleScore ||
        (a.daysToDeadline ?? 999) - (b.daysToDeadline ?? 999)
      ))
      .slice(0, thresholds.maxAlerts);
  }

  function isKnownLiveTender(candidate, knownRows) {
    return knownRows.some((row) => (
      row.isLive &&
      clientNamesMatch(candidate.owner, row.owner) &&
      normalizeNameForMatch(candidate.title) === normalizeNameForMatch(row.title)
    ));
  }

  function scoreOpportunity(tender, profiles, rules) {
    const profile = findProfileForOwner(tender.owner, profiles);
    const text = `${tender.title} ${tender.owner} ${tender.sector} ${tender.workType}`;
    const fitMatches = matchedKeywords(text, rules.fitKeywords);
    const largeMatches = matchedKeywords(text, rules.largeProjectKeywords);
    const ownerMatches = matchedKeywords(tender.owner, rules.strategicOwnerKeywords);
    const excludeMatches = matchedKeywords(text, rules.excludeKeywords);
    const daysToDeadline = daysUntil(tender.submitDate);

    const relationshipScore = profile ? Math.min(22, profile.submitted.length * 2 + profile.portfolioProjects.length * 6) : 0;
    const portfolioScale = profile?.portfolioAmount ? Math.min(14, Math.round(profile.portfolioAmount / 250000000)) : 0;
    const fitScore = clamp(24 + fitMatches.length * 7 + relationshipScore + (profile?.externalInsights.sourceIds.includes("etimad") ? 5 : 0), 0, 100);
    const scaleScore = clamp(22 + largeMatches.length * 8 + ownerMatches.length * 6 + portfolioScale + (tender.sector.includes("البنية") ? 8 : 0), 0, 100);
    const deadlineScore = calculateOpportunityDeadlineScore(daysToDeadline, rules.deadline);
    const exclusionPenalty = Math.min(35, excludeMatches.length * 14);
    const alertScore = Math.round(clamp(fitScore * .46 + scaleScore * .36 + deadlineScore * .18 - exclusionPenalty, 0, 100));
    const level = classifyOpportunityAlert({ alertScore, scaleScore, daysToDeadline, thresholds: rules.thresholds });
    const reasons = buildOpportunityReasons({
      fitMatches,
      largeMatches,
      ownerMatches,
      excludeMatches,
      profile,
      daysToDeadline,
      scaleScore,
    });

    return {
      id: tender.id,
      title: tender.title,
      owner: tender.owner,
      workType: tender.workType,
      sector: tender.sector,
      submitDate: tender.submitDate,
      daysToDeadline,
      fitScore: Math.round(fitScore),
      scaleScore: Math.round(scaleScore),
      deadlineScore: Math.round(deadlineScore),
      alertScore,
      level,
      reasons,
      recommendation: buildOpportunityRecommendation({ alertScore, scaleScore, daysToDeadline, profile, excludeMatches }),
      url: buildEtimadOpportunityUrl(tender, rules),
      profileOwner: profile?.owner || "",
    };
  }

  function calculateOpportunityDeadlineScore(daysToDeadline, deadlineRules) {
    if (!Number.isFinite(daysToDeadline)) return 46;
    if (daysToDeadline < 0) return Math.max(0, 28 - deadlineRules.stalePenalty);
    if (daysToDeadline <= deadlineRules.urgentDays) return 56 - deadlineRules.tooSoonPenalty;
    if (daysToDeadline <= deadlineRules.healthyDays) return 88;
    if (daysToDeadline <= 30) return 72;
    return 58;
  }

  function classifyOpportunityAlert({ alertScore, scaleScore, daysToDeadline, thresholds }) {
    if (scaleScore >= thresholds.megaProjectScore && alertScore >= thresholds.minimumAlertScore) return "مشروع ضخم مناسب";
    if (alertScore >= thresholds.highPriorityScore) return "دخول سريع";
    if (Number.isFinite(daysToDeadline) && daysToDeadline <= 3 && alertScore >= thresholds.minimumAlertScore) return "موعد حرج";
    if (scaleScore >= thresholds.megaProjectScore) return "مشروع ضخم يحتاج فحص";
    return "دراسة مبدئية";
  }

  function buildOpportunityReasons({ fitMatches, largeMatches, ownerMatches, excludeMatches, profile, daysToDeadline, scaleScore }) {
    const reasons = [];
    if (fitMatches.length) reasons.push(`تطابق أعمال الشركة: ${fitMatches.slice(0, 3).join("، ")}`);
    if (largeMatches.length || scaleScore >= 72) reasons.push(`إشارات مشروع كبير: ${largeMatches.slice(0, 3).join("، ") || "حجم/قطاع استراتيجي"}`);
    if (ownerMatches.length) reasons.push(`جهة استراتيجية: ${ownerMatches.slice(0, 2).join("، ")}`);
    if (profile?.portfolioProjects.length) reasons.push(`${profile.portfolioProjects.length} مشروع محفظة مع العميل أو قريب منه`);
    if (profile?.submitted.length) reasons.push(`${profile.submitted.length} تقديم سابق يدعم ذاكرة التسعير`);
    if (Number.isFinite(daysToDeadline)) reasons.push(`الموعد النهائي: ${formatDays(daysToDeadline)}`);
    if (excludeMatches.length) reasons.push(`توجد إشارات استبعاد تحتاج مراجعة: ${excludeMatches.slice(0, 2).join("، ")}`);
    return reasons.slice(0, 5);
  }

  function buildOpportunityRecommendation({ alertScore, scaleScore, daysToDeadline, profile, excludeMatches }) {
    if (excludeMatches.length && alertScore < 78) return "لا تعتمد التنبيه قبل مراجعة نطاق المنافسة؛ توجد كلمات قد تشير إلى فرصة غير إنشائية.";
    if (scaleScore >= 72 && profile?.portfolioProjects.length) return "أولوية عالية: مشروع كبير ومرتبط بذاكرة محفظة. راجع كراسة اعتماد وحدد فريق Bid/No-Bid.";
    if (alertScore >= 82) return "افتح دراسة سريعة اليوم، وثبت مالك العرض، وراجع الضمانات والموعد في اعتماد.";
    if (Number.isFinite(daysToDeadline) && daysToDeadline <= 3) return "الموعد قريب؛ لا تدخل إلا إذا كانت الكراسة واضحة والقدرة التنفيذية مؤكدة.";
    if (scaleScore >= 72) return "مشروع كبير يستحق فحصاً فنياً أولياً حتى لو كانت ذاكرة العميل محدودة.";
    return "دراسة مبدئية: راجع الملاءمة الفنية وقيمة الجهد قبل شراء الكراسة.";
  }

  function findProfileForOwner(owner, profiles) {
    return profiles.find((profile) => clientNamesMatch(owner, profile.owner)) || null;
  }

  function buildEtimadOpportunityUrl(tender, rules) {
    return `${rules.links.etimadSearchUrl}${encodeURIComponent(tender.title)}`;
  }

  function matchedKeywords(valueText, keywords) {
    if (!Array.isArray(keywords) || !keywords.length) return [];
    const normalizedValue = normalizeNameForMatch(valueText);
    return unique(keywords.filter((keyword) => {
      const normalizedKeyword = normalizeNameForMatch(keyword);
      return normalizedKeyword && normalizedValue.includes(normalizedKeyword);
    }));
  }

  function calculateFitScore(tenders, live, submitted) {
    const haystack = tenders.map((tender) => `${tender.title} ${tender.workType} ${tender.sector}`).join(" ");
    const matchedTerms = strengthTerms.filter((term) => haystack.includes(term)).length;
    const submittedTypes = new Set(submitted.map((tender) => tender.workType));
    const liveTypeMemory = live.filter((tender) => submittedTypes.has(tender.workType)).length;
    return clamp(34 + matchedTerms * 5 + liveTypeMemory * 9 + Math.min(submitted.length, 8) * 2, 0, 100);
  }

  function calculateUrgencyScore(live, daysToNext) {
    if (!live.length) return 15;
    if (!Number.isFinite(daysToNext)) return 52;
    if (daysToNext < 0) return 96;
    if (daysToNext <= 3) return 88;
    if (daysToNext <= 7) return 76;
    if (daysToNext <= 14) return 60;
    if (daysToNext <= 30) return 44;
    return 28;
  }

  function calculateRiskScore({ live, submitted, daysToNext, missingClassification, sectors, portfolioProjects }) {
    let score = 24;
    if (live.length && !submitted.length) score += 28;
    if (Number.isFinite(daysToNext) && daysToNext <= 3) score += 24;
    if (Number.isFinite(daysToNext) && daysToNext < 0) score += 16;
    if (missingClassification) score += Math.min(18, missingClassification * 4);
    if (Object.keys(sectors).length > 4) score += 8;
    if (submitted.length >= 6) score -= 12;
    if (portfolioProjects.length) score -= Math.min(20, portfolioProjects.length * 8);
    return clamp(score, 0, 100);
  }

  function classifyClient({ priorityScore, riskScore, live, submitted, relationshipScore, portfolioProjects }) {
    if (portfolioProjects.length && live.length) return "عميل رابح نشط";
    if (portfolioProjects.length && !live.length) return "عميل رابح يجب تنشيطه";
    if (riskScore >= 72 && live.length) return "يحتاج ضبط مخاطر";
    if (priorityScore >= 76 && live.length) return "عميل استراتيجي";
    if (live.length && relationshipScore < 42) return "فرصة علاقة جديدة";
    if (!live.length && submitted.length >= 8) return "علاقة يجب تنشيطها";
    if (priorityScore >= 62) return "أولوية متابعة";
    return "مراقبة";
  }

  function buildRecommendation({ priorityScore, riskScore, live, submitted, daysToNext, relationshipScore, portfolioProjects, externalInsights }) {
    if (portfolioProjects.length && live.length) return "عميل مثبت في المحفظة ولديه فرص جارية. ابدأ من تاريخ المشروع الفائز وحدد فرصة التوسع أو التجديد قبل قرار التسعير.";
    if (portfolioProjects.length && !live.length) return "عميل رابح لكن بلا فرص جارية. يحتاج خطة تنشيط علاقة وربط آخر مشروع بمحفظة فرص جديدة للعام الحالي.";
    if (externalInsights.sourceIds.includes("etimad") && live.length) return "فرص العميل مرتبطة بمنصة اعتماد؛ راجع كراسة الشروط والمواعيد والضمانات قبل تثبيت قرار الدخول.";
    if (live.length && priorityScore >= 76 && riskScore < 70) return "ادخل قرار Bid/No-Bid خلال 24 ساعة وحدد مسؤول العرض من الآن.";
    if (live.length && riskScore >= 72) return "لا تبدأ التسعير قبل مراجعة المستندات والضمانات وتأكيد القدرة التنفيذية.";
    if (live.length && Number.isFinite(daysToNext) && daysToNext <= 7) return "فرصة قريبة الموعد: يحتاج اجتماع سريع للتسعير والمخاطر.";
    if (live.length && relationshipScore < 42) return "فرصة جيدة لبناء علاقة، لكن يجب تعيين مالك علاقة قبل التقديم.";
    if (!live.length && submitted.length >= 8) return "عميل لديه ذاكرة تقديم قوية. يحتاج متابعة علاقة واستباق الفرص القادمة.";
    return "راقب العميل وحدث بيانات النتائج عند ظهور ترسية أو دعوة جديدة.";
  }

  function buildActions({ live, submitted, daysToNext, riskScore, relationshipScore, missingClassification, portfolioProjects, externalInsights }) {
    const actions = [];
    externalInsights.actions.forEach((action) => actions.push(action));
    if (portfolioProjects.length) actions.push("ربط آخر مشاريع المحفظة بملف العميل وتحديد فرص التوسع أو التجديد القادمة.");
    if (live.length) actions.push("فتح جلسة Bid/No-Bid للفرص الجارية وتوثيق قرار الدخول أو الاعتذار.");
    if (Number.isFinite(daysToNext) && daysToNext <= 7) actions.push("تثبيت موعد داخلي للتسعير قبل الموعد النهائي بيومين على الأقل.");
    if (relationshipScore < 42) actions.push("تعيين مسؤول علاقة وتسجيل آخر تواصل مع الجهة المالكة.");
    if (riskScore >= 70) actions.push("مراجعة شروط الضمان، مدة التنفيذ، وضوح نطاق العمل، ومتطلبات التأهيل.");
    if (submitted.length) actions.push("تحديث نتيجة آخر تقديم: فوز، خسارة، ترسية معلقة، أو انتظار.");
    if (missingClassification) actions.push("استكمال تصنيف القطاع ونوع الأعمال للفرص غير المصنفة.");
    if (!actions.length) actions.push("المراقبة الدورية كافية حاليًا مع مراجعة شهرية للمحفظة.");
    return actions.slice(0, 5);
  }

  function hydrateFilters() {
    const segments = unique(state.profiles.map((profile) => profile.segment)).sort();
    const sectors = unique(state.profiles.map((profile) => profile.topSector)).sort();
    fillSelect(els.segmentFilter, "كل التصنيفات", segments);
    fillSelect(els.sectorFilter, "كل القطاعات", sectors);
  }

  function fillSelect(select, allLabel, values) {
    const current = select.value;
    select.innerHTML = `<option value="all">${escapeHtml(allLabel)}</option>` + values.map((item) => `<option value="${escapeAttr(item)}">${escapeHtml(item)}</option>`).join("");
    select.value = values.includes(current) ? current : "all";
  }

  function applyFilters() {
    state.filtered = state.profiles.filter((profile) => {
      const searchBlob = `${profile.owner} ${profile.topSector} ${profile.topWorkType} ${profile.segment}`.toLowerCase();
      const searchOk = !state.filters.search || searchBlob.includes(state.filters.search);
      const segmentOk = state.filters.segment === "all" || profile.segment === state.filters.segment;
      const sectorOk = state.filters.sector === "all" || profile.topSector === state.filters.sector;
      const stageOk =
        state.filters.stage === "all" ||
        (state.filters.stage === "live" && profile.live.length) ||
        (state.filters.stage === "history" && !profile.live.length && profile.submitted.length) ||
        (state.filters.stage === "portfolio" && profile.portfolioProjects.length) ||
        (state.filters.stage === "alert" && profileHasAlert(profile)) ||
        (state.filters.stage === "decision" && needsDecision(profile));

      return searchOk && segmentOk && sectorOk && stageOk;
    });

    if (!state.filtered.some((profile) => profile.owner === state.selectedOwner)) {
      state.selectedOwner = state.filtered[0]?.owner || "";
    }

    renderList();
    renderDetail();
    renderOpportunityAlerts();
    renderMatrix();
    renderResultCount();
    repairUiText();
  }

  function clearFilters() {
    state.filters = { search: "", segment: "all", sector: "all", stage: "all" };
    els.clientSearch.value = "";
    els.segmentFilter.value = "all";
    els.sectorFilter.value = "all";
    els.stageFilter.value = "all";
    applyFilters();
  }

  function render() {
    renderKpis();
    renderDecisionStrip();
    renderList();
    renderDetail();
    renderOpportunityAlerts();
    renderMatrix();
    renderSectorBars();
    renderResultCount();
    repairUiText();
  }

  function renderKpis() {
    const live = state.rows.filter((row) => row.isLive).length;
    const submitted = state.rows.length - live;
    const decision = state.profiles.filter(needsDecision).length;
    if (els.periodWindow) els.periodWindow.textContent = `فترة التحليل: ${getReportingWindowLabel()}`;
    animateNumber(els.kpiClients, state.profiles.length);
    animateNumber(els.kpiLive, live);
    animateNumber(els.kpiSubmitted, submitted);
    animateNumber(els.kpiWon, state.portfolioProjects.length);
    animateNumber(els.kpiExternal, state.profiles.filter((profile) => profile.externalInsights.sources.length).length);
    animateNumber(els.kpiAlerts, state.opportunityAlerts.length);
    animateNumber(els.kpiDecision, decision);
  }

  function renderDecisionStrip() {
    const withLive = state.profiles.filter((profile) => profile.live.length);
    const focus = withLive.slice().sort((a, b) => b.priorityScore - a.priorityScore)[0] || state.profiles[0];
    const risk = withLive.slice().sort((a, b) => b.riskScore - a.riskScore)[0] || state.profiles[0];
    const gap = withLive.filter((profile) => profile.relationshipScore < 48).sort((a, b) => b.live.length - a.live.length)[0] || withLive[0] || state.profiles[0];

    renderDecision(els.focusClient, els.focusReason, focus, focus ? `مؤشر أولوية ${focus.priorityScore}/100، ${focus.live.length} فرصة جارية، وأقرب موعد ${formatDays(focus.daysToNext)}.` : "—");
    renderDecision(els.riskClient, els.riskReason, risk, risk ? `مخاطر ${risk.riskScore}/100 بسبب ضغط الوقت أو ضعف الذاكرة أو نقص التصنيف.` : "—");
    renderDecision(els.gapClient, els.gapReason, gap, gap ? `فرص جارية مع علاقة تحتاج تثبيت: ${gap.submitted.length} تقديم سابق و${gap.live.length} فرصة جارية.` : "—");
  }

  function renderDecision(nameEl, reasonEl, profile, reason) {
    nameEl.textContent = profile?.owner || "لا توجد بيانات";
    reasonEl.textContent = reason || "لا توجد بيانات كافية.";
  }

  function renderList() {
    if (!state.filtered.length) {
      els.clientList.innerHTML = `<div class="empty-list">لا توجد نتائج مطابقة للفلاتر الحالية.</div>`;
      return;
    }

    els.clientList.innerHTML = state.filtered.map((profile) => `
      <button class="client-row ${profile.owner === state.selectedOwner ? "active" : ""}" type="button" data-owner="${escapeAttr(profile.owner)}">
        <span class="score-badge">${profile.priorityScore}</span>
        <span class="client-row-main">
          <span class="client-row-title">
            <span class="client-name">${escapeHtml(profile.owner)}</span>
            <span class="segment-pill">${escapeHtml(profile.segment)}</span>
          </span>
          <span class="client-row-meta">
            <span>${profile.live.length} جارية</span>
            <span>${profile.submitted.length} تم التقديم</span>
            ${profile.portfolioProjects.length ? `<span>${profile.portfolioProjects.length} محفظة</span>` : ""}
            <span>${escapeHtml(profile.topSector)}</span>
          </span>
          <span class="client-row-signals">
            <span>ملاءمة ${profile.fitScore}</span>
            <span>علاقة ${profile.relationshipScore}</span>
            <span>مخاطر ${profile.riskScore}</span>
            ${profile.externalInsights.sources.length ? `<span>${escapeHtml(profile.externalInsights.primaryLabel)}</span>` : ""}
          </span>
        </span>
      </button>
    `).join("");

    els.clientList.querySelectorAll(".client-row").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedOwner = button.dataset.owner;
        renderList();
        renderDetail();
      });
    });
  }

  function renderDetail() {
    const profile = state.profiles.find((item) => item.owner === state.selectedOwner);
    if (!profile) {
      els.clientDetail.innerHTML = `
        <div class="empty-state">
          <strong>لا توجد نتيجة محددة</strong>
          <p>غيّر الفلاتر أو امسحها لعرض العملاء.</p>
        </div>
      `;
      return;
    }

    els.clientDetail.innerHTML = `
      <div class="detail-hero">
        <div class="detail-hero-grid">
          <div>
            <h2>${escapeHtml(profile.owner)}</h2>
            <p>${escapeHtml(profile.recommendation)}</p>
          </div>
          <div class="priority-ring" style="--score:${profile.priorityScore}">
            <div>
              <strong>${profile.priorityScore}</strong>
              <span>أولوية العميل</span>
            </div>
          </div>
        </div>
      </div>
      <div class="detail-body">
        <div class="metric-grid">
          ${metric("إجمالي الفرص", profile.total)}
          ${metric("فرص جارية", profile.live.length)}
          ${metric("تم التقديم", profile.submitted.length)}
          ${metric("مشاريع المحفظة", profile.portfolioProjects.length)}
          ${metric("قيمة المحفظة", formatMoney(profile.portfolioAmount))}
          ${metric("تنبيهات اعتماد", getProfileAlerts(profile).length)}
          ${metric("مراجع خارجية", profile.externalInsights.sources.length)}
          ${metric("أقرب موعد", formatDays(profile.daysToNext))}
        </div>

        ${renderClientOpportunityAlerts(profile)}

        <div class="detail-columns">
          <section class="detail-box">
            <h3>مؤشرات القرار</h3>
            <div class="signal-list">
              ${signal("ملاءمة الأعمال", profile.fitScore, `أقوى نوع عمل: ${profile.topWorkType}`)}
              ${signal("قوة العلاقة", profile.relationshipScore, `${profile.submitted.length} تقديم سابق و${profile.portfolioProjects.length} مشروع محفظة`)}
              ${signal("ضغط الوقت", profile.urgencyScore, profile.nearest ? profile.nearest.title : "لا توجد فرصة جارية")}
              ${signal("مستوى المخاطر", profile.riskScore, profile.segment)}
              ${signal("الإسناد الخارجي", Math.round(clamp(profile.externalInsights.sources.length * 26 + profile.externalInsights.priorityBoost * 2, 0, 100)), profile.externalInsights.primaryLabel)}
            </div>
          </section>

          <section class="detail-box">
            <h3>الإجراءات المقترحة</h3>
            <div class="action-list">
              ${profile.actions.map((action, index) => `
                <div class="action-item">
                  <strong>${index + 1}</strong>
                  <span>${escapeHtml(action)}</span>
                </div>
              `).join("")}
            </div>
          </section>
        </div>

        ${renderExternalReferences(profile)}

        ${renderPortfolioProjects(profile)}

        <section class="detail-box" style="margin-top:14px;">
          <h3>آخر الفرص والمناقصات</h3>
          <div class="tender-list">
            ${profile.tenders.slice(0, 8).map((tender) => `
              <div class="tender-item">
                <div>
                  <strong>${escapeHtml(tender.title)}</strong>
                  <span>${escapeHtml(tender.workType)} — ${escapeHtml(tender.sector)}</span>
                </div>
                <span>${escapeHtml(tender.status)}<br>${escapeHtml(formatDate(tender.submitDate))}</span>
              </div>
            `).join("")}
          </div>
        </section>
      </div>
    `;
  }

  function renderOpportunityAlerts() {
    if (!els.opportunityAlerts) return;

    if (!state.opportunityAlerts.length) {
      els.opportunityAlerts.innerHTML = `
        <div class="empty-list">لا توجد فرص اعتماد جديدة مستوردة حالياً. هذا القسم لا يعيد عرض المناقصات الجارية، وسيظهر فقط الفرص القادمة من ملف/مستورد اعتماد بعد فلتر الملاءمة والضخامة.</div>
      `;
      return;
    }

    els.opportunityAlerts.innerHTML = state.opportunityAlerts.map((alert) => `
      <article class="opportunity-alert">
        <div class="alert-score">
          <strong>${alert.alertScore}</strong>
          <span>${escapeHtml(alert.level)}</span>
        </div>
        <div class="alert-content">
          <div class="alert-title-row">
            <div>
              <h3>${escapeHtml(alert.title)}</h3>
              <p>${escapeHtml(alert.owner)} — ${escapeHtml(alert.workType)}</p>
            </div>
            <span class="alert-scale">ضخامة ${alert.scaleScore}</span>
          </div>
          <div class="alert-reasons">
            ${alert.reasons.map((reason) => `<span>${escapeHtml(reason)}</span>`).join("")}
          </div>
          <p class="alert-recommendation">${escapeHtml(alert.recommendation)}</p>
          <div class="alert-actions">
            ${alert.profileOwner ? `<button class="ghost-btn compact alert-owner-btn" type="button" data-owner="${escapeAttr(alert.profileOwner)}">عرض العميل</button>` : ""}
            <a href="${escapeAttr(alert.url)}" target="_blank" rel="noopener">فتح البحث في اعتماد</a>
          </div>
        </div>
      </article>
    `).join("");

    els.opportunityAlerts.querySelectorAll(".alert-owner-btn").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedOwner = button.dataset.owner;
        renderList();
        renderDetail();
        document.getElementById("client-detail").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function renderClientOpportunityAlerts(profile) {
    const alerts = getProfileAlerts(profile);
    if (!alerts.length) return "";

    return `
      <section class="detail-box alert-box">
        <h3>تنبيهات اعتماد المرتبطة بالعميل</h3>
        <div class="client-alert-list">
          ${alerts.slice(0, 4).map((alert) => `
            <div class="client-alert-item">
              <div>
                <strong>${escapeHtml(alert.title)}</strong>
                <span>${escapeHtml(alert.level)} — ملاءمة ${alert.alertScore} / ضخامة ${alert.scaleScore}</span>
              </div>
              <a href="${escapeAttr(alert.url)}" target="_blank" rel="noopener">اعتماد</a>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderExternalReferences(profile) {
    const insights = profile.externalInsights;
    if (!insights.sources.length) return "";

    return `
      <section class="detail-box reference-box">
        <h3>مراجع التحليل الخارجية</h3>
        <div class="reference-summary">
          <strong>${escapeHtml(insights.primaryLabel)}</strong>
          <span>${escapeHtml(insights.signals[0] || "مراجع مساندة لتحسين قرار العميل والفرصة.")}</span>
        </div>
        <div class="reference-list">
          ${insights.sources.map((source) => `
            <article class="reference-item ${source.priority === "primary" ? "primary-reference" : ""}">
              <div>
                <strong>${escapeHtml(source.name)}</strong>
                <span>${escapeHtml(source.type || "مرجع خارجي")}</span>
                <p>${escapeHtml(source.note || "")}</p>
              </div>
              <a href="${escapeAttr(source.url)}" target="_blank" rel="noopener">فتح المرجع</a>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderPortfolioProjects(profile) {
    if (!profile.portfolioProjects.length) return "";

    return `
      <section class="detail-box portfolio-box">
        <h3>مشاريع المحفظة المرتبطة</h3>
        <div class="portfolio-list">
          ${profile.portfolioProjects.slice(0, 6).map((project) => `
            <div class="portfolio-item">
              <div>
                <strong>${escapeHtml(project.project)}</strong>
                <span>${escapeHtml(project.portfolio)} — ${escapeHtml(project.statusLabel)}</span>
              </div>
              <span>${escapeHtml(formatMoney(project.amount))}</span>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderMatrix() {
    const topProfiles = state.filtered.slice(0, 36);
    if (!topProfiles.length) {
      els.priorityMatrix.innerHTML = "";
      return;
    }

    els.priorityMatrix.innerHTML = topProfiles.map((profile) => {
      const x = clamp(100 - profile.riskScore, 6, 94);
      const y = clamp(100 - profile.priorityScore, 6, 94);
      const size = clamp(20 + profile.live.length * 4 + profile.total * .16, 22, 46);
      const color = profile.riskScore >= 72 ? "var(--red)" : profile.priorityScore >= 76 ? "var(--green)" : "var(--navy-2)";
      return `<button class="matrix-point" type="button" title="${escapeAttr(profile.owner)} — أولوية ${profile.priorityScore} / مخاطر ${profile.riskScore}" data-owner="${escapeAttr(profile.owner)}" style="right:${x}%; top:${y}%; --size:${size}px; --color:${color};"></button>`;
    }).join("");

    els.priorityMatrix.querySelectorAll(".matrix-point").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedOwner = button.dataset.owner;
        renderList();
        renderDetail();
        document.getElementById("client-detail").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function renderSectorBars() {
    const counts = {};
    state.profiles.forEach((profile) => {
      counts[profile.topSector] = (counts[profile.topSector] || 0) + profile.total + profile.portfolioProjects.length;
    });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const max = entries[0]?.[1] || 1;

    els.sectorBars.innerHTML = entries.map(([sector, count]) => `
      <div class="bar-item">
        <div class="bar-row">
          <span>${escapeHtml(sector)}</span>
          <span>${count}</span>
        </div>
        <div class="bar-track"><div class="bar-fill" style="--value:${Math.round((count / max) * 100)}%"></div></div>
      </div>
    `).join("");
  }

  function renderResultCount() {
    els.resultCount.textContent = `${state.filtered.length} عميل ظاهر من ${state.profiles.length} خلال ${getReportingWindowLabel()}`;
  }

  function renderLoadError() {
    els.clientList.innerHTML = `<div class="empty-list">تعذر تحميل بيانات العملاء من المصادر المحلية.</div>`;
    els.clientDetail.innerHTML = `
      <div class="empty-state">
        <strong>لا توجد بيانات</strong>
        <p>تأكد من تشغيل السيرفر المحلي ووجود ملف البيانات.</p>
      </div>
    `;
    repairUiText();
  }

  function metric(label, valueText) {
    return `
      <div class="client-metric">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(String(valueText))}</strong>
      </div>
    `;
  }

  function signal(label, value, note) {
    return `
      <div class="signal-item">
        <div>
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(note)}</span>
        </div>
        <div>
          <strong>${value}</strong>
          <div class="progress"><i style="--value:${value}%"></i></div>
        </div>
      </div>
    `;
  }

  function needsDecision(profile) {
    return Boolean(profile.live.length && (profile.priorityScore >= 70 || profile.riskScore >= 68 || profile.urgentLive));
  }

  function profileHasAlert(profile) {
    return getProfileAlerts(profile).length > 0;
  }

  function getProfileAlerts(profile) {
    return state.opportunityAlerts.filter((alert) => (
      clientNamesMatch(alert.owner, profile.owner) ||
      (alert.profileOwner && clientNamesMatch(alert.profileOwner, profile.owner))
    ));
  }

  function exportProfiles() {
    if (!state.profiles.length) {
      showToast("لا توجد بيانات للتصدير.");
      return;
    }
    const headers = ["فترة التحليل", "العميل", "التصنيف", "الأولوية", "المخاطر", "الملاءمة", "العلاقة", "الجارية", "تم التقديم", "مشاريع المحفظة", "قيمة المحفظة", "تنبيهات اعتماد", "أعلى درجة تنبيه", "المرجع الخارجي الأساسي", "عدد المراجع الخارجية", "القطاع", "نوع العمل", "التوصية"];
    const rows = state.profiles.map((profile) => {
      const alerts = getProfileAlerts(profile);
      return [
        getReportingWindowLabel(),
        profile.owner,
        profile.segment,
        profile.priorityScore,
        profile.riskScore,
        profile.fitScore,
        profile.relationshipScore,
        profile.live.length,
        profile.submitted.length,
        profile.portfolioProjects.length,
        profile.portfolioAmount,
        alerts.length,
        alerts[0]?.alertScore || 0,
        profile.externalInsights.primaryLabel,
        profile.externalInsights.sources.length,
        profile.topSector,
        profile.topWorkType,
        profile.recommendation,
      ];
    });
    const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `clients-priority-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast("تم تجهيز ملف CSV لمحفظة العملاء.");
  }

  function getPortalConfig() {
    return window.TENDER_PORTAL_CONFIG || window.APP_CONFIG || window.PORTAL_CONFIG || {};
  }

  function matchesAnyKeyword(valueText, keywords) {
    if (!Array.isArray(keywords) || !keywords.length) return false;
    const normalizedValue = normalizeNameForMatch(valueText);
    return keywords.some((keyword) => {
      const normalizedKeyword = normalizeNameForMatch(keyword);
      return normalizedKeyword && normalizedValue.includes(normalizedKeyword);
    });
  }

  function sourceWeight(source) {
    if (source.priority === "primary") return 4;
    if (source.priority === "client") return 3;
    if (source.priority === "supporting") return 2;
    return 1;
  }

  function extractYear(valueText) {
    const match = String(valueText || "").match(/(20\d{2})/);
    return match ? Number(match[1]) : null;
  }

  function getReportingWindowLabel() {
    return `${state.windowStartYear} - ${state.windowEndYear}`;
  }

  function normalizeNameForMatch(valueText) {
    return decodeMojibake(valueText)
      .toLowerCase()
      .replace(/[أإآ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/(?:شركة|مؤسسة|مجموعة|للمقاولات|المقاولات|السعودية|السعوديه|فرع)/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, "");
  }

  function clientNamesMatch(first, second) {
    const a = normalizeNameForMatch(first);
    const b = normalizeNameForMatch(second);
    if (!a || !b) return false;
    if (a === b) return true;
    const shortest = Math.min(a.length, b.length);
    return shortest > 5 && (a.includes(b) || b.includes(a));
  }

  function findMatchingOwner(client, groups) {
    for (const owner of groups.keys()) {
      if (clientNamesMatch(owner, client)) return owner;
    }
    return "";
  }

  function formatMoney(valueText) {
    const valueNumber = Number(valueText) || 0;
    if (!valueNumber) return "0 ر.س";
    if (valueNumber >= 1000000000) return `${(valueNumber / 1000000000).toLocaleString("ar-SA", { maximumFractionDigits: 2 })} مليار ر.س`;
    if (valueNumber >= 1000000) return `${(valueNumber / 1000000).toLocaleString("ar-SA", { maximumFractionDigits: 1 })} مليون ر.س`;
    return `${valueNumber.toLocaleString("ar-SA", { maximumFractionDigits: 0 })} ر.س`;
  }

  function value(row, ...keys) {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null && String(row[key]).trim() !== "") return String(row[key]).trim();
    }
    return "";
  }

  function countBy(rows, field) {
    return rows.reduce((acc, row) => {
      const key = row[field] || "غير مصنف";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  function topEntry(object) {
    return Object.entries(object).sort((a, b) => b[1] - a[1])[0];
  }

  function getNearestTender(live) {
    return live
      .filter((tender) => parseDate(tender.submitDate))
      .sort((a, b) => parseDate(a.submitDate) - parseDate(b.submitDate))[0] || live[0] || null;
  }

  function sortByDate(rows) {
    return rows.slice().sort((a, b) => {
      const da = parseDate(a.submitDate)?.getTime() || 0;
      const db = parseDate(b.submitDate)?.getTime() || 0;
      return db - da;
    });
  }

  function parseDate(valueText) {
    if (!valueText) return null;
    const date = new Date(`${valueText}T12:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function daysUntil(valueText) {
    const date = parseDate(valueText);
    if (!date) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    return Math.ceil((date - today) / 86400000);
  }

  function formatDays(days) {
    if (!Number.isFinite(days)) return "غير محدد";
    if (days < 0) return "متأخر";
    if (days === 0) return "اليوم";
    if (days === 1) return "غدًا";
    return `${days} يوم`;
  }

  function formatDate(valueText) {
    const date = parseDate(valueText);
    if (!date) return "بدون تاريخ";
    return date.toLocaleDateString("ar-SA", { year: "numeric", month: "short", day: "numeric" });
  }

  function formatDateTime(valueText) {
    const date = valueText ? new Date(valueText) : null;
    if (!date || Number.isNaN(date.getTime())) return "غير محدد";
    return date.toLocaleString("ar-SA", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function animateNumber(element, valueText) {
    if (!element) return;
    element.textContent = Number(valueText).toLocaleString("ar-SA");
  }

  function setStatus(text) {
    if (!els.dataStatus) return;
    els.dataStatus.textContent = text;
  }

  function showToast(message) {
    els.toast.textContent = decodeMojibake(message);
    els.toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 3200);
  }

  function repairUiText(root = document.body) {
    const textNodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      textNodes.push(node);
      node = walker.nextNode();
    }
    textNodes.forEach((textNode) => {
      const fixed = decodeMojibake(textNode.nodeValue);
      if (fixed !== textNode.nodeValue) textNode.nodeValue = fixed;
    });
    root.querySelectorAll("[title], [placeholder], [aria-label]").forEach((element) => {
      ["title", "placeholder", "aria-label"].forEach((name) => {
        if (!element.hasAttribute(name)) return;
        const current = element.getAttribute(name);
        const fixed = decodeMojibake(current);
        if (fixed !== current) element.setAttribute(name, fixed);
      });
    });
  }

  function decodeMojibake(valueText) {
    const text = String(valueText ?? "");
    if (!/[ØÙÚÂâ]/.test(text)) return text;
    const cp1252 = {
      0x20ac: 0x80,
      0x201a: 0x82,
      0x0192: 0x83,
      0x201e: 0x84,
      0x2026: 0x85,
      0x2020: 0x86,
      0x2021: 0x87,
      0x02c6: 0x88,
      0x2030: 0x89,
      0x0160: 0x8a,
      0x2039: 0x8b,
      0x0152: 0x8c,
      0x017d: 0x8e,
      0x2018: 0x91,
      0x2019: 0x92,
      0x201c: 0x93,
      0x201d: 0x94,
      0x2022: 0x95,
      0x2013: 0x96,
      0x2014: 0x97,
      0x02dc: 0x98,
      0x2122: 0x99,
      0x0161: 0x9a,
      0x203a: 0x9b,
      0x0153: 0x9c,
      0x017e: 0x9e,
      0x0178: 0x9f,
    };
    const bytes = [];
    for (const char of text) {
      const code = char.charCodeAt(0);
      bytes.push(code <= 255 ? code : (cp1252[code] || 63));
    }
    try {
      return new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes));
    } catch (error) {
      return text;
    }
  }

  function unique(items) {
    return Array.from(new Set(items.filter(Boolean)));
  }

  function clamp(valueText, min, max) {
    return Math.max(min, Math.min(max, Number(valueText) || 0));
  }

  function csvCell(valueText) {
    const text = String(valueText ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  }

  function escapeHtml(valueText) {
    return String(valueText ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(valueText) {
    return escapeHtml(valueText).replace(/`/g, "&#096;");
  }

  function toCamel(id) {
    return id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }
})();
