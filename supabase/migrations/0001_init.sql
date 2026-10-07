-- Sales Management System - BASELINE migration (0001_init.sql)
-- Reproduces today's 2-role DB behavior (Admin/Sales) as a single source of truth.
-- Ported from supabase/schema.sql + effective result of the fix-* scripts.
-- Idempotent (CREATE IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS) so that
-- `npx supabase db reset` rebuilds a fresh DB from migrations alone.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =================================
-- 1. profiles table (extends Supabase auth.users)
-- =================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =================================
-- 2. sales table
-- =================================
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

-- =================================
-- 3. customers table
-- =================================
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

-- =================================
-- 4. projects table
-- =================================
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
-- Indexes
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
-- updated_at trigger function
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
-- Helper function: Get current user's role
-- =================================
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS TEXT AS $$
DECLARE
  is_admin BOOLEAN;
BEGIN
  -- Check if user has an admin flag in raw_user_meta_data
  SELECT (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' INTO is_admin;
  IF is_admin THEN
    RETURN 'admin';
  ELSE
    RETURN 'sales';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- Helper to get the sales record for the current user
CREATE OR REPLACE FUNCTION get_user_sales_id()
RETURNS UUID AS $$
DECLARE
  sid UUID;
BEGIN
  SELECT id INTO sid FROM sales WHERE user_id = auth.uid() AND deleted_at IS NULL LIMIT 1;
  RETURN sid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- =================================
-- RLS Policies
-- =================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- ---- profiles ----
-- Everyone can read their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (id = auth.uid());

-- Admin can view all profiles
DROP POLICY IF EXISTS "Admin can view all profiles" ON profiles;
CREATE POLICY "Admin can view all profiles" ON profiles
  FOR SELECT USING (get_user_role() = 'admin');

-- Users can update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Users can insert their own profile (signup trigger will handle this)
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- ---- sales ----
-- Admin full access
DROP POLICY IF EXISTS "Admin full access on sales" ON sales;
CREATE POLICY "Admin full access on sales" ON sales
  FOR ALL USING (get_user_role() = 'admin');

-- Sales can view all sales records (read access)
DROP POLICY IF EXISTS "Sales can view all sales" ON sales;
CREATE POLICY "Sales can view all sales" ON sales
  FOR SELECT USING (
    get_user_role() = 'sales' AND deleted_at IS NULL
  );

-- Sales users can INSERT their own sales record
-- (net addition from fix-sales-rls.sql — required so the signup trigger +
-- manual sales writes survive RLS)
DROP POLICY IF EXISTS "Sales can insert own sales record" ON sales;
CREATE POLICY "Sales can insert own sales record" ON sales
  FOR INSERT WITH CHECK (
    get_user_role() = 'sales' AND user_id = auth.uid()
  );

-- Sales users can UPDATE their own sales record
DROP POLICY IF EXISTS "Sales can update own sales record" ON sales;
CREATE POLICY "Sales can update own sales record" ON sales
  FOR UPDATE USING (
    get_user_role() = 'sales' AND user_id = auth.uid()
  );

-- ---- customers ----
-- Admin full access
DROP POLICY IF EXISTS "Admin full access on customers" ON customers;
CREATE POLICY "Admin full access on customers" ON customers
  FOR ALL USING (get_user_role() = 'admin');

-- Sales can view all active customers
DROP POLICY IF EXISTS "Sales can view all customers" ON customers;
CREATE POLICY "Sales can view all customers" ON customers
  FOR SELECT USING (
    get_user_role() = 'sales' AND deleted_at IS NULL
  );

-- Sales can insert customers under their own sales_id
DROP POLICY IF EXISTS "Sales can insert own customers" ON customers;
CREATE POLICY "Sales can insert own customers" ON customers
  FOR INSERT WITH CHECK (
    get_user_role() = 'sales' AND sales_id = get_user_sales_id()
  );

-- Sales can update their own customers
DROP POLICY IF EXISTS "Sales can update own customers" ON customers;
CREATE POLICY "Sales can update own customers" ON customers
  FOR UPDATE USING (
    get_user_role() = 'sales' AND sales_id = get_user_sales_id()
  );

-- Sales can soft-delete their own customers
DROP POLICY IF EXISTS "Sales can delete own customers" ON customers;
CREATE POLICY "Sales can delete own customers" ON customers
  FOR DELETE USING (
    get_user_role() = 'sales' AND sales_id = get_user_sales_id()
  );

-- ---- projects ----
-- Admin full access
DROP POLICY IF EXISTS "Admin full access on projects" ON projects;
CREATE POLICY "Admin full access on projects" ON projects
  FOR ALL USING (get_user_role() = 'admin');

-- Sales can view all active projects
DROP POLICY IF EXISTS "Sales can view all projects" ON projects;
CREATE POLICY "Sales can view all projects" ON projects
  FOR SELECT USING (
    get_user_role() = 'sales' AND deleted_at IS NULL
  );

-- Sales can insert projects under their own customers
DROP POLICY IF EXISTS "Sales can insert own projects" ON projects;
CREATE POLICY "Sales can insert own projects" ON projects
  FOR INSERT WITH CHECK (
    get_user_role() = 'sales' AND
    customer_id IN (SELECT id FROM customers WHERE sales_id = get_user_sales_id() AND deleted_at IS NULL)
  );

-- Sales can update projects under their own customers
DROP POLICY IF EXISTS "Sales can update own projects" ON projects;
CREATE POLICY "Sales can update own projects" ON projects
  FOR UPDATE USING (
    get_user_role() = 'sales' AND
    customer_id IN (SELECT id FROM customers WHERE sales_id = get_user_sales_id() AND deleted_at IS NULL)
  );

-- Sales can soft-delete projects under their own customers
DROP POLICY IF EXISTS "Sales can delete own projects" ON projects;
CREATE POLICY "Sales can delete own projects" ON projects
  FOR DELETE USING (
    get_user_role() = 'sales' AND
    customer_id IN (SELECT id FROM customers WHERE sales_id = get_user_sales_id() AND deleted_at is null)
  );

-- =================================
-- Auto-create profile + auto-create sales on user signup
-- (final behavior = fix-signup-v4.sql: SECURITY DEFINER + search_path public +
-- EXCEPTION WHEN OTHERS so a profile/sales failure never blocks the user creation)
-- =================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

CREATE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create profile (safe: ON CONFLICT handles duplicates)
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  -- Auto-create sales record only if ALL required metadata is present
  IF (NEW.raw_user_meta_data ->> 'role') = 'sales'
     AND (NEW.raw_user_meta_data ->> 'sales_code') IS NOT NULL
     AND (NEW.raw_user_meta_data ->> 'username') IS NOT NULL
  THEN
    INSERT INTO public.sales (user_id, sales_code, full_name, username, email, status)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data ->> 'sales_code',
      COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
      NEW.raw_user_meta_data ->> 'username',
      COALESCE(NEW.email, ''),
      'active'
    )
    ON CONFLICT DO NOTHING;
  END IF;

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
-- Admin password reset function
-- =================================
CREATE OR REPLACE FUNCTION admin_reset_user_password(
  target_user_id UUID,
  new_password TEXT
)
RETURNS VOID AS $$
BEGIN
  IF get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Only admin can reset passwords';
  END IF;

  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf'))
  WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =================================
-- Sync email from sales table -> auth.users
-- When admin edits email in the app, it also
-- updates the login email in Supabase Auth.
-- =================================
DROP TRIGGER IF EXISTS on_sales_email_changed ON sales;
DROP FUNCTION IF EXISTS sync_sales_email_to_auth();

CREATE FUNCTION sync_sales_email_to_auth()
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

-- =================================
-- Sync full_name from sales table -> auth.users metadata
-- =================================
DROP TRIGGER IF EXISTS on_sales_name_changed ON sales;
DROP FUNCTION IF EXISTS sync_sales_name_to_auth();

CREATE FUNCTION sync_sales_name_to_auth()
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
