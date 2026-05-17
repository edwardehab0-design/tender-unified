# بوابة المناقصات الموحدة

هذه نسخة دمج أولية تجمع:

- نمو محفظة المناقصات داخل `portfolio/`
- المناقصات الجارية داخل `tenders/`
- أهم العملاء داخل `clients/`
- التحليلات داخل `analytics/`
- تقارير الإدارة العليا داخل `tenders/#executive-report`

## النشر على Cloudflare Pages

ارفع محتويات هذا المجلد أو الملف المضغوط:

`alrawaf-unified-tender-portal.zip`

## مصادر البيانات الحالية

- `portfolio/data.json`: بيانات محفظة المناقصات الحالية.
- `data.json`: بيانات المناقصات الجارية وبيانات تم التقديم، ويتم تحديثه من موقع Tender.
- `tenders/data.json`, `clients/data.json`, `analytics/data.json`: نسخ محلية قديمة للاختبار فقط، وليست المصدر النهائي.

الواجهة تبحث أولا عن مصادر API حية، ثم ترجع تلقائيا للملفات المحلية عند عدم توفر API:

- `/api/portfolio`
- `/api/live-tenders`
- `/api/executive-report`

ملف الإعدادات:

`config.js`

يمكن تغيير مسارات API منه عند النشر.

## التحديث الحي من Tender

تم تجهيز GitHub Actions لتحديث `data.json` تلقائيا كل 10 دقائق من موقع Tender:

`.github/workflows/sync-tender-data.yml`

السكربت المستخدم:

`scripts/sync_tender_data.py`

أضف هذه القيم داخل GitHub Secrets:

- `ALRAWAF_USERNAME`
- `ALRAWAF_PASSWORD`
- `ALRAWAF_CLIENT_ID` اختياري إذا تغير.
- `ALRAWAF_TENANT` اختياري، والقيمة الافتراضية `alrawaf.com.sa`.

بعد كل تحديث ناجح، يتم عمل commit تلقائي لـ `data.json`، ثم يعيد Cloudflare Pages النشر من GitHub.
