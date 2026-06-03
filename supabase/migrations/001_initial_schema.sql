-- ============================================================
-- Al-Rawaf Tender Portal — Initial Schema
-- Paste this in Supabase → SQL Editor → Run
-- ============================================================

-- ── 1. User Profiles (extends Supabase auth.users) ──────────
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'department'
                  CHECK (role IN ('executive', 'department')),
  department_key TEXT,                        -- NULL for executives
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create a profile row whenever a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 'department')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE handle_new_user();

-- ── 2. Departments ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  key           TEXT PRIMARY KEY,             -- 'BS', 'INF', 'TECH', 'DESIGN'
  name          TEXT NOT NULL,
  short         TEXT NOT NULL,
  manager_title TEXT,
  library_path  TEXT,
  sort_order    INT DEFAULT 0
);

INSERT INTO departments (key, name, short, manager_title, library_path, sort_order) VALUES
  ('BS',     'إدارة دراسات السوق',              'BS',     'مدير دراسات السوق',    'SharePoint/BS',     1),
  ('INF',    'إدارة البنية التحتية',             'INF',    'مدير البنية التحتية',  'SharePoint/INF',    2),
  ('TECH',   'الإدارة الفنية',                  'TECH',   'المدير الفني',          'SharePoint/TECH',   3),
  ('DESIGN', 'إدارة التصميم',                   'DESIGN', 'مدير التصميم',         'SharePoint/DESIGN', 4)
ON CONFLICT (key) DO NOTHING;

-- ── 3. Tenders ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenders (
  id             TEXT PRIMARY KEY,            -- e.g. "b54d51ac8b20"
  title          TEXT NOT NULL,
  client         TEXT,
  sector         TEXT,
  work_type      TEXT,
  submit_date    DATE,
  guarantee_date DATE,
  external_status TEXT,                       -- الحالة من المصدر الخارجي
  fetched_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── 4. Per-tender Per-department Task Status ─────────────────
CREATE TABLE IF NOT EXISTS tender_dept_status (
  tender_id    TEXT NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  dept_key     TEXT NOT NULL REFERENCES departments(key),
  status       TEXT NOT NULL DEFAULT 'in-progress'
                 CHECK (status IN ('in-progress', 'completed')),
  completed_at TIMESTAMPTZ,
  updated_by   UUID REFERENCES auth.users,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tender_id, dept_key)
);

-- ── 5. Engineer Assignments ──────────────────────────────────
CREATE TABLE IF NOT EXISTS tender_assignments (
  tender_id     TEXT NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  dept_key      TEXT NOT NULL REFERENCES departments(key),
  engineer_name TEXT NOT NULL,
  assigned_at   TIMESTAMPTZ DEFAULT NOW(),
  assigned_by   UUID REFERENCES auth.users,
  PRIMARY KEY (tender_id, dept_key, engineer_name)
);

-- ── 6. Manual Stage Overrides (drag-and-drop) ───────────────
CREATE TABLE IF NOT EXISTS tender_stage_override (
  tender_id TEXT PRIMARY KEY REFERENCES tenders(id) ON DELETE CASCADE,
  stage     TEXT NOT NULL
              CHECK (stage IN ('new','active','late','ready','approved')),
  set_at    TIMESTAMPTZ DEFAULT NOW(),
  set_by    UUID REFERENCES auth.users
);

-- ── 7. Approvals ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tender_approvals (
  tender_id  TEXT PRIMARY KEY REFERENCES tenders(id) ON DELETE CASCADE,
  decision   TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  decided_at TIMESTAMPTZ DEFAULT NOW(),
  decided_by UUID REFERENCES auth.users
);

-- ── 8. Comments ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tender_comments (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tender_id   TEXT NOT NULL REFERENCES tenders(id) ON DELETE CASCADE,
  dept_key    TEXT NOT NULL REFERENCES departments(key),
  body        TEXT NOT NULL,
  author_id   UUID REFERENCES auth.users,
  author_name TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── 9. Activity Log ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tender_id     TEXT REFERENCES tenders(id) ON DELETE SET NULL,
  tender_title  TEXT,
  action        TEXT NOT NULL,                -- 'complete', 'assign', 'approve', etc.
  note          TEXT,
  user_id       UUID REFERENCES auth.users,
  user_name     TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS activity_log_tender ON activity_log(tender_id);
CREATE INDEX IF NOT EXISTS activity_log_created ON activity_log(created_at DESC);

-- ── 10. Row Level Security ───────────────────────────────────

-- Profiles: user sees and edits own row; executives see all
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON profiles
  FOR ALL USING (auth.uid() = id);
CREATE POLICY "executives read all profiles" ON profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'executive')
  );

-- Tenders: all authenticated users can read
ALTER TABLE tenders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read tenders" ON tenders
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "executives write tenders" ON tenders
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'executive')
  );

-- Dept status: read all (authenticated); write own dept OR executive
ALTER TABLE tender_dept_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read dept status" ON tender_dept_status
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "write own dept status" ON tender_dept_status
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND (p.role = 'executive' OR p.department_key = dept_key))
  );
CREATE POLICY "update own dept status" ON tender_dept_status
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND (p.role = 'executive' OR p.department_key = dept_key))
  );

-- Assignments: same logic
ALTER TABLE tender_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read assignments" ON tender_assignments
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "write assignments" ON tender_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND (p.role = 'executive' OR p.department_key = dept_key))
  );

-- Stage overrides: executives only
ALTER TABLE tender_stage_override ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read stage overrides" ON tender_stage_override
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "executives write stage" ON tender_stage_override
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'executive')
  );

-- Approvals: executives only
ALTER TABLE tender_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read approvals" ON tender_approvals
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "executives write approvals" ON tender_approvals
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'executive')
  );

-- Comments: read own dept OR executive; write own dept OR executive
ALTER TABLE tender_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read comments" ON tender_comments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND (p.role = 'executive' OR p.department_key = dept_key))
  );
CREATE POLICY "write comments" ON tender_comments
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p
            WHERE p.id = auth.uid()
              AND (p.role = 'executive' OR p.department_key = dept_key))
  );

-- Activity log: read all (authenticated); insert authenticated
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read activity" ON activity_log
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "insert activity" ON activity_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
