-- =================================
-- Sales Management System — database init (0001_init.sql)
-- =================================
-- Single source of truth for the whole database: the final 3-role system
-- (admin | manager | sales), squashed from the build-out migrations into one
-- init file for handover. `npx supabase db reset` rebuilds a fresh local DB
-- from this file + seed.sql alone.
--
-- Idempotent (CREATE IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS), so
-- re-running it on an existing database converges to the same state.
--
-- Permission Matrix (enforced twice: RLS/RPC here, UI affordances in src/ —
-- full table with UI behavior: README.md; how to verify every cell:
-- docs/manual-checklist.md):
--
--   | operation                     | admin | manager        | sales            |
--   |-------------------------------|-------|----------------|------------------|
--   | read Customer/Project         | all   | all            | all              |
--   | create / edit Customer        | all   | all            | own only         |
--   | delete Customer (soft)        | all   | never          | own only         |
--   | create / edit Project         | all   | all            | own customer only|
--   | delete Project (soft)         | all   | never          | own customer only|
--   | set / move Sales Owner        | yes   | read-only      | read-only        |
--   | user management + password    | yes   | never          | never            |
--   | dashboard scope               | all   | all            | own only         |
--
-- Ownership invariants (ADR-0001):
--   - Owner-capable = Sales + Manager: both get a `sales` row automatically
--     at signup (trigger below); Admin never gets one and can never own a
--     Customer.
--   - Ownership checks resolve through SECURITY DEFINER helpers
--     (current_sales_id() etc.), not role comparisons.
--   - Every Customer must always have a Sales Owner: deactivating a user or
--     promoting them to Admin while they still own Customers is rejected
--     with the owned count (admin_set_user_active / admin_change_role).
--   - Every delete is a soft delete (deleted_at timestamp), performed by the
--     soft_delete_* RPCs — a plain UPDATE cannot do it (the row would fail
--     its own read policy mid-update). customers and projects carry NO
--     FOR DELETE policy for ANY role (Admin included): a direct hard DELETE
--     through the API matches zero rows for everyone (issue #19).
-- =================================

-- =================================
-- 1. Extensions
-- =================================
-- uuid-ossp: uuid_generate_v4() defaults. pgcrypto: crypt / gen_salt for
-- password hashing (preinstalled in the extensions schema on every Supabase
-- project; declared for portability).
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =================================
-- 2. Tables
-- =================================
-- profiles extends Supabase auth.users 1:1 (display data only).
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The Sales Owner entity. Owner-capable users (sales | manager) always have
-- exactly one live row (deleted_at IS NULL); admin users have none. Rows are
-- created by the signup trigger and kept in line with the role by
-- admin_change_role — never writable through the API (rule #7).
CREATE TABLE IF NOT EXISTS sales (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sales_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Customers. sales_id = the Sales Owner (NOT NULL — every Customer always
-- has one; assignment itself is Admin-only, see the RLS section).
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_code TEXT NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  company_name TEXT DEFAULT '',
  contact_person TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  description TEXT DEFAULT '',
  sales_id UUID NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- Projects live under exactly one Customer; ownership derives through the
-- Customer's Sales Owner.
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_code TEXT NOT NULL UNIQUE,
  project_name TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  description TEXT DEFAULT '',
  budget NUMERIC(15, 2) NOT NULL DEFAULT 0,
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'in_progress', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

-- =================================
-- 3. Indexes
-- =================================
CREATE INDEX IF NOT EXISTS idx_sales_user_id ON sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_deleted_at ON sales(deleted_at);

CREATE INDEX IF NOT EXISTS idx_customers_sales_id ON customers(sales_id);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at ON customers(deleted_at);

CREATE INDEX IF NOT EXISTS idx_projects_customer_id ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at);

-- =================================
-- 4. updated_at triggers
-- =================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sales_updated_at ON sales;
CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_customers_updated_at ON customers;
CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_projects_updated_at ON projects;
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =================================
-- 5. Role + ownership helpers (SECURITY DEFINER)
-- =================================
-- The caller's role, resolved from the JWT's user metadata (the same place
-- signups and admin_change_role write it). One of the three known values is
-- returned as-is; missing/unknown defaults to 'sales'.
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

-- The current user's sales row — THE ownership anchor. Every RLS ownership
-- check resolves through this helper, never through a role comparison.
CREATE OR REPLACE FUNCTION current_sales_id()
RETURNS UUID AS $$
DECLARE
  sid UUID;
BEGIN
  SELECT id INTO sid FROM sales WHERE user_id = auth.uid() AND deleted_at IS NULL LIMIT 1;
  RETURN sid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- The stored (pre-update) Sales Owner of a customer row. Lets an UPDATE
-- policy's WITH CHECK pin sales_id to its old value: WITH CHECK only sees
-- the proposed NEW row, so the pre-update value must be read through this
-- SECURITY DEFINER function (definer privileges bypass RLS, which also avoids
-- same-table policy recursion).
CREATE OR REPLACE FUNCTION customer_sales_owner_id(p_customer_id UUID)
RETURNS UUID AS $$
  SELECT sales_id FROM customers WHERE id = p_customer_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- Internal helper: how many active Customers does the user own (through
-- their active sales row)? Admin-role users have no sales row → always 0.
-- Not executable by any API role: admin_pending_reassignment_count is the
-- only path.
CREATE OR REPLACE FUNCTION admin_owned_customer_count(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM customers c
  JOIN sales s ON s.id = c.sales_id
  WHERE s.user_id = p_user_id
    AND s.deleted_at IS NULL
    AND c.deleted_at IS NULL;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

REVOKE ALL ON FUNCTION admin_owned_customer_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_owned_customer_count(UUID) FROM anon;
REVOKE ALL ON FUNCTION admin_owned_customer_count(UUID) FROM authenticated;

-- Single source of truth for a GENERATED Sales Owner identity (sales_code +
-- username): pattern + id-suffix + collision retry loop live here only. The
-- signup trigger and admin_change_role's fresh-row branch both call this, so
-- the two flows can never drift. Not executable by any API role: only the
-- SECURITY DEFINER flows around it reach it.
CREATE OR REPLACE FUNCTION generate_sales_identity(p_user_id UUID, p_email TEXT)
RETURNS TABLE (sales_code TEXT, username TEXT) AS $$
DECLARE
  v_sales_code TEXT;
  v_username TEXT;
  v_username_base TEXT;
BEGIN
  -- Derived from the (unique) user id, so it is collision-free.
  v_sales_code := 'SL-' || upper(replace(p_user_id::text, '-', ''));

  v_username_base := lower(regexp_replace(
    split_part(COALESCE(p_email, ''), '@', 1),
    '[^a-z0-9._-]', '', 'g'
  ));
  IF v_username_base IS NULL OR v_username_base = '' THEN
    v_username_base := 'user';
  END IF;
  v_username := v_username_base || '-' || substr(replace(p_user_id::text, '-', ''), 1, 8);
  -- The id-derived suffix is unique in practice; loop guards the race.
  WHILE EXISTS (SELECT 1 FROM sales WHERE sales.username = v_username) LOOP
    v_username := v_username_base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
  END LOOP;

  RETURN QUERY SELECT v_sales_code, v_username;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION generate_sales_identity(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION generate_sales_identity(UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION generate_sales_identity(UUID, TEXT) FROM authenticated;

-- =================================
-- 6. Signup trigger: profile + auto sales row for owner-capable roles
-- =================================
-- Runs on every auth.users INSERT (real signups AND admin_create_user).
-- Owner-capable roles (sales | manager) always get a sales row — sales_code/
-- username taken verbatim from signup metadata when supplied, generated
-- otherwise. role = 'admin' (or anything else) gets NO sales row. A failure
-- here never blocks the user creation (EXCEPTION WHEN OTHERS).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_role TEXT;
  v_sales_code TEXT;
  v_username TEXT;
  v_gen_sales_code TEXT;
  v_gen_username TEXT;
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
    v_username := NULLIF(NEW.raw_user_meta_data ->> 'username', '');
    IF v_sales_code IS NULL OR v_username IS NULL THEN
      -- Both flows share one generator: generate_sales_identity().
      SELECT g.sales_code, g.username
        INTO v_gen_sales_code, v_gen_username
        FROM generate_sales_identity(NEW.id, NEW.email) g;
      v_sales_code := COALESCE(v_sales_code, v_gen_sales_code);
      v_username := COALESCE(v_username, v_gen_username);
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
-- 7. Customer Sales Owner auto-assign on INSERT
-- =================================
-- BEFORE ROW triggers run before the RLS WITH CHECK check, so a NULL
-- sales_id supplied by an owner-capable user (sales or manager) is stamped
-- with their own sales row before the policies validate it — Sales creating
-- a Customer becomes its Sales Owner automatically, even via a direct API
-- call. A non-owner-capable caller (admin/service_role) must supply the
-- owner explicitly; the NOT NULL constraint backstops everything else.
CREATE OR REPLACE FUNCTION set_default_customer_owner()
RETURNS TRIGGER AS $$
DECLARE
  v_owner UUID := current_sales_id();
BEGIN
  IF NEW.sales_id IS NULL AND v_owner IS NOT NULL THEN
    NEW.sales_id := v_owner;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS set_default_customer_owner_on_insert ON customers;
CREATE TRIGGER set_default_customer_owner_on_insert
  BEFORE INSERT ON customers
  FOR EACH ROW EXECUTE FUNCTION set_default_customer_owner();

-- =================================
-- 8. sales → auth.users sync triggers
-- =================================
-- Admin edits of email / full_name on a sales row are mirrored into
-- auth.users (login email + user metadata).
DROP TRIGGER IF EXISTS on_sales_email_changed ON sales;

CREATE OR REPLACE FUNCTION sync_sales_email_to_auth()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE auth.users
    SET
      email = NEW.email,
      raw_user_meta_data = raw_user_meta_data || jsonb_build_object('email', NEW.email)
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public;

CREATE TRIGGER on_sales_email_changed
  AFTER UPDATE OF email ON sales
  FOR EACH ROW
  EXECUTE FUNCTION sync_sales_email_to_auth();

DROP TRIGGER IF EXISTS on_sales_name_changed ON sales;

CREATE OR REPLACE FUNCTION sync_sales_name_to_auth()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('full_name', NEW.full_name)
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public;

CREATE TRIGGER on_sales_name_changed
  AFTER UPDATE OF full_name ON sales
  FOR EACH ROW
  EXECUTE FUNCTION sync_sales_name_to_auth();

-- =================================
-- 9. Row Level Security
-- =================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- ---- profiles ----
-- Each user sees/edits their own profile; Admin additionally reads all.
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (id = auth.uid());

DROP POLICY IF EXISTS "Admin can view all profiles" ON profiles;
CREATE POLICY "Admin can view all profiles" ON profiles
  FOR SELECT USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- ---- sales ----
-- Writes are Admin-only (FOR ALL) — the rows are DB-managed (signup trigger
-- + admin_change_role); Sales/Manager read the directory, non-deleted only.
DROP POLICY IF EXISTS "Admin full access on sales" ON sales;
CREATE POLICY "Admin full access on sales" ON sales
  FOR ALL USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Sales can view all sales" ON sales;
CREATE POLICY "Sales can view all sales" ON sales
  FOR SELECT USING (
    get_user_role() IN ('sales', 'manager') AND deleted_at IS NULL
  );

-- ---- customers ----
-- Read: every role sees every non-deleted Customer.
-- Create/edit: Admin any (per-action SELECT/INSERT/UPDATE policies),
-- Manager any, Sales own only.
-- Delete (soft, via RPC only): Admin any, Sales own only, Manager never.
-- NO FOR DELETE policy exists for ANY role (issue #19) — hard DELETE is
-- impossible through the API, including for Admin.
-- Sales Owner column: Admin-only to change — the Manager UPDATE policy pins
-- it to its pre-update value via customer_sales_owner_id(); the Sales
-- policies' ownership predicate (sales_id = current_sales_id()) pins it for
-- Sales. The BEFORE INSERT trigger auto-assigns it for owner-capable
-- creators.

-- Admin: split-action policies (SELECT/INSERT/UPDATE only). The legacy
-- catch-all "Admin full access on customers" FOR ALL policy granted DELETE
-- too, so it is dropped and NOT recreated. WITH CHECK defaults to the USING
-- expression, so Admin still writes any column freely (incl. reassigning
-- the Sales Owner) — identical to the old FOR ALL minus DELETE.
DROP POLICY IF EXISTS "Admin full access on customers" ON customers;

DROP POLICY IF EXISTS "Admin can view all customers" ON customers;
CREATE POLICY "Admin can view all customers" ON customers
  FOR SELECT USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Admin can insert customers" ON customers;
CREATE POLICY "Admin can insert customers" ON customers
  FOR INSERT WITH CHECK (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Admin can update customers" ON customers;
CREATE POLICY "Admin can update customers" ON customers
  FOR UPDATE USING (get_user_role() = 'admin');

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

-- Hard DELETE removed (issue #19): the old "Sales can delete own customers"
-- FOR DELETE policy is dropped and NOT recreated — Sales deletes go through
-- the soft_delete_customer RPC only.
DROP POLICY IF EXISTS "Sales can delete own customers" ON customers;

-- Manager can create any Customer (explicit owner allowed = creating on
-- behalf of a salesperson; omitted owner is auto-stamped by the trigger).
DROP POLICY IF EXISTS "Manager can insert customers" ON customers;
CREATE POLICY "Manager can insert customers" ON customers
  FOR INSERT WITH CHECK (
    get_user_role() = 'manager' AND sales_id IS NOT NULL
  );

-- Manager can edit any live Customer, but deleted_at must stay NULL (a soft
-- delete violates the policy outright) and sales_id must not change.
DROP POLICY IF EXISTS "Manager can update customers" ON customers;
CREATE POLICY "Manager can update customers" ON customers
  FOR UPDATE
  USING (
    get_user_role() = 'manager' AND deleted_at IS NULL
  )
  WITH CHECK (
    get_user_role() = 'manager' AND
    deleted_at IS NULL AND
    sales_id = customer_sales_owner_id(id)
  );

-- DELETE: no policy for any role (see above) — every direct DELETE, the
-- manager's included, matches zero rows (Permission Matrix: Manager cannot
-- delete; nobody else may hard-delete either).

-- ---- projects ----
-- Read: every role sees every non-deleted Project.
-- Create/edit: Admin any (per-action SELECT/INSERT/UPDATE policies),
-- Manager under any live Customer, Sales only under own Customers (the
-- subquery is evaluated under the caller's own read policies).
-- Delete (soft, via RPC only): Admin any, Sales own-customer rows,
-- Manager never. NO FOR DELETE policy exists for ANY role (issue #19).

-- Admin: split-action policies, mirroring customers — the legacy FOR ALL
-- (which granted DELETE) is dropped and NOT recreated.
DROP POLICY IF EXISTS "Admin full access on projects" ON projects;

DROP POLICY IF EXISTS "Admin can view all projects" ON projects;
CREATE POLICY "Admin can view all projects" ON projects
  FOR SELECT USING (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Admin can insert projects" ON projects;
CREATE POLICY "Admin can insert projects" ON projects
  FOR INSERT WITH CHECK (get_user_role() = 'admin');

DROP POLICY IF EXISTS "Admin can update projects" ON projects;
CREATE POLICY "Admin can update projects" ON projects
  FOR UPDATE USING (get_user_role() = 'admin');

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

-- Hard DELETE removed (issue #19): the old "Sales can delete own projects"
-- FOR DELETE policy is dropped and NOT recreated — Sales deletes go through
-- the soft_delete_project RPC only.
DROP POLICY IF EXISTS "Sales can delete own projects" ON projects;

-- Manager: create/edit under any (live) customer; deleted_at must stay NULL.
DROP POLICY IF EXISTS "Manager can insert projects" ON projects;
CREATE POLICY "Manager can insert projects" ON projects
  FOR INSERT WITH CHECK (
    get_user_role() = 'manager' AND
    customer_id IN (SELECT id FROM customers)
  );

DROP POLICY IF EXISTS "Manager can update projects" ON projects;
CREATE POLICY "Manager can update projects" ON projects
  FOR UPDATE
  USING (
    get_user_role() = 'manager' AND deleted_at IS NULL
  )
  WITH CHECK (
    get_user_role() = 'manager' AND deleted_at IS NULL
  );

-- DELETE: no policy for any role (see above) — direct DELETE matches zero
-- rows for everyone, the manager's included (Permission Matrix: Manager
-- cannot delete); the soft_delete_project RPC enforces the same rule.

-- =================================
-- 10. Soft-delete RPCs — the app's delete operations
-- =================================
-- A plain UPDATE cannot soft delete: PostgreSQL applies the SELECT policies
-- to the NEW row of every UPDATE that requires SELECT rights (any column
-- referenced in the statement — always the case for PostgREST), so a row
-- that just became soft-deleted fails its own read policy and the UPDATE is
-- rejected. These SECURITY DEFINER RPCs perform the timestamped update with
-- definer rights and enforce the delete column of the Permission Matrix:
--   admin   -> any row
--   sales   -> own rows only (ownership via current_sales_id(); for projects
--              resolved through the Customer)
--   manager -> never (explicitly rejected, even own rows)
-- An unknown id is a silent no-op.
CREATE OR REPLACE FUNCTION soft_delete_customer(p_customer_id UUID)
RETURNS VOID AS $$
DECLARE
  v_role TEXT := get_user_role();
  v_owner UUID;
BEGIN
  SELECT sales_id INTO v_owner FROM customers WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_role = 'admin'
     OR (v_role = 'sales' AND v_owner = current_sales_id()) THEN
    UPDATE customers
       SET deleted_at = NOW(),
           status = 'inactive'
     WHERE id = p_customer_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Permission denied: cannot delete this customer'
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION soft_delete_customer(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION soft_delete_customer(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION soft_delete_customer(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION soft_delete_project(p_project_id UUID)
RETURNS VOID AS $$
DECLARE
  v_role TEXT := get_user_role();
  v_owner UUID;
BEGIN
  SELECT c.sales_id INTO v_owner
    FROM projects p
    JOIN customers c ON c.id = p.customer_id
   WHERE p.id = p_project_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_role = 'admin'
     OR (v_role = 'sales' AND v_owner = current_sales_id()) THEN
    UPDATE projects
       SET deleted_at = NOW(),
           status = 'cancelled'
     WHERE id = p_project_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Permission denied: cannot delete this project'
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION soft_delete_project(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION soft_delete_project(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION soft_delete_project(UUID) TO authenticated, service_role;

-- =================================
-- 11. Admin user-management RPCs
-- =================================
-- Account operations are SECURITY DEFINER RPCs callable from the anon key by
-- an Admin (ADR-0001) — no client-side signUp/session juggling, no
-- service-role key in the frontend. Every function's FIRST statement is the
-- admin check, so granting EXECUTE broadly is safe: non-admin callers get
-- the function's own clear "Admin only" error instead of an opaque PostgREST
-- permission denial. The internal helper (admin_owned_customer_count) stays
-- postgres-only.

-- One list of every User of every role: the unified users page cannot read
-- auth.users through the anon key, and admins have no sales row, so the
-- sales directory alone can never show them.
CREATE OR REPLACE FUNCTION admin_list_users()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  is_active BOOLEAN,
  sales_id UUID,
  sales_code TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  IF get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Admin only: this operation requires the admin role'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT u.id,
         u.email::text,
         COALESCE(p.full_name, u.raw_user_meta_data ->> 'full_name', ''),
         COALESCE(u.raw_user_meta_data ->> 'role', 'sales'),
         (u.banned_until IS NULL OR u.banned_until <= now()),
         s.id,
         s.sales_code,
         u.created_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.sales s ON s.user_id = u.id AND s.deleted_at IS NULL
  ORDER BY u.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Create a User with any of the 3 roles. Inserts the auth user directly
-- (mirroring what GoTrue writes on a real signup: bcrypt-hashed password,
-- confirmed email, provider metadata, email identity row); the
-- on_auth_user_created trigger then runs EXACTLY as for a signup — creating
-- the profile and, for owner-capable roles, the sales row.
CREATE OR REPLACE FUNCTION admin_create_user(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_role TEXT
)
RETURNS UUID AS $$
DECLARE
  v_id UUID := gen_random_uuid();
BEGIN
  IF get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Admin only: this operation requires the admin role'
      USING ERRCODE = '42501';
  END IF;

  IF p_role NOT IN ('admin', 'manager', 'sales') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role USING ERRCODE = '22023';
  END IF;

  IF p_email IS NULL OR p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'A valid email is required' USING ERRCODE = '22023';
  END IF;

  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email)) THEN
    RAISE EXCEPTION 'This email is already registered' USING ERRCODE = '23505';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    reauthentication_token, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_id,
    'authenticated',
    'authenticated',
    lower(p_email),
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('role', p_role, 'full_name', COALESCE(p_full_name, '')),
    '', '', '', '', '', '',
    now(), now()
  );

  INSERT INTO auth.identities (
    user_id, provider_id, identity_data, provider, last_sign_in_at,
    created_at, updated_at
  ) VALUES (
    v_id,
    v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', lower(p_email),
                       'email_verified', true),
    'email',
    now(), now(), now()
  );

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- Reset any User's password for real.
CREATE OR REPLACE FUNCTION admin_reset_password(
  p_user_id UUID,
  p_new_password TEXT
)
RETURNS VOID AS $$
BEGIN
  IF get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Admin only: this operation requires the admin role'
      USING ERRCODE = '42501';
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters'
      USING ERRCODE = '22023';
  END IF;

  UPDATE auth.users
     SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
         updated_at = now()
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- REAL deactivate / reactivate. Deactivate sets banned_until far in the
-- future: GoTrue rejects every subsequent login with "User is banned".
-- Reactivate clears it. The owner guard runs on deactivate: a Sales Owner
-- cannot leave their Customers ownerless.
CREATE OR REPLACE FUNCTION admin_set_user_active(
  p_user_id UUID,
  p_active BOOLEAN
)
RETURNS VOID AS $$
DECLARE
  v_owned INTEGER;
BEGIN
  IF get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Admin only: this operation requires the admin role'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT p_active THEN
    v_owned := admin_owned_customer_count(p_user_id);
    IF v_owned > 0 THEN
      RAISE EXCEPTION
        'Cannot deactivate: this user still owns % customer(s). Reassign their customers first.',
        v_owned;
    END IF;

    UPDATE auth.users
       SET banned_until = now() + interval '100 years',
           updated_at = now()
     WHERE id = p_user_id;
  ELSE
    UPDATE auth.users
       SET banned_until = NULL,
           updated_at = now()
     WHERE id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Change any User's role. Sales <-> Manager is free. Moving OUT of
-- owner-capable into admin is blocked while the user still owns Customers
-- (the guard reports the count). The sales row follows the ADR-0001
-- invariant in both directions: promotion to admin soft-deletes it,
-- demotion from admin revives the latest soft-deleted row (or creates a
-- fresh one, mirroring the signup trigger's generation rules).
CREATE OR REPLACE FUNCTION admin_change_role(
  p_user_id UUID,
  p_new_role TEXT
)
RETURNS TEXT AS $$
DECLARE
  v_current_role TEXT;
  v_owned INTEGER;
  v_username TEXT;
  v_sales_code TEXT;
  v_full_name TEXT;
  v_email TEXT;
BEGIN
  IF get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Admin only: this operation requires the admin role'
      USING ERRCODE = '42501';
  END IF;

  IF p_new_role NOT IN ('admin', 'manager', 'sales') THEN
    RAISE EXCEPTION 'Invalid role: %', p_new_role USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(raw_user_meta_data ->> 'role', 'sales'), email
    INTO v_current_role, v_email
    FROM auth.users
   WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent no-op when the role is already the requested one.
  IF v_current_role = p_new_role THEN
    RETURN p_new_role;
  END IF;

  -- Owner-reassignment guard: promoting an owner-capable user to admin.
  IF v_current_role IN ('sales', 'manager') AND p_new_role = 'admin' THEN
    v_owned := admin_owned_customer_count(p_user_id);
    IF v_owned > 0 THEN
      RAISE EXCEPTION
        'Cannot change role to admin: this user still owns % customer(s). Reassign their customers first.',
        v_owned;
    END IF;
  END IF;

  UPDATE auth.users
     SET raw_user_meta_data = jsonb_set(
           COALESCE(raw_user_meta_data, '{}'::jsonb),
           '{role}',
           to_jsonb(p_new_role)
         ),
         updated_at = now()
   WHERE id = p_user_id;

  -- ADR-0001 invariant upkeep: owner-capable users have a sales row, admin
  -- never does. Sales <-> Manager keeps the row untouched.
  IF p_new_role = 'admin' THEN
    UPDATE sales
       SET deleted_at = now(),
           status = 'inactive',
           updated_at = now()
     WHERE user_id = p_user_id
       AND deleted_at IS NULL;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM sales WHERE user_id = p_user_id AND deleted_at IS NULL
    ) THEN
      -- Revive the user's own latest soft-deleted row first: it keeps their
      -- original sales_code/username instead of minting new ones.
      UPDATE sales
         SET deleted_at = NULL,
             status = 'active',
             updated_at = now()
       WHERE id = (
         SELECT id FROM sales
          WHERE user_id = p_user_id AND deleted_at IS NOT NULL
          ORDER BY updated_at DESC
          LIMIT 1
       );

      IF NOT EXISTS (
        SELECT 1 FROM sales WHERE user_id = p_user_id AND deleted_at IS NULL
      ) THEN
        -- Fresh row: same generator the signup trigger calls, so the
        -- generation rules live in exactly one place.
        SELECT COALESCE(p.full_name, u.raw_user_meta_data ->> 'full_name', '')
          INTO v_full_name
          FROM auth.users u
          LEFT JOIN public.profiles p ON p.id = u.id
         WHERE u.id = p_user_id;

        SELECT g.sales_code, g.username
          INTO v_sales_code, v_username
          FROM generate_sales_identity(p_user_id, v_email) g;

        INSERT INTO sales (user_id, sales_code, full_name, username, email, status)
        VALUES (
          p_user_id,
          v_sales_code,
          v_full_name,
          v_username,
          COALESCE(v_email, ''),
          'active'
        );
      END IF;
    END IF;
  END IF;

  RETURN p_new_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- The UI's advance warning: called BEFORE deactivate / promote-to-admin so
-- the page can warn with the owned-customer count up front, matching the
-- number the guarded RPCs reject with.
CREATE OR REPLACE FUNCTION admin_pending_reassignment_count(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
  IF get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Admin only: this operation requires the admin role'
      USING ERRCODE = '42501';
  END IF;

  RETURN admin_owned_customer_count(p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Grants for the six admin RPCs above (clear errors for everyone else).
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'admin_list_users',
    'admin_create_user',
    'admin_reset_password',
    'admin_set_user_active',
    'admin_change_role',
    'admin_pending_reassignment_count'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I TO anon, authenticated', fn);
  END LOOP;
END;
$$;
