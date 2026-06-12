const sameOriginData = './data.json';
const githubFallbackData = 'https://raw.githubusercontent.com/edwardehab0-design/tender-portal-unified/main/executive-report/data.json';
const PORTAL_CONFIG = window.TENDER_PORTAL_CONFIG || {};
const configuredSources = PORTAL_CONFIG.sources?.executiveReport || [];
const DATA_SOURCES = configuredSources.length ? configuredSources.concat(githubFallbackData) : [sameOriginData, githubFallbackData];

const state = {
  report: null,
  activeIndex: -1,
  query: '',
};

const $ = (selector) => document.querySelector(selector);
const numberFmt = new Intl.NumberFormat('en-US');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function clean(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

async function fetchJson(url) {
  const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function loadReport() {
  let lastError = null;
  for (const source of DATA_SOURCES) {
    try {
      state.report = await fetchJson(source);
      render();
      return;
    } catch (error) {
      lastError = error;
    }
  }
  showStatus(`تعذر قراءة بيانات تقرير الإدارة العليا: ${lastError?.message || 'خطأ غير معروف'}`);
}

function usableSheets() {
  return (state.report?.sheets || []).filter((sheet) => {
    const rows = sheetRows(sheet);
    return rows.headers.length || rows.rows.length;
  });
}

function visibleHeaders(headers, rows) {
  return headers.filter((header, index) => {
    if (!header || /^column_\d+$/i.test(header)) {
      return rows.some((row) => clean(row[index]));
    }
    return true;
  });
}

function sheetRows(sheet) {
  const objects = Array.isArray(sheet.objects) ? sheet.objects : [];
  if (objects.length) {
    const headers = [...new Set(objects.flatMap((item) => Object.keys(item || {})))];
    const rows = objects.map((item) => headers.map((header) => clean(item?.[header])));
    const filteredHeaders = visibleHeaders(headers, rows);
    const indexes = filteredHeaders.map((header) => headers.indexOf(header));
    return {
      headers: filteredHeaders,
      rows: rows.map((row) => indexes.map((index) => row[index] || '')).filter((row) => row.some(Boolean)),
    };
  }

  const rawRows = Array.isArray(sheet.rows) ? sheet.rows : [];
  if (!rawRows.length) return { headers: [], rows: [] };
  const headerIndex = detectHeaderIndex(rawRows);
  const headers = rawRows[headerIndex].map((value, index) => clean(value) || `عمود ${index + 1}`);
  const dataRows = rawRows.slice(headerIndex + 1).map((row) => headers.map((_, index) => clean(row[index])));
  const filteredHeaders = visibleHeaders(headers, dataRows);
  const indexes = filteredHeaders.map((header) => headers.indexOf(header));
  return {
    headers: filteredHeaders,
    rows: dataRows.map((row) => indexes.map((index) => row[index] || '')).filter((row) => row.some(Boolean)),
  };
}

function detectHeaderIndex(rows) {
  let bestIndex = 0;
  let bestScore = -1;
  rows.slice(0, 18).forEach((row, index) => {
    const filled = row.filter((cell) => clean(cell)).length;
    const keywords = row.filter((cell) => /مشروع|مناقصة|المالك|العميل|تاريخ|حالة|ملاحظ|قيمة|الفرصة/.test(clean(cell))).length;
    const score = filled + (keywords * 4);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function filteredRows(rows) {
  const q = state.query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => row.join(' ').toLowerCase().includes(q));
}

function sheetStats(sheet) {
  const { headers, rows } = sheetRows(sheet);
  const cells = rows.flat();
  const filled = cells.filter(Boolean).length;
  const density = headers.length && rows.length ? Math.round((filled / (headers.length * rows.length)) * 100) : 0;
  return {
    name: sheet.name || 'قسم بدون اسم',
    headers,
    rows,
    count: rows.length,
    fields: headers.length,
    filled,
    density,
  };
}

function reportStats() {
  const sheets = usableSheets().map(sheetStats);
  const totalRows = sheets.reduce((sum, sheet) => sum + sheet.count, 0);
  const totalFields = sheets.reduce((sum, sheet) => sum + sheet.fields, 0);
  const maxRows = Math.max(...sheets.map((sheet) => sheet.count), 1);
  const topSheet = sheets.reduce((best, sheet) => (sheet.count > (best?.count || 0) ? sheet : best), null);
  return { sheets, totalRows, totalFields, maxRows, topSheet };
}

function render() {
  const sheets = usableSheets();
  renderTabs(sheets);
  if (state.activeIndex === -1) {
    renderOverview();
  } else {
    renderActiveSheet(sheets);
  }
}

function renderTabs(sheets) {
  const tabs = $('#sheet-tabs');
  const overviewActive = state.activeIndex === -1 ? ' active' : '';
  tabs.innerHTML = `
    <button class="tab-button overview-tab${overviewActive}" type="button" data-index="-1">
      نظرة عامة
    </button>
    ${sheets.map((sheet, index) => {
      const active = index === state.activeIndex ? ' active' : '';
      return `<button class="tab-button${active}" type="button" data-index="${index}">
        <span>${escapeHtml(sheet.name || `صفحة ${index + 1}`)}</span>
      </button>`;
    }).join('')}
  `;

  tabs.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeIndex = Number(button.dataset.index);
      state.query = '';
      $('#search-input').value = '';
      render();
    });
  });
}

