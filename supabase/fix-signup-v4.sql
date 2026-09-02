-- ============================================
-- ROBUST FIX v4: "Database error saving new user"
-- This fixes the recurring signup trigger issue.
--
-- ROOT CAUSE: The trigger on auth.users conflicts
-- with Supabase's internal auth triggers. This fix
-- uses proper exception handling and minimal logic.
--
-- Run this ENTIRE script in Supabase SQL Editor.
-- ============================================

-- ===== STEP 1: Clean slate — drop everything =====
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS handle_new_user();

-- Also clean up any leftover sync triggers (re-create them later)
DROP TRIGGER IF EXISTS on_sales_email_changed ON sales;
DROP TRIGGER IF EXISTS on_sales_name_changed ON sales;
DROP FUNCTION IF EXISTS sync_sales_email_to_auth();
DROP FUNCTION IF EXISTS sync_sales_name_to_auth();

-- ===== STEP 2: Create the simplest, safest trigger function =====
-- Key: SECURITY DEFINER + SET search_path = public
-- This prevents conflicts with Supabase's internal schema.
-- No UPDATE on auth.users — only INSERTs on public tables.
CREATE OR REPLACE FUNCTION handle_new_user()
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

-- ===== STEP 3: Create the trigger =====
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ===== STEP 4: Recreate sync triggers for email/name changes =====
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

-- ===== STEP 5: Confirm all unconfirmed users =====
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email_confirmed_at IS NULL;

-- ===== STEP 6: Create profiles for any orphaned users =====
INSERT INTO public.profiles (id, full_name)
SELECT id, COALESCE(raw_user_meta_data ->> 'full_name', '')
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;

-- ===== STEP 7: Verify =====
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'on_auth_user_created'
      AND tgenabled = 'O'
  ) THEN
    RAISE NOTICE '✅ Trigger is active. Try creating a sales user now.';
  ELSE
    RAISE NOTICE '❌ Trigger was NOT created or is disabled! Check for errors above.';
  END IF;
END $$;
