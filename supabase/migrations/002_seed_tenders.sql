-- ============================================================
-- Seed existing tenders from data.json into the tenders table
-- Run AFTER 001_initial_schema.sql
-- ============================================================

INSERT INTO tenders (id, title, client, sector, work_type, submit_date, guarantee_date, external_status, fetched_at)
VALUES
  ('b54d51ac8b20','اعمال التسوية لخزام 4','الشركة الوطنية للإسكان','محفظة مشاريع البنية التحتية','البنية التحتية البسيطة','2026-06-03','2026-05-31','جارية','2026-06-03T02:07:30.492163'),
  ('2d9c61af3a02','تنفيذ حلول تصريف مياه الأمطار - المنطقة الشمالية','أمانة منطقة الرياض','محفظة مشاريع البنية التحتية','الصرف الصحي والمياه','2026-06-05','2026-06-03','جارية','2026-06-03T02:07:30.492163')
ON CONFLICT (id) DO NOTHING;

-- NOTE: Run the full seed by importing data.json via the
-- supabase/scripts/import_tenders.py script (generated separately).
