// auth-guard.js — أضِف هذا السكريبت في <head> كل صفحة محمية
// يُعيد توجيه المستخدم لـ /login.html إن لم يكن مسجّل دخوله
(async () => {
  const SUPABASE_URL = window.APP_CONFIG?.supabaseUrl;
  const SUPABASE_KEY = window.APP_CONFIG?.supabaseKey;
  // إن لم تُحقن المفاتيح بعد (placeholder ما زال يحوي "__") نتخطّى الحارس
  // بأمان فيعمل الموقع على data.json دون كسر بدل محاولة استخدام رابط غير صالح
  if (!SUPABASE_URL || SUPABASE_URL.includes("__")) return; // dev / not configured

  // نحتاج Supabase JS — انتظر تحميله إن لزم
  const waitForSupabase = () => new Promise((resolve) => {
    if (window.supabase) { resolve(); return; }
    const t = setInterval(() => { if (window.supabase) { clearInterval(t); resolve(); } }, 50);
  });
  await waitForSupabase();

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  const { data } = await sb.auth.getSession();
  if (!data?.session) {
    window.location.replace("/login.html");
  } else {
    // حدّث sessionStorage للتوافق مع الكود الحالي
    const { data: profile } = await sb.from("profiles")
      .select("role, department_key").eq("id", data.session.user.id).single();
    if (profile) {
      sessionStorage.setItem("alrawafPortalRole", profile.role === "executive" ? "manager" : "department");
      if (profile.department_key)
        sessionStorage.setItem("alrawafDepartmentKey", profile.department_key);
    }
  }
})();
