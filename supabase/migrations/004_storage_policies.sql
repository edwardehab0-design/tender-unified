-- ============================================================
-- Storage policies for the "tender-files" bucket
-- ============================================================
-- خطوة يدوية أولاً:
--   Supabase Dashboard → Storage → New bucket
--   Name: tender-files
--   Public: OFF  (خاص — الوصول عبر الصلاحيات فقط)
-- ثم شغّل هذا الملف في SQL Editor.
-- ============================================================

-- أي مستخدم مسجّل يستطيع قراءة/تنزيل ملفات هذا الـ bucket
CREATE POLICY "authenticated read tender-files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tender-files' AND auth.role() = 'authenticated');

-- أي مستخدم مسجّل يستطيع رفع ملف
CREATE POLICY "authenticated upload tender-files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'tender-files' AND auth.role() = 'authenticated');

-- صاحب الملف فقط (أو منفّذ) يستطيع حذفه
CREATE POLICY "owner delete tender-files"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'tender-files'
    AND (owner = auth.uid() OR is_executive())
  );
