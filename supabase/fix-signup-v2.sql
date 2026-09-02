-- ============================================
-- COMPREHENSIVE FIX: "Database error saving new user"
-- Run ENTIRE script in Supabase SQL Editor
-- ============================================

-- ===== PART 1: DIAGNOSTIC =====
-- Check if profiles table exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles' AND table_schema = 'public') THEN
    RAISE WARNING 'profiles table does NOT exist! Run schema.sql first.';
  ELSE
    RAISE NOTICE 'profiles table exists.';
  END IF;
END $$;

-- Check if trigger exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    RAISE NOTICE 'Trigger on_auth_user_created exists.';
  ELSE
    RAISE WARNING 'Trigger on_auth_user_created does NOT exist!';
  END IF;
END $$;

-- Check RLS policies on profiles
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname, cmd FROM pg_policies WHERE tablename = 'profiles'
  LOOP
    RAISE NOTICE 'Policy: % (%)', pol.policyname, pol.cmd;
  END LOOP;
END $$;


-- ===== PART 2: FIX =====

-- Step 1: Drop the existing trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Step 2: Create the simplest possible trigger function
-- No UPDATE on auth.users, no complex logic — just create the profile
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Step 4: Confirm ALL existing unconfirmed users
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email_confirmed_at IS NULL;

-- Step 5: Verify the fix
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    RAISE NOTICE 'SUCCESS: Trigger recreated. Try signing up now.';
  ELSE
    RAISE NOTICE 'FAILED: Trigger was not created. Check for errors above.';
  END IF;
END $$;
