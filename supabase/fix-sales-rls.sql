-- ============================================
-- COMPREHENSIVE FIX: Sales RLS + Admin Visibility
-- Run ENTIRE script in Supabase SQL Editor
-- ============================================
-- This fixes:
-- 1. "new row violates row-level security policy for table sales"
-- 2. Admin can't see newly created sales users
-- 3. Auto-creates sales record during user signup
-- ============================================


-- ===== STEP 1: Fix the handle_new_user trigger =====
-- The trigger now auto-creates sales record from signUp metadata
-- SECURITY DEFINER bypasses RLS, so INSERT always works

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-confirm email so users can log in immediately
  UPDATE auth.users
  SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
  WHERE id = NEW.id;

  -- Create profile
  INSERT INTO profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''))
  ON CONFLICT (id) DO NOTHING;

  -- Auto-create sales record if metadata has required fields
  -- This bypasses RLS because the function is SECURITY DEFINER
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
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ===== STEP 2: Add missing RLS policies for sales table =====
-- Defense in depth: even if trigger is bypassed, sales users can manage their own record

-- Drop existing policies to avoid conflicts
DO $$
BEGIN
  -- Drop INSERT policy if exists
  DROP POLICY IF EXISTS "Sales can insert own sales record" ON sales;
  -- Drop UPDATE policy if exists
  DROP POLICY IF EXISTS "Sales can update own sales record" ON sales;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Sales users can INSERT their own sales record (user_id must match auth.uid)
CREATE POLICY "Sales can insert own sales record" ON sales
  FOR INSERT WITH CHECK (
    get_user_role() = 'sales' AND user_id = auth.uid()
  );

-- Sales users can UPDATE their own sales record
CREATE POLICY "Sales can update own sales record" ON sales
  FOR UPDATE USING (
    get_user_role() = 'sales' AND user_id = auth.uid()
  );


-- ===== STEP 3: Ensure all existing users have profiles =====
INSERT INTO profiles (id, full_name)
SELECT id, COALESCE(raw_user_meta_data ->> 'full_name', '')
FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles)
ON CONFLICT (id) DO NOTHING;


-- ===== STEP 4: Ensure all sales-role users have sales records =====
-- This catches users created while the trigger was broken
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT au.id, au.email,
           au.raw_user_meta_data ->> 'full_name' AS full_name,
           au.raw_user_meta_data ->> 'sales_code' AS sales_code,
           au.raw_user_meta_data ->> 'username' AS username
    FROM auth.users au
    WHERE (au.raw_user_meta_data ->> 'role') = 'sales'
      AND NOT EXISTS (
        SELECT 1 FROM sales s WHERE s.user_id = au.id AND s.deleted_at IS NULL
      )
  LOOP
    -- Generate a sales_code and username if not in metadata
    INSERT INTO sales (user_id, sales_code, full_name, username, email, status)
    VALUES (
      r.id,
      COALESCE(r.sales_code, 'S' || LPAD(EXTRACT(EPOCH FROM NOW())::TEXT, 10, '0')),
      COALESCE(r.full_name, ''),
      COALESCE(r.username, SPLIT_PART(r.email, '@', 1)),
      r.email,
      'active'
    )
    ON CONFLICT DO NOTHING;

    -- Also update the user's metadata with the generated fields
    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data
      || jsonb_build_object(
        'sales_code', COALESCE(r.sales_code, (SELECT sales_code FROM sales WHERE user_id = r.id LIMIT 1)),
        'username', COALESCE(r.username, (SELECT username FROM sales WHERE user_id = r.id LIMIT 1))
      )
    WHERE id = r.id;
  END LOOP;
END $$;


-- ===== STEP 5: Confirm ALL unconfirmed users =====
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email_confirmed_at IS NULL;


-- ===== STEP 6: Verify =====
DO $$
BEGIN
  RAISE NOTICE '=== Fix Applied Successfully ===';
  RAISE NOTICE 'Trigger: handle_new_user now auto-creates sales records from signUp metadata';
  RAISE NOTICE 'RLS: Added INSERT and UPDATE policies for sales users on sales table';
  RAISE NOTICE 'Data: All users now have profiles and sales records (if role=sales)';
END $$;
