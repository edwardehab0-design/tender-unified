// ── Portal Configuration ──────────────────────────────────────
// القيم المحيطة بـ __REPLACE__ تُستبدل تلقائياً بواسطة
// Cloudflare Pages عبر Environment Variables أثناء الـ build.
// لا تضع مفاتيح حقيقية هنا مباشرة — ضعها في Cloudflare Dashboard.
window.APP_CONFIG = {
  supabaseUrl:  "__SUPABASE_URL__",
  supabaseKey:  "__SUPABASE_ANON_KEY__",
  refreshMs: 60 * 1000,
  sources: {
    portfolio: ["/api/portfolio", "/portfolio/data.json"],
    liveTenders: ["/api/live-tenders", "/tenders/data.json"],
    executiveReport: ["/api/executive-report", "/executive-report/data.json"],
    clientReferences: ["/api/client-references", "/clients/references.json"],
    opportunityRules: ["/api/opportunity-rules", "/clients/opportunity-rules.json"],
    etimadCandidates: ["/api/etimad-candidates", "/clients/etimad-candidates.json"],
  },
};

// للتوافق مع الكود القديم
window.TENDER_PORTAL_CONFIG = window.APP_CONFIG;
