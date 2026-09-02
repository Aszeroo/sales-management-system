-- ============================================
-- RE-ENABLE TRIGGER (run after emergency fix)
-- Only run this AFTER confirming users can be
-- created from Dashboard with trigger disabled
-- ============================================

-- Step 1: Create the safest possible trigger function
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create profile + sales record, do NOT touch auth.users
  INSERT INTO profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  -- Auto-create sales record if metadata has required fields
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

-- Step 2: Re-enable the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Step 3: Verify
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    RAISE NOTICE 'SUCCESS: Trigger re-enabled.';
  ELSE
    RAISE NOTICE 'FAILED: Trigger was not created. Check for errors above.';
  END IF;
END $$;
