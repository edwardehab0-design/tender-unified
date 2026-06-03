-- ============================================================
-- Al-Rawaf Tender Portal — Extended Schema (Phase 2)
-- employees, clients, attachments, contracts, invoices, notifications
-- Run AFTER 001_initial_schema.sql
-- ============================================================

-- ── 1. Employees (engineers & department staff) ─────────────
CREATE TABLE IF NOT EXISTS employees (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name    TEXT NOT NULL,
  department_key TEXT REFERENCES departments(key),
  title        TEXT,                          -- المسمى الوظيفي
  email        TEXT,
  phone        TEXT,
  is_active    BOOLEAN DEFAULT TRUE,
  hire_date    DATE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS employees_dept ON employees(department_key);

-- بذور المهندسين من البيانات الحالية
INSERT INTO employees (full_name, department_key, title) VALUES
  ('أحمد',   'BS',     'محلل سوق'),
  ('عبدالله','BS',     'محلل سوق'),
  ('نواف',   'BS',     'محلل سوق'),
  ('سلمان',  'BS',     'محلل سوق'),
  ('خالد',   'INF',    'مهندس بنية تحتية'),
  ('فيصل',   'INF',    'مهندس بنية تحتية'),
  ('مازن',   'INF',    'مهندس بنية تحتية'),
  ('تركي',   'INF',    'مهندس بنية تحتية'),
  ('محمد',   'TECH',   'مهندس فني'),
  ('راكان',  'TECH',   'مهندس فني'),
  ('بندر',   'TECH',   'مهندس فني'),
  ('مشاري',  'TECH',   'مهندس فني'),
  ('سارة',   'DESIGN', 'مصمم'),
  ('ريما',   'DESIGN', 'مصمم'),
  ('لينا',   'DESIGN', 'مصمم'),
  ('هند',    'DESIGN', 'مصمم')
ON CONFLICT DO NOTHING;

-- ── 2. Clients ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  sector        TEXT,
  contact_name  TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ربط اختياري للمناقصة بعميل (نبقي حقل client النصي للتوافق)
ALTER TABLE tenders ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);

-- ── 3. Attachments (metadata of files in Supabase Storage) ──
CREATE TABLE IF NOT EXISTS attachments (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tender_id    TEXT NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  dept_key     TEXT REFERENCES departments(key),
  file_name    TEXT NOT NULL,
  storage_path TEXT NOT NULL,                 -- المسار داخل bucket
  file_size    BIGINT,
  mime_type    TEXT,
  uploaded_by  UUID REFERENCES auth.users,
  uploaded_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS attachments_tender ON attachments(tender_id);

-- ── 4. Contracts (awards after winning a tender) ────────────
CREATE TABLE IF NOT EXISTS contracts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tender_id       TEXT REFERENCES tenders(id) ON DELETE SET NULL,
  contract_number TEXT UNIQUE,
  award_date      DATE,
  contract_value  NUMERIC(15,2),
  currency        TEXT DEFAULT 'SAR',
  start_date      DATE,
  end_date        DATE,
  status          TEXT DEFAULT 'active'
                    CHECK (status IN ('active','completed','cancelled')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS contracts_tender ON contracts(tender_id);

-- ── 5. Invoices (linked to contracts) ───────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contract_id    UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  invoice_number TEXT,
  amount         NUMERIC(15,2) NOT NULL,
  issue_date     DATE,
  due_date       DATE,
  paid_date      DATE,
  status         TEXT DEFAULT 'pending'
                   CHECK (status IN ('pending','paid','overdue','cancelled')),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS invoices_contract ON invoices(contract_id);

-- ── 6. Notifications (per user) ─────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  title      TEXT NOT NULL,
  body       TEXT,
  type       TEXT DEFAULT 'info'
               CHECK (type IN ('info','warning','danger','success')),
  tender_id  TEXT REFERENCES tenders(id) ON DELETE SET NULL,
  is_read    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, is_read);

-- ============================================================
-- Row Level Security
-- ============================================================

-- helper: is the current user an executive?
CREATE OR REPLACE FUNCTION is_executive()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'executive');
$$;

-- Employees: everyone authenticated reads; executives manage
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read employees"  ON employees FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "manage employees" ON employees FOR ALL USING (is_executive());

-- Clients: everyone authenticated reads; executives manage
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read clients"  ON clients FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "manage clients" ON clients FOR ALL USING (is_executive());

-- Attachments: read own-dept or executive; write own-dept or executive
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read attachments" ON attachments
  FOR SELECT USING (
    is_executive() OR dept_key IS NULL OR
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.department_key = dept_key)
  );
CREATE POLICY "write attachments" ON attachments
  FOR INSERT WITH CHECK (
    is_executive() OR
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.department_key = dept_key)
  );
CREATE POLICY "delete attachments" ON attachments
  FOR DELETE USING (
    is_executive() OR uploaded_by = auth.uid()
  );

-- Contracts & Invoices (financial → executive only writes, all read)
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read contracts"  ON contracts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "manage contracts" ON contracts FOR ALL USING (is_executive());

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read invoices"  ON invoices FOR SELECT USING (is_executive());
CREATE POLICY "manage invoices" ON invoices FOR ALL USING (is_executive());

-- Notifications: each user sees and updates only their own
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications read"   ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "own notifications update" ON notifications FOR UPDATE USING (user_id = auth.uid());
-- إدراج الإشعارات يتم عادة من الخادم/التريجرات؛ نسمح للمنفذين بإنشائها
CREATE POLICY "executives create notifications" ON notifications
  FOR INSERT WITH CHECK (is_executive() OR user_id = auth.uid());
