-- ============================================================
-- Fix: "Database error creating new user"
-- 1) handle_new_user needs a fixed search_path + schema-qualified table
-- 2) remove the self-recursive "executives read all profiles" policy
-- Run this in SQL Editor.
-- ============================================================

-- ── 1. Recreate the signup trigger function correctly ───────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'department'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ── 2. Fix the recursive profiles SELECT policy ─────────────
-- is_executive() (from migration 003) is SECURITY DEFINER so it
-- bypasses RLS and does NOT recurse.
DROP POLICY IF EXISTS "executives read all profiles" ON profiles;
CREATE POLICY "executives read all profiles" ON profiles
  FOR SELECT USING (is_executive());