function renderOverview() {
  const stats = reportStats();
  const ordered = overviewOrder(stats.sheets);
  const technical = statusBreakdown(stats.sheets, [
    ['مقبول', /مقبول(?!ة)|تم القبول/],
    ['فتح العرض الفني', /فتح العرض الفني|العرض الفني/],
    ['غير معلوم', /غير معلوم|لا يوجد إفادة|غير محدد/],
    ['غير مقبول', /غير مقبول|مرفوض/],
    ['لم تحدد بعد', /لم تحدد|تحت الإجراء|جاري/],
  ]);
  const qualification = statusBreakdown(stats.sheets.filter((sheet) => /تأهيل/.test(sheet.name)), [
    ['مقبول', /مقبول(?!ة)|تم القبول/],
    ['لا يوجد إفادة', /لا يوجد إفادة/],
    ['جاري العمل', /جاري العمل|جاري/],
    ['لم تحدد', /لم تحدد|غير محدد/],
  ]);
  const current = findByKind(stats.sheets, 'ongoing');
  const submitted = findByKind(stats.sheets, 'submitted');
  $('#active-sheet-name').textContent = 'النظرة العامة';
  $('#active-sheet-count').textContent = '';
  $('#search-input').classList.add('hidden');
  $('#table-view').classList.add('hidden');
  $('#overview-view').classList.remove('hidden');
  hideStatus();

  const totalAngle = 360;
  let currentAngle = 0;
  const conic = ordered.map((sheet, index) => {
    const angle = stats.totalRows ? (sheet.count / stats.totalRows) * totalAngle : totalAngle / Math.max(stats.sheets.length, 1);
    const start = currentAngle;
    currentAngle += angle;
    return `${palette(index)} ${start}deg ${currentAngle}deg`;
  }).join(', ');

  $('#overview-view').innerHTML = `
    <section class="kpi-strip">
      ${ordered.map((sheet, index) => kpiCard(sheet, index)).join('')}
    </section>

    <section class="dashboard-grid">
      <div class="dash-panel">
        <div class="dash-title">
          <span class="dot green"></span>
          <h3>نتائج التقييم الفني</h3>
        </div>
        <div class="horizontal-bars">
          ${technical.map((item, index) => horizontalBar(item, index, technical)).join('')}
        </div>
      </div>

      <div class="dash-panel">
        <div class="dash-title">
          <span class="dot blue"></span>
          <h3>توزيع التقرير حسب الأقسام</h3>
        </div>
        <div class="donut-layout">
          <div class="donut small-donut" style="--donut:${conic || 'var(--gold) 0deg 360deg'}">
            <strong>${numberFmt.format(stats.totalRows)}</strong>
            <small>إجمالي</small>
          </div>
          <div class="legend-list">
            ${ordered.map((sheet, index) => legendItem(sheet, index, stats.totalRows)).join('')}
          </div>
        </div>
      </div>

      <div class="dash-panel alliance-panel">
        <div class="dash-title">
          <span class="dot amber"></span>
          <h3>الحركة الحالية - التقديمات والجارية</h3>
        </div>
        <div class="split-numbers">
          <button type="button" data-sheet="${submitted?.sourceIndex ?? -1}">
            <b>${numberFmt.format(submitted?.count || 0)}</b>
            <span>تم تقديمها</span>
          </button>
          <button type="button" data-sheet="${current?.sourceIndex ?? -1}">
            <b>${numberFmt.format(current?.count || 0)}</b>
            <span>تحت المتابعة</span>
          </button>
        </div>
      </div>

      <div class="dash-panel">
        <div class="dash-title">
          <span class="dot gold"></span>
          <h3>نتائج التأهيلات 2026</h3>
        </div>
        <div class="donut-layout">
          <div class="donut small-donut" style="--donut:${statusConic(qualification)}">
            <strong>${numberFmt.format(findByKind(stats.sheets, 'qualification')?.count || 0)}</strong>
            <small>تأهيل</small>
          </div>
          <div class="legend-list status-legend">
            ${qualification.map((item, index) => `
              <div class="legend-item">
                <span style="background:${palette(index)}"></span>
                <p>${escapeHtml(item.label)}</p>
                <b>${numberFmt.format(item.count)}</b>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </section>
  `;

  $('#overview-view').querySelectorAll('[data-sheet]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeIndex = Number(button.dataset.sheet);
      render();
    });
  });
}

function legendItem(sheet, index, totalRows) {
  const pct = totalRows ? Math.round((sheet.count / totalRows) * 100) : 0;
  return `
    <div class="legend-item">
      <span style="background:${palette(index)}"></span>
      <p>${escapeHtml(sheet.name)}</p>
      <b>${numberFmt.format(pct)}%</b>
    </div>
  `;
}

function kpiCard(sheet, index) {
  return `
    <button class="exec-kpi kpi-${overviewKind(sheet.name)}" type="button" data-sheet="${sheet.sourceIndex ?? index}">
      <span>${escapeHtml(kpiTitle(sheet.name))}</span>
      <strong>${numberFmt.format(sheet.count)}</strong>
      <small>${escapeHtml(kpiSubtitle(sheet.name))}</small>
    </button>
  `;
}

function overviewOrder(sheets) {
  const indexed = sheets.map((sheet, sourceIndex) => ({ ...sheet, sourceIndex }));
  const order = ['submitted', 'ongoing', 'qualification', 'eoi', 'special', 'opportunities'];
  return indexed.sort((a, b) => order.indexOf(overviewKind(a.name)) - order.indexOf(overviewKind(b.name)));
}

function overviewKind(name) {
  const text = clean(name);
  if (/تقديم/.test(text)) return 'submitted';
  if (/جارية/.test(text)) return 'ongoing';
  if (/تأهيل/.test(text)) return 'qualification';
  if (/EOI|الرغبة|الاهتمام/i.test(text)) return 'eoi';
  if (/تخصيص/.test(text)) return 'special';
  if (/فرص/.test(text)) return 'opportunities';
  return 'other';
}

function findByKind(sheets, kind) {
  return sheets.map((sheet, sourceIndex) => ({ ...sheet, sourceIndex })).find((sheet) => overviewKind(sheet.name) === kind);
}

function kpiTitle(name) {
  const kind = overviewKind(name);
  return {
    submitted: 'إجمالي المناقصات المقدمة',
    ongoing: 'المناقصات الجارية',
    qualification: 'التأهيلات',
    eoi: 'إبداءات الرغبة EOI',
    special: 'مشاريع التخصيص',
    opportunities: 'فرص منصة فرص',
  }[kind] || name;
}

function kpiSubtitle(name) {
  const kind = overviewKind(name);
  return {
    submitted: 'مناقصة خلال 2026',
    ongoing: 'تحت الإعداد حاليا',
    qualification: 'تأهيل مسبق وعميل',
    eoi: 'مقدمة للعملاء',
    special: 'مشروع استراتيجي',
    opportunities: 'في انتظار القرار',
  }[kind] || 'ضمن التقرير';
}

function statusBreakdown(sheets, definitions) {
  const text = sheets.flatMap((sheet) => sheet.rows).flat().join(' ');
  return definitions.map(([label, pattern]) => ({
    label,
    count: (text.match(new RegExp(pattern.source, 'g')) || []).length,
  }));
}

function horizontalBar(item, index, items) {
  const max = Math.max(...items.map((entry) => entry.count), 1);
  return `
    <div class="hbar-row">
      <span>${escapeHtml(item.label)}</span>
      <i><b style="width:${Math.max(5, Math.round((item.count / max) * 100))}%; background:${palette(index)}">${numberFmt.format(item.count)}</b></i>
      <strong>${numberFmt.format(item.count)}</strong>
    </div>
  `;
}

function statusConic(items) {
  const total = items.reduce((sum, item) => sum + item.count, 0) || 1;
  let angle = 0;
  return items.map((item, index) => {
    const span = (item.count / total) * 360;
    const start = angle;
    angle += span;
    return `${palette(index)} ${start}deg ${angle}deg`;
  }).join(', ');
}

function palette(index) {
  return ['#d4af37', '#00a89d', '#2f80ed', '#8b5cf6', '#ef8f36', '#17365a', '#33b7c7'][index % 7];
}

function flowLabel(name, index) {
  const text = clean(name);
  if (/فرص/.test(text)) return 'بداية الرصد واستكشاف الفرص';
  if (/EOI|الرغبة|الاهتمام/i.test(text)) return 'تسجيل الاهتمام وبناء الحضور';
  if (/تخصيص/.test(text)) return 'فرص استراتيجية تحتاج متابعة';
  if (/تأهيل/.test(text)) return 'بوابة التأهل قبل المنافسة';
  if (/تقديم/.test(text)) return 'المسار الذي وصل لمرحلة التقديم';
  if (/جارية/.test(text)) return 'متابعة نشطة قبل الإغلاق';
  return `محطة تنفيذية ${numberFmt.format(index + 1)}`;
}

function renderActiveSheet(sheets) {
  const sheet = sheets[state.activeIndex] || sheets[0];
  const table = $('#report-table');
  $('#search-input').classList.remove('hidden');
  $('#overview-view').classList.add('hidden');
  $('#table-view').classList.remove('hidden');

  if (!sheet) {
    $('#active-sheet-name').textContent = '-';
    $('#active-sheet-count').textContent = '-';
    table.innerHTML = '';
    showStatus('لا توجد بيانات مقروءة من ملف تقرير الإدارة العليا.');
    return;
  }

  const { headers, rows } = sheetRows(sheet);
  const visibleRows = filteredRows(rows);
  $('#active-sheet-name').textContent = sheet.name || 'صفحة بدون اسم';
  $('#active-sheet-count').textContent = '';

  if (!headers.length || !visibleRows.length) {
    table.innerHTML = '';
    showStatus(state.query ? 'لا توجد نتائج مطابقة للبحث الحالي.' : 'هذه الصفحة لا تحتوي على بيانات قابلة للعرض.');
    return;
  }

  hideStatus();
  table.innerHTML = `
    <thead>
      <tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>
    </thead>
    <tbody>
      ${visibleRows.map((row) => `
        <tr>${row.map((cell) => `<td>${escapeHtml(cell || '-')}</td>`).join('')}</tr>
      `).join('')}
    </tbody>
  `;
}

function exportExecutiveReportExcel() {
  if (!window.XLSX) {
    alert('تعذر تحميل مكتبة التصدير. حاول تحديث الصفحة ثم أعد المحاولة.');
    return;
  }

  const wb = XLSX.utils.book_new();
  usableSheets().forEach((sheet, index) => {
    const { headers, rows } = sheetRows(sheet);
    const tableRows = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(tableRows);
    const sheetName = (clean(sheet.name) || `قسم ${index + 1}`).slice(0, 31);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  if (!wb.SheetNames.length) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['لا توجد بيانات']]), 'التقرير');
  }

  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `تقرير_الإدارة_العليا_${stamp}.xlsx`);
}

function showStatus(message) {
  const box = $('#status-box');
  box.textContent = message;
  box.classList.remove('hidden');
}

function hideStatus() {
  $('#status-box').classList.add('hidden');
}

$('#search-input').addEventListener('input', (event) => {
  state.query = event.target.value;
  render();
});

loadReport();
