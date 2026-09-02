-- ============================================
-- ONE-CLICK FIX: Run this in Supabase SQL Editor
-- Fixes: email confirmation + email sync + name sync
-- ============================================

-- 1. Confirm ALL existing unconfirmed users
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email_confirmed_at IS NULL;

-- 2. Auto-confirm trigger for NEW users
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''))
  ON CONFLICT (id) DO NOTHING;

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

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 3. Sync email from sales → auth.users
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_sales_email_changed ON sales;
CREATE TRIGGER on_sales_email_changed
  AFTER UPDATE OF email ON sales
  FOR EACH ROW
  EXECUTE FUNCTION sync_sales_email_to_auth();

-- 4. Sync full_name from sales → auth.users metadata
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
