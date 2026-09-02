-- ============================================
-- FIX: Set admin role + fix RLS
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Show all users and their current roles
-- Run this FIRST to find your admin user's email
SELECT
  id,
  email,
  raw_user_meta_data ->> 'role' AS current_role,
  email_confirmed_at IS NOT NULL AS confirmed
FROM auth.users;

-- Step 2: Set admin role for your admin user
-- REPLACE 'admin@example.com' with your actual admin email
UPDATE auth.users
SET raw_user_meta_data = raw_user_meta_data || '{"role": "admin"}'::jsonb
WHERE email = 'admin@example.com';

-- Step 3: Also update profiles full_name if missing
UPDATE profiles
SET full_name = COALESCE(
  (SELECT raw_user_meta_data ->> 'full_name' FROM auth.users WHERE id = profiles.id),
  full_name,
  ''
)
WHERE full_name = '' OR full_name IS NULL;

-- Step 4: Confirm all unconfirmed users
UPDATE auth.users
SET email_confirmed_at = NOW()
WHERE email_confirmed_at IS NULL;

-- ===== AFTER RUNNING: Log out and log back in =====
-- This is important! The JWT must be refreshed to include the new role.
-- The old JWT still has role='sales' until you re-login.
