-- ============================================================
-- تفعيل التحديثات الفورية (Realtime) على جداول لوحة العمليات
-- بحيث تنعكس تغييرات أي مستخدم فوراً على شاشات البقية.
-- اختياري: التطبيق يعمل بدونه لكن دون مزامنة فورية بين المستخدمين.
-- شغّله مرة واحدة في SQL Editor.
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE tender_dept_status;
ALTER PUBLICATION supabase_realtime ADD TABLE tender_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE tender_approvals;
ALTER PUBLICATION supabase_realtime ADD TABLE tender_stage_override;
ALTER PUBLICATION supabase_realtime ADD TABLE tender_comments;
