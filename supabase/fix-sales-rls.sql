-- ============================================
-- COMPREHENSIVE FIX: Sales RLS + Admin Visibility
-- Run ENTIRE script in Supabase SQL Editor
-- ============================================
-- This fixes:
-- 1. "Database error saving new user" (UPDATE auth.users in trigger)
-- 2. "new row violates row-level security policy for table sales"
-- 3. Admin can't see newly created sales users
-- ============================================
-- IMPORTANT: For email confirmation, turn OFF "Confirm email" in
-- Supabase Dashboard → Authentication → Settings → Email
-- Do NOT use UPDATE auth.users inside the trigger!
-- ============================================


-- ===== STEP 1: Drop old trigger and function FIRST =====
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();


-- ===== STEP 2: Create FIXED trigger function =====
-- NO UPDATE on auth.users — that causes "Database error saving new user"
-- SECURITY DEFINER bypasses RLS for profile + sales creation

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create profile (with ON CONFLICT for safety)
  INSERT INTO profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''))
  ON CONFLICT (id) DO NOTHING;

  -- Auto-create sales record if metadata has required fields
  -- SECURITY DEFINER bypasses RLS, so INSERT always works
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

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ===== STEP 3: Add missing RLS policies for sales table =====
DO $$
BEGIN
  DROP POLICY IF EXISTS "Sales can insert own sales record" ON sales;
  DROP POLICY IF EXISTS "Sales can update own sales record" ON sales;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Sales users can INSERT their own sales record
CREATE POLICY "Sales can insert own sales record" ON sales
  FOR INSERT WITH CHECK (
    get_user_role() = 'sales' AND user_id = auth.uid()
  );

-- Sales users can UPDATE their own sales record
CREATE POLICY "Sales can update own sales record" ON sales
  FOR UPDATE USING (
    get_user_role() = 'sales' AND user_id = auth.uid()
  );


-- ===== STEP 4: Confirm ALL unconfirmed users =====
-- Do this OUTSIDE the trigger to avoid recursive issues
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email_confirmed_at IS NULL;


-- ===== STEP 5: Ensure all users have profiles =====
INSERT INTO profiles (id, full_name)
SELECT id, COALESCE(raw_user_meta_data ->> 'full_name', '')
FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles)
ON CONFLICT (id) DO NOTHING;


-- ===== STEP 6: Ensure all sales-role users have sales records =====
DO $$
DECLARE
  r RECORD;
  gen_code TEXT;
  gen_username TEXT;
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
    -- Generate fallback values
    gen_code := COALESCE(r.sales_code, 'S' || REPLACE(r.id::TEXT, '-', '') || EXTRACT(EPOCH FROM NOW())::INT::TEXT);
    gen_username := COALESCE(r.username, SPLIT_PART(r.email, '@', 1));

    INSERT INTO sales (user_id, sales_code, full_name, username, email, status)
    VALUES (r.id, gen_code, COALESCE(r.full_name, ''), gen_username, r.email, 'active')
    ON CONFLICT DO NOTHING;

    -- Update metadata so the app has the fields
    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object(
      'sales_code', gen_code,
      'username', gen_username
    )
    WHERE id = r.id;
  END LOOP;
END $$;


-- ===== STEP 7: Verify =====
DO $$
DECLARE
  trigger_count INT;
  policy_count INT;
  profile_count INT;
  sales_count INT;
BEGIN
  SELECT COUNT(*) INTO trigger_count FROM pg_trigger WHERE tgname = 'on_auth_user_created';
  SELECT COUNT(*) INTO policy_count FROM pg_policies WHERE tablename = 'sales';
  SELECT COUNT(*) INTO profile_count FROM profiles;
  SELECT COUNT(*) INTO sales_count FROM sales WHERE deleted_at IS NULL;

  RAISE NOTICE '=== Fix Applied Successfully ===';
  RAISE NOTICE 'Trigger exists: % (should be 1)', trigger_count;
  RAISE NOTICE 'Sales RLS policies: % (should be 3+)', policy_count;
  RAISE NOTICE 'Total profiles: %', profile_count;
  RAISE NOTICE 'Total active sales: %', sales_count;
  RAISE NOTICE '';
  RAISE NOTICE 'IMPORTANT: Make sure "Confirm email" is OFF in Supabase Dashboard → Authentication → Settings';
END $$;
