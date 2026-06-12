-- ════════════════════════════════════════════════════════════════
--  جداول وحدة التنسيق (coordination)
--  • dept_notifications : إشعارات بين الأقسام (مع Realtime لكل قسم)
--  • dept_library_links : روابط مكتبات الأقسام (تُخزَّن في القاعدة لا في المتصفح)
--  أُعيد بناء التعريف من استخدام coordination/db.js لأن هذين الجدولين
--  كانا موجودَين في القاعدة الحيّة دون تعريف ضمن المايجريشن.
--  نفّذه مرة واحدة في:  Supabase Dashboard → SQL Editor → Run
-- ════════════════════════════════════════════════════════════════

-- ── إشعارات الأقسام ──
create table if not exists public.dept_notifications (
  id            uuid default gen_random_uuid() primary key,
  from_dept     text,
  from_name     text default '',
  to_dept       text not null,
  tender_id     text references public.tenders(id) on delete cascade,
  tender_title  text default '',
  type          text default 'custom',
  message       text,
  is_read       boolean default false,
  created_at    timestamptz default now()
);
create index if not exists dept_notifications_to_dept
  on public.dept_notifications (to_dept, is_read);

alter table public.dept_notifications enable row level security;
drop policy if exists "dept_notifications authenticated all" on public.dept_notifications;
create policy "dept_notifications authenticated all"
  on public.dept_notifications
  for all
  to authenticated
  using (true)
  with check (true);

-- ── روابط مكتبات الأقسام ──
create table if not exists public.dept_library_links (
  dept_key    text primary key,
  url         text,
  updated_at  timestamptz default now()
);

alter table public.dept_library_links enable row level security;
drop policy if exists "dept_library_links authenticated all" on public.dept_library_links;
create policy "dept_library_links authenticated all"
  on public.dept_library_links
  for all
  to authenticated
  using (true)
  with check (true);

-- ── تفعيل Realtime لإشعارات الأقسام (يشترك db.js في INSERT لكل قسم) ──
alter publication supabase_realtime add table public.dept_notifications;
