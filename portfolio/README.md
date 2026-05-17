# صفحة نمو محفظة المناقصات

هذه صفحة Static مناسبة للنشر على Cloudflare Pages. الصفحة تقرأ البيانات من `data.json` وتحدث نفسها كل دقيقة.

## مصدر البيانات المتوقع

`data.json` يجب أن يحتوي:

```json
{
  "generatedAt": "2026-05-17T12:00:00Z",
  "currency": "SAR",
  "projects": [
    {
      "number": "1",
      "amount": 901598260,
      "amountExclVat": 901598260,
      "amountInclVat": 1036837999,
      "project": "اسم المشروع",
      "client": "اسم العميل",
      "status": "awarded_not_signed",
      "statusLabel": "تم الترسية ولم يتم توقيع العقد",
      "portfolio": "المياه والنقل"
    }
  ]
}
```

يمكن الاكتفاء بالحقل `amount` وسيعتبره الموقع "غير شامل الضريبة" ويحسب شامل الضريبة بنسبة 15%. لكن الأفضل في الربط النهائي إرسال `amountExclVat` و `amountInclVat` صراحة.

## ربط SharePoint

لا تضع أسرار Microsoft أو Client Secret داخل ملفات Cloudflare Pages. استخدم أحد المسارين:

1. Power Automate يقرأ Excel ويحفظ `data.json` في مكان عام/مصرح تقرؤه الصفحة.
2. Cloudflare Worker يقرأ Excel عبر Microsoft Graph، ويحفظ الأسرار في Worker Secrets، ثم ترجع الصفحة JSON من worker endpoint.
