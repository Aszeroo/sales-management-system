-- ============================================
-- FIX: "Database error saving new user"
-- Run this in Supabase SQL Editor
-- ============================================

-- 1. Drop the existing trigger first
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Recreate the handle_new_user function (simplified, no UPDATE on auth.users)
-- The UPDATE on auth.users inside an AFTER INSERT trigger on auth.users
-- can cause conflicts with Supabase internal triggers.
-- Since we disable email confirmation in Dashboard, this is not needed.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create profile with ON CONFLICT to handle edge cases gracefully
  INSERT INTO profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''))
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 4. Confirm ALL existing unconfirmed users
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email_confirmed_at IS NULL;
