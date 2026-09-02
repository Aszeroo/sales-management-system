-- ============================================
-- Sales Management System - Database Schema
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. profiles table (extends Supabase auth.users)
-- ============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- 2. sales table
-- ============================================
CREATE TABLE sales (
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

-- ============================================
-- 3. customers table
-- ============================================
CREATE TABLE customers (
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

-- ============================================
-- 4. projects table
-- ============================================
CREATE TABLE projects (
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

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX idx_sales_user_id ON sales(user_id);
CREATE INDEX idx_sales_status ON sales(status);
CREATE INDEX idx_sales_deleted_at ON sales(deleted_at);

CREATE INDEX idx_customers_sales_id ON customers(sales_id);
CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_deleted_at ON customers(deleted_at);

CREATE INDEX idx_projects_customer_id ON projects(customer_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_deleted_at ON projects(deleted_at);

-- ============================================
-- updated_at trigger function
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sales_updated_at BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Helper function: Get current user's role
-- ============================================
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
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper to get the sales record for the current user
CREATE OR REPLACE FUNCTION get_user_sales_id()
RETURNS UUID AS $$
DECLARE
  sid UUID;
BEGIN
  SELECT id INTO sid FROM sales WHERE user_id = auth.uid() AND deleted_at IS NULL LIMIT 1;
  RETURN sid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================
-- RLS Policies
-- ============================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- ---- profiles ----
-- Everyone can read their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (id = auth.uid());

-- Admin can view all profiles
CREATE POLICY "Admin can view all profiles" ON profiles
  FOR SELECT USING (get_user_role() = 'admin');

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- Users can insert their own profile (signup trigger will handle this)
CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- ---- sales ----
-- Admin full access
CREATE POLICY "Admin full access on sales" ON sales
  FOR ALL USING (get_user_role() = 'admin');

-- Sales can view all sales records (read access)
CREATE POLICY "Sales can view all sales" ON sales
  FOR SELECT USING (
    get_user_role() = 'sales' AND deleted_at IS NULL
  );

-- ---- customers ----
-- Admin full access
CREATE POLICY "Admin full access on customers" ON customers
  FOR ALL USING (get_user_role() = 'admin');

-- Sales can view all active customers
CREATE POLICY "Sales can view all customers" ON customers
  FOR SELECT USING (
    get_user_role() = 'sales' AND deleted_at IS NULL
  );

-- Sales can insert customers under their own sales_id
CREATE POLICY "Sales can insert own customers" ON customers
  FOR INSERT WITH CHECK (
    get_user_role() = 'sales' AND sales_id = get_user_sales_id()
  );

-- Sales can update their own customers
CREATE POLICY "Sales can update own customers" ON customers
  FOR UPDATE USING (
    get_user_role() = 'sales' AND sales_id = get_user_sales_id()
  );

-- Sales can soft-delete their own customers
CREATE POLICY "Sales can delete own customers" ON customers
  FOR DELETE USING (
    get_user_role() = 'sales' AND sales_id = get_user_sales_id()
  );

-- ---- projects ----
-- Admin full access
CREATE POLICY "Admin full access on projects" ON projects
  FOR ALL USING (get_user_role() = 'admin');

-- Sales can view all active projects
CREATE POLICY "Sales can view all projects" ON projects
  FOR SELECT USING (
    get_user_role() = 'sales' AND deleted_at IS NULL
  );

-- Sales can insert projects under their own customers
CREATE POLICY "Sales can insert own projects" ON projects
  FOR INSERT WITH CHECK (
    get_user_role() = 'sales' AND
    customer_id IN (SELECT id FROM customers WHERE sales_id = get_user_sales_id() AND deleted_at IS NULL)
  );

-- Sales can update projects under their own customers
CREATE POLICY "Sales can update own projects" ON projects
  FOR UPDATE USING (
    get_user_role() = 'sales' AND
    customer_id IN (SELECT id FROM customers WHERE sales_id = get_user_sales_id() AND deleted_at IS NULL)
  );

-- Sales can soft-delete projects under their own customers
CREATE POLICY "Sales can delete own projects" ON projects
  FOR DELETE USING (
    get_user_role() = 'sales' AND
    customer_id IN (SELECT id FROM customers WHERE sales_id = get_user_sales_id() AND deleted_at IS NULL)
  );

-- ============================================
-- Auto-create profile + auto-confirm email on user signup
-- ============================================
-- NOTE: Set 'Sender email' in Supabase Dashboard → Authentication → Email
-- and turn OFF 'Confirm email' in the same panel for faster onboarding.
-- The trigger below also auto-confirms so users can log in immediately.
-- ============================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create profile (with ON CONFLICT for safety)
  INSERT INTO profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''))
  ON CONFLICT (id) DO NOTHING;

  -- Auto-create sales record if metadata has required fields
  -- SECURITY DEFINER bypasses RLS
  IF (NEW.raw_user_meta_data ->> 'role') = 'sales'
     AND (NEW.raw_user_meta_data ->> 'sales_code') IS NOT NULL
     AND (NEW.raw_user_meta_data ->> 'username') IS NOT NULL
  THEN
    INSERT INTO sales (user_id, sales_code, full_name, username, email, status)
    VALUES (
      NEW.id,
      NEW.raw_user_meta_data ->> 'sales_code',
      COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
      NEW.raw_user_meta_data ->> 'username',
      NEW.email,
      'active'
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists (safe to re-run)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================
-- Admin password reset function
-- ============================================
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Sync email from sales table → auth.users
-- When admin edits email in the app, it also
-- updates the login email in Supabase Auth.
-- ============================================
CREATE OR REPLACE FUNCTION sync_sales_email_to_auth()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync if email actually changed
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE auth.users
    SET
      email = NEW.email,
      raw_user_meta_data = raw_user_meta_data || jsonb_build_object('email', NEW.email)
    WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_sales_email_changed ON sales;

CREATE TRIGGER on_sales_email_changed
  AFTER UPDATE OF email ON sales
  FOR EACH ROW
  EXECUTE FUNCTION sync_sales_email_to_auth();

-- ============================================
-- Sync full_name from sales table → auth.users metadata
-- ============================================
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_sales_name_changed ON sales;

CREATE TRIGGER on_sales_name_changed
  AFTER UPDATE OF full_name ON sales
  FOR EACH ROW
  EXECUTE FUNCTION sync_sales_name_to_auth();
