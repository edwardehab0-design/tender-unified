// ── Portal Configuration ──────────────────────────────────────
// القيم المحيطة بـ __REPLACE__ تُستبدل تلقائياً بواسطة
// Cloudflare Pages عبر Environment Variables أثناء الـ build.
// لا تضع مفاتيح حقيقية هنا مباشرة — ضعها في Cloudflare Dashboard.
window.APP_CONFIG = {
  supabaseUrl:  "__SUPABASE_URL__",
  supabaseKey:  "__SUPABASE_ANON_KEY__",
  refreshMs: 60 * 1000,
};

// للتوافق مع الكود القديم
window.TENDER_PORTAL_CONFIG = window.APP_CONFIG;
