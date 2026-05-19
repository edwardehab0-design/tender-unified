# SharePoint Live Excel Setup

الربط المقترح لا يحتاج أن يكون جهازك يعمل. GitHub Actions يقرأ ملفي Excel من SharePoint كل 10 دقائق عبر Microsoft Graph، ثم يحدث ملفات JSON التي يقرأها الموقع على Cloudflare Pages.

## المخرجات

- ملف محفظة المناقصات يحدث: `portfolio/data.json`
- ملف تقرير الإدارة العليا يحدث: `executive-report/data.json`

الموقع العام يقرأ JSON فقط. بيانات Microsoft والـ SharePoint لا تظهر في المتصفح.

## GitHub Secrets المطلوبة

اذهب إلى:

`Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`

وأضف هذه الأسرار:

- `SP_TENANT_ID`: رقم Tenant ID من Microsoft Entra.
- `SP_CLIENT_ID`: رقم Application / Client ID للتطبيق.
- `SP_CLIENT_SECRET`: السر الذي سيتم إنشاؤه للتطبيق.
- `SP_PORTFOLIO_EXCEL_URL`: رابط ملف Excel الخاص بمحفظة المناقصات في SharePoint.
- `SP_EXECUTIVE_EXCEL_URL`: رابط ملف Excel الخاص بتقرير الإدارة العليا في SharePoint.

## Microsoft Entra App

1. افتح Microsoft Entra admin center.
2. ادخل إلى `App registrations`.
3. اختر `New registration`.
4. اكتب الاسم مثلاً: `Tender Portal SharePoint Sync`.
5. بعد الإنشاء، انسخ:
   - `Application (client) ID` إلى `SP_CLIENT_ID`
   - `Directory (tenant) ID` إلى `SP_TENANT_ID`
6. من `Certificates & secrets` أنشئ `New client secret` وانسخ قيمة السر إلى `SP_CLIENT_SECRET`.

## الصلاحيات

الأفضل أمنياً:

- Microsoft Graph Application permission: `Sites.Selected`
- ثم تمنح التطبيق قراءة على موقع SharePoint أو الملفات المطلوبة فقط.

الأسرع للاختبار إذا كانت سياسة الدومين تسمح:

- Microsoft Graph Application permission: `Files.Read.All`
- اضغط `Grant admin consent`.

بعد نجاح التجربة يمكن تضييق الصلاحيات إلى `Sites.Selected`.

## التشغيل

الملف المسؤول:

`.github/workflows/sync-sharepoint-excels.yml`

يشغل:

- يدوياً من تبويب `Actions` عبر `Run workflow`.
- تلقائياً كل 10 دقائق.

بعد النجاح سيظهر commit تلقائي باسم:

`sync: update sharepoint excel data`
