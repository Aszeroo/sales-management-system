-- =================================
-- 0002_three_roles.sql — Tracer bullet for the 3-role permission model
-- (issue #3, per ADR-0001):
--   1. Role vocabulary extended to exactly three values: admin | manager | sales
--      (get_user_role). Role still comes from user metadata, as before.
--   2. Owner-capable = Sales + Manager (ADR-0001): the signup trigger
--      auto-creates the sales row for BOTH owner-capable roles — with a
--      generated sales_code/username when the signup metadata omits them.
--      Supplied metadata is kept byte-for-byte. Admin never gets a sales row.
--   3. SECURITY DEFINER helper current_sales_id() — "the current user's sales
--      row" that RLS ownership checks reference (not a role check).
--   4. Existing 2-role behavior preserved: Sales manages only its own
--      customers/projects, everyone reads non-deleted rows, admin unchanged.
--      Manager receives NO new write rights in this migration (tickets #4/#5)
--      — only read visibility plus its own owner-capable sales row.
--
-- Append-only migration: later tickets extend this; 0001_init.sql is not
-- rewritten (squash happens in ticket #9).
-- =================================

-- =================================
-- 1. Role vocabulary: admin | manager | sales
-- =================================
-- Same contract as 0001 (metadata-driven, SECURITY DEFINER, STABLE), extended:
-- a metadata role that is one of the three known values is returned as-is;
-- anything missing/unknown still defaults to 'sales' so every existing
-- 2-role outcome (admin -> admin, sales/unknown -> sales) is unchanged.
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
DECLARE
  metadata_role TEXT;
BEGIN
  SELECT auth.jwt() -> 'user_metadata' ->> 'role' INTO metadata_role;
  IF metadata_role IN ('admin', 'manager', 'sales') THEN
    RETURN metadata_role;
  END IF;
  RETURN 'sales';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- =================================
-- 2. Ownership helper: the current user's sales row
-- =================================
-- Mirrors get_user_sales_id() (0001) so the two can never drift: RLS
-- ownership checks resolve "the sales row of auth.uid()" through this
-- SECURITY DEFINER function instead of comparing roles.
CREATE OR REPLACE FUNCTION current_sales_id()
RETURNS UUID AS $$
DECLARE
  sid UUID;
BEGIN
  SELECT id INTO sid FROM sales WHERE user_id = auth.uid() AND deleted_at IS NULL LIMIT 1;
  RETURN sid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- =================================
-- 3. Signup trigger: auto-create the sales row for owner-capable roles
-- =================================
-- Same contract as 0001's handle_new_user (SECURITY DEFINER + search_path
-- public + EXCEPTION WHEN OTHERS so a profile/sales failure never blocks
-- user creation), extended per ADR-0001:
--   - role 'sales' OR 'manager' (Owner-capable) -> always get a sales row
--   - 'admin' (or anything else) -> no sales row
--   - sales_code/username taken verbatim from signup metadata when supplied;
--     generated otherwise (0001 silently skipped the row instead)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

CREATE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_role TEXT;
  v_sales_code TEXT;
  v_username TEXT;
  v_username_base TEXT;
BEGIN
  -- Create profile (safe: ON CONFLICT handles duplicates)
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  -- Role comes from user metadata like before; missing role = 'sales'
  new_role := COALESCE(NEW.raw_user_meta_data ->> 'role', 'sales');

  IF new_role IN ('sales', 'manager') THEN
    -- Keep supplied metadata byte-for-byte; generate what is missing.
    v_sales_code := NULLIF(NEW.raw_user_meta_data ->> 'sales_code', '');
    IF v_sales_code IS NULL THEN
      -- Derived from the (unique) user id, so it is collision-free.
      v_sales_code := 'SL-' || upper(replace(NEW.id::text, '-', ''));
    END IF;

    v_username := NULLIF(NEW.raw_user_meta_data ->> 'username', '');
    IF v_username IS NULL THEN
      v_username_base := lower(regexp_replace(
        split_part(COALESCE(NEW.email, ''), '@', 1),
        '[^a-z0-9._-]', '', 'g'
      ));
      IF v_username_base IS NULL OR v_username_base = '' THEN
        v_username_base := 'user';
      END IF;
      v_username := v_username_base || '-' || substr(replace(NEW.id::text, '-', ''), 1, 8);
      -- The id-derived suffix is unique in practice; loop guards the race.
      WHILE EXISTS (SELECT 1 FROM sales WHERE username = v_username) LOOP
        v_username := v_username_base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
      END LOOP;
    END IF;

    INSERT INTO public.sales (user_id, sales_code, full_name, username, email, status)
    VALUES (
      NEW.id,
      v_sales_code,
      COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
      v_username,
      COALESCE(NEW.email, ''),
      'active'
    )
    ON CONFLICT DO NOTHING;
  END IF;
  -- role = 'admin': deliberately NO sales row (ADR-0001 — Admin is never a
  -- Sales Owner).

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  -- If anything fails, log it but DO NOT block the user creation.
  -- The user will be created in auth.users; we can create the
  -- profile/sales record manually afterward if needed.
  RAISE WARNING 'handle_new_user trigger error: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- =================================
-- 4. RLS policy updates (behavior-preserving)
-- =================================
-- Read policies: 'sales' -> IN ('sales','manager') so the new role sees the
-- same non-deleted rows every other role sees ("everyone reads" preserved
-- across the 3-role vocabulary; admin keeps its FOR ALL policies).
-- Write policies on customers/projects: unchanged gate get_user_role() =
-- 'sales' (Manager write rights arrive in #4/#5), but the ownership
-- comparison now goes through current_sales_id().
-- sales-table self INSERT/UPDATE: extended to Manager because ADR-0001 gives
-- every owner-capable user the same auto-managed sales row.
--
-- Admin FOR ALL policies from 0001 stay as-is (not re-created here).

-- ---- sales ----
DROP POLICY IF EXISTS "Sales can view all sales" ON sales;
CREATE POLICY "Sales can view all sales" ON sales
  FOR SELECT USING (
    get_user_role() IN ('sales', 'manager') AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "Sales can insert own sales record" ON sales;
CREATE POLICY "Sales can insert own sales record" ON sales
  FOR INSERT WITH CHECK (
    get_user_role() IN ('sales', 'manager') AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "Sales can update own sales record" ON sales;
CREATE POLICY "Sales can update own sales record" ON sales
  FOR UPDATE USING (
    get_user_role() IN ('sales', 'manager') AND user_id = auth.uid()
  );

-- ---- customers ----
DROP POLICY IF EXISTS "Sales can view all customers" ON customers;
CREATE POLICY "Sales can view all customers" ON customers
  FOR SELECT USING (
    get_user_role() IN ('sales', 'manager') AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "Sales can insert own customers" ON customers;
CREATE POLICY "Sales can insert own customers" ON customers
  FOR INSERT WITH CHECK (
    get_user_role() = 'sales' AND sales_id = current_sales_id()
  );

DROP POLICY IF EXISTS "Sales can update own customers" ON customers;
CREATE POLICY "Sales can update own customers" ON customers
  FOR UPDATE USING (
    get_user_role() = 'sales' AND sales_id = current_sales_id()
  );

DROP POLICY IF EXISTS "Sales can delete own customers" ON customers;
CREATE POLICY "Sales can delete own customers" ON customers
  FOR DELETE USING (
    get_user_role() = 'sales' AND sales_id = current_sales_id()
  );

-- ---- projects ----
DROP POLICY IF EXISTS "Sales can view all projects" ON projects;
CREATE POLICY "Sales can view all projects" ON projects
  FOR SELECT USING (
    get_user_role() IN ('sales', 'manager') AND deleted_at IS NULL
  );

DROP POLICY IF EXISTS "Sales can insert own projects" ON projects;
CREATE POLICY "Sales can insert own projects" ON projects
  FOR INSERT WITH CHECK (
    get_user_role() = 'sales' AND
    customer_id IN (SELECT id FROM customers WHERE sales_id = current_sales_id() AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "Sales can update own projects" ON projects;
CREATE POLICY "Sales can update own projects" ON projects
  FOR UPDATE USING (
    get_user_role() = 'sales' AND
    customer_id IN (SELECT id FROM customers WHERE sales_id = current_sales_id() AND deleted_at IS NULL)
  );

DROP POLICY IF EXISTS "Sales can delete own projects" ON projects;
CREATE POLICY "Sales can delete own projects" ON projects
  FOR DELETE USING (
    get_user_role() = 'sales' AND
    customer_id IN (SELECT id FROM customers WHERE sales_id = current_sales_id() AND deleted_at IS NULL)
  );
