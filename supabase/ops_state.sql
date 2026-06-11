-- ════════════════════════════════════════════════════════════════
--  التخزين المشترك للعمليات (ops_state)
--  يخزّن: المهام (k='tasks') + تصنيفات المناقصات (k='tender_types')
--  كقيم JSON، فتُشارَك بين كل المتصفحات والمستخدمين المسجّلين.
--  نفّذ هذا مرة واحدة في:  Supabase Dashboard → SQL Editor → New query → Run
-- ════════════════════════════════════════════════════════════════

create table if not exists public.ops_state (
  k          text primary key,
  v          jsonb,
  updated_at timestamptz default now()
);

alter table public.ops_state enable row level security;

-- صلاحية كاملة (قراءة/كتابة) للمستخدمين المسجّل دخولهم فقط
drop policy if exists "ops_state authenticated all" on public.ops_state;
create policy "ops_state authenticated all"
  on public.ops_state
  for all
  to authenticated
  using (true)
  with check (true);
