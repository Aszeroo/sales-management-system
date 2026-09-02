-- ============================================
-- EMERGENCY FIX: Disable trigger, then rebuild
-- Run this in Supabase SQL Editor
-- ============================================

-- ===== STEP 1: DISABLE the broken trigger immediately =====
-- This lets you create users again from Dashboard or app
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- ===== STEP 2: Drop the broken function =====
DROP FUNCTION IF EXISTS handle_new_user();

-- ===== STEP 3: Confirm all unconfirmed users =====
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email_confirmed_at IS NULL;

-- ===== STEP 4: Test - manually create a profile for any user missing one =====
-- This catches users created while the trigger was broken
INSERT INTO profiles (id, full_name)
SELECT id, COALESCE(raw_user_meta_data ->> 'full_name', '')
FROM auth.users
WHERE id NOT IN (SELECT id FROM profiles)
ON CONFLICT (id) DO NOTHING;

-- ===== STEP 5: Verify =====
DO $$
BEGIN
  RAISE NOTICE 'Trigger DISABLED. You can now create users from Dashboard → Authentication → Users.';
  RAISE NOTICE 'After creating a test user, run fix-signup-v3.sql to re-enable the trigger.';
END $$;
