# فصل قاعدة البيانات في مشروع Supabase مستقل

الهدف: منح هذا الريبو (`tender-unified`) **قاعدة Supabase خاصة به** منفصلة تماماً
عن الريبو الآخر (`tender-portal-unified`) الذي يشاركه القاعدة حالياً — دون تغيير
التقنية ودون إعادة كتابة الكود.

النتيجة: قاعدتان مستقلتان، مفتاحان مختلفان، لا تأثير متبادل.

---

## ما الذي يحتاجه هذا المشروع من Supabase
موقع ثابت (HTML/CSS/JS) يستدعي Supabase من المتصفح مباشرة، ويعتمد على:

- **قاعدة Postgres** ‏(16 جدولاً) + علاقات + RLS.
- **Realtime** على جداول لوحة العمليات وإشعارات الأقسام.
- **Storage** (بكت `tender-files` للمرفقات).
- **Auth** (`auth.users` — مدمج في كل مشروع Supabase؛ المصادقة مُزالة مؤقتاً من الواجهة).

---

## ⚠️ ملاحظتان مهمتان قبل البدء

1. **ملفات المايجريشن في الريبو ليست نسخة طبق الأصل من القاعدة الحيّة.**
   جدولا `dept_notifications` و`dept_library_links` كانا غير معرَّفين ضمن
   المايجريشن (أُضيفا الآن في `008_coordination_tables.sql` بإعادة بناء من الكود).
   وقد تكون سياسات RLS الحيّة عُدّلت يدوياً (مثلاً للسماح للدور `anon` بعد إزالة
   المصادقة) بصورة لا تعكسها الملفات.

2. لذلك **الطريقة الأضمن = نسخ السكيمة الحيّة كما هي** (الطريقة أ أدناه).
   استخدم ملفات المايجريشن (الطريقة ب) فقط إن تعذّر ذلك.

---

## الطريقة (أ) — نسخ السكيمة الحيّة  ✅ الموصى بها

تنسخ كل شيء كما هو فعلاً (الجداول + السياسات + الدوال + التريغرات)، بما فيها أي
تعديلات يدوية على القاعدة الحالية.

1. **أنشئ المشروع الجديد**: لوحة [supabase.com](https://supabase.com) → New project.
   اختر اسماً (مثل `tender-unified-prod`) ومنطقة قريبة، واحفظ كلمة مرور القاعدة.

2. **صدّر سكيمة القاعدة الحالية** (بدون البيانات) عبر `pg_dump` باستخدام
   *Connection string* للمشروع القديم (لوحة Supabase → Project Settings → Database):

   ```bash
   pg_dump "postgresql://postgres:[OLD_PASS]@[OLD_HOST]:5432/postgres" \
     --schema=public --schema-only --no-owner --no-privileges \
     -f schema.sql
   ```

3. **طبّقها على المشروع الجديد**:

   ```bash
   psql "postgresql://postgres:[NEW_PASS]@[NEW_HOST]:5432/postgres" -f schema.sql
   ```

4. **أنشئ بكت التخزين** يدوياً في المشروع الجديد: Storage → New bucket باسم
   **`tender-files`** (نفس الاسم المستخدم في `004_storage_policies.sql`).

5. **فعّل Realtime** على الجداول إن لم يُنقل تلقائياً: Database → Replication →
   `supabase_realtime` → أضف: `tender_dept_status`, `tender_assignments`,
   `tender_approvals`, `tender_stage_override`, `tender_comments`,
   `dept_notifications`.

> لنقل **البيانات** أيضاً (اختياري): كرّر `pg_dump` بـ `--data-only` على القاعدة
> القديمة ثم `psql` على الجديدة. لا تنقل البيانات إن أردت بداية نظيفة.

---

## الطريقة (ب) — من ملفات المايجريشن  (بديل)

نفّذ الملفات بالترتيب في: المشروع الجديد → SQL Editor → New query → Run.

| الترتيب | الملف | المحتوى |
|---|---|---|
| 1 | `supabase/migrations/001_initial_schema.sql` | الجداول الأساسية + RLS + التريغر |
| 2 | `supabase/migrations/003_extended_schema.sql` | جداول العملاء/العقود/الفواتير/الإشعارات |
| 3 | `supabase/migrations/004_storage_policies.sql` | سياسات بكت `tender-files` |
| 4 | `supabase/migrations/005_fix_user_trigger.sql` | تصحيح تريغر إنشاء profile |
| 5 | `supabase/migrations/007_enable_realtime.sql` | تفعيل Realtime لجداول العمليات |
| 6 | `supabase/migrations/008_coordination_tables.sql` | جدولا التنسيق (المضافان حديثاً) |
| 7 | `supabase/ops_state.sql` | تخزين المهام/التصنيفات المشترك |

ملاحظات:
- **قبل الخطوة 3** أنشئ بكت Storage باسم `tender-files` يدوياً، وإلا فشلت السياسات.
- ملفّا `002_seed_tenders.sql` و`006_seed_all_tenders.sql` بيانات تجريبية —
  نفّذهما فقط إن أردت بيانات بداية (آمنان للتكرار عبر `ON CONFLICT`).
- راجع سياسات RLS بعد التطبيق: إن كانت الواجهة تعمل حالياً بمفتاح `anon` دون
  تسجيل دخول، فقد تحتاج السماح للدور `anon` بدل `authenticated` فقط.

---

## تبديل المفاتيح في هذا الريبو

التطبيق يقرأ المفاتيح من `config.js`، وهي تُحقن وقت الـ build على Cloudflare Pages
من Environment Variables (لا تكتب مفاتيح حقيقية في الملف):

```js
// config.js
window.APP_CONFIG = {
  supabaseUrl:  "__SUPABASE_URL__",      // ← يُستبدل وقت الـ build
  supabaseKey:  "__SUPABASE_ANON_KEY__", // ← يُستبدل وقت الـ build
  refreshMs: 60 * 1000,
};
```

في لوحة Cloudflare Pages لهذا المشروع → Settings → Environment variables، حدّث:

- `SUPABASE_URL`     → عنوان المشروع **الجديد**
- `SUPABASE_ANON_KEY`→ مفتاح anon للمشروع **الجديد**

(تجدهما في لوحة Supabase الجديدة → Project Settings → API.)
ثم أعد النشر (Deploy). يبقى الريبو الآخر على القاعدة القديمة → انفصلا تماماً.

---

## التحقق بعد التبديل
- افتح `/tenders/` وتأكد من تحميل المناقصات (مصدر API الحي ثم `data.json` احتياطياً).
- جرّب وحدة `coordination/`: إشعار قسم + رابط مكتبة → يتأكد أن `dept_notifications`
  و`dept_library_links` تعملان على القاعدة الجديدة.
- افتح صفحتين وعدّل حالة قسم → يجب أن تنعكس فوراً (Realtime).
