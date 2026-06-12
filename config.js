// ── Portal Configuration ──────────────────────────────────────
// القيم المحيطة بـ __REPLACE__ تُستبدل تلقائياً بواسطة
// Cloudflare Pages عبر Environment Variables أثناء الـ build.
// لا تضع مفاتيح حقيقية هنا مباشرة — ضعها في Cloudflare Dashboard.
(function () {
  // جذر النشر يُشتق من موقع config.js نفسه، فتعمل مسارات البيانات سواء
  // نُشر الموقع على جذر النطاق (Cloudflare Pages) أو على مسار فرعي
  // (GitHub Pages مثل /tender-unified/) ومن أي صفحة في أي وحدة.
  var src = document.currentScript && document.currentScript.src;
  var base = src ? src.slice(0, src.lastIndexOf("/") + 1) : "/";

  window.APP_CONFIG = {
    supabaseUrl:  "__SUPABASE_URL__",
    supabaseKey:  "__SUPABASE_ANON_KEY__",
    refreshMs: 60 * 1000,
    sources: {
      portfolio: ["/api/portfolio", base + "portfolio/data.json"],
      liveTenders: ["/api/live-tenders", base + "tenders/data.json"],
      executiveReport: ["/api/executive-report", base + "executive-report/data.json"],
      clientReferences: ["/api/client-references", base + "clients/references.json"],
      opportunityRules: ["/api/opportunity-rules", base + "clients/opportunity-rules.json"],
      etimadCandidates: ["/api/etimad-candidates", base + "clients/etimad-candidates.json"],
    },
  };

  // للتوافق مع الكود القديم
  window.TENDER_PORTAL_CONFIG = window.APP_CONFIG;
})();
