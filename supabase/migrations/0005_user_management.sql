-- =================================
-- 0005_user_management.sql — Full User management for Admin (issue #7,
-- ADR-0001): account operations become SECURITY DEFINER RPCs callable from
-- the anon key by an Admin — no client-side signUp/session juggling, no
-- service-role key in the frontend.
--
--   | operation                | who    | enforcement                          |
--   |--------------------------|--------|--------------------------------------|
--   | create user (any role)   | admin  | RPC + get_user_role() check          |
--   | reset password           | admin  | RPC + get_user_role() check          |
--   | deactivate / reactivate  | admin  | RPC + real ban via auth.banned_until |
--   | change role              | admin  | RPC + owner-reassignment guard       |
--   | pending reassignment cnt | admin  | RPC (UI warns BEFORE attempting)     |
--   | list users (all roles)   | admin  | RPC (admins have no sales row)       |
--
--   1. Sales RLS fix (rule #7 — "Admin เท่านั้นที่จัดการ Sales ได้"): the
--      0002-era policies that let Sales/Manager insert/update their own
--      sales row are dropped. The sales row is DB-managed from here on: it
--      is created by the signup trigger (0002) and kept in sync by
--      admin_change_role below; Sales reads the directory but never writes
--      it — not even their own row.
--   2. Deactivate = REAL ban (ADR-0001): banned_until is set far in the
--      future on auth.users; GoTrue rejects every login attempt with
--      "User is banned" while it is in the future. Reactivate clears it.
--   3. Owner-reassignment guard (ADR-0001 — every Customer must always have
--      a Sales Owner): deactivating a user, or promoting them to admin,
--      while they still own customers is REJECTED with the owned-customer
--      count in the message; reassigning those customers first is the
--      operator's job (Admin assigns owners from the customer UI, #4).
--      admin_pending_reassignment_count returns the same number so the UI
--      can warn BEFORE the operator attempts the change.
--   4. Role changes keep ADR-0001's invariant "owner-capable users have a
--      sales row, admin never has one": Sales <-> Manager keeps the row,
--      promotion to admin soft-deletes it, demotion from admin revives the
--      latest soft-deleted row (or creates a fresh one, mirroring the
--      0002 trigger's generation rules). The role itself stays in
--      auth.users.raw_user_meta_data, the same place signups put it.
--
-- Append-only migration: 0001-0004 are not rewritten (squash in #9).
-- =================================

-- pgcrypto (crypt / gen_salt for password hashing), preinstalled in the
-- extensions schema on every Supabase project; declared for portability.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =================================
-- 1. Sales RLS fix — writes become Admin-only (rule #7)
-- =================================
-- 0001's "Admin full access on sales" (FOR ALL) remains the only write
-- path; service_role keeps bypassing RLS for maintenance. Sales/Manager
-- keep the 0002 read policy on the directory.
DROP POLICY IF EXISTS "Sales can insert own sales record" ON sales;
DROP POLICY IF EXISTS "Sales can update own sales record" ON sales;

-- =================================
-- 2. Internal helper: how many active Customers does the user own?
-- =================================
-- Ownership anchor is the user's ACTIVE sales row (current_sales_id()'s
-- definition). Admin-role users have no sales row, so they always count 0.
-- Not executable by any API role: the endpoint below is the only path.
CREATE OR REPLACE FUNCTION admin_owned_customer_count(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count
  FROM customers c
  JOIN sales s ON s.id = c.sales_id
  WHERE s.user_id = p_user_id
    AND s.deleted_at IS NULL
    AND c.deleted_at IS NULL;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

REVOKE ALL ON FUNCTION admin_owned_customer_count(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_owned_customer_count(UUID) FROM anon;
REVOKE ALL ON FUNCTION admin_owned_customer_count(UUID) FROM authenticated;

-- =================================
-- 3. Shared guard: every admin RPC re-checks the CALLER's role
-- =================================
-- get_user_role() resolves from the caller's JWT metadata (auth.jwt()),
-- which stays bound to the requesting user inside a SECURITY DEFINER
-- function — the same mechanism the RLS policies and 0003's RPC use.

-- =================================
-- 4. admin_list_users — one list of every User of every role
-- =================================
-- The unified users page cannot read auth.users through the anon key, and
-- admins have no sales row — so the sales directory alone can never show
-- them. This RPC is the single read for the page.
CREATE OR REPLACE FUNCTION admin_list_users()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  is_active BOOLEAN,
  sales_id UUID,
  sales_code TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  IF get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Admin only: this operation requires the admin role'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT u.id,
         u.email::text,
         COALESCE(p.full_name, u.raw_user_meta_data ->> 'full_name', ''),
         COALESCE(u.raw_user_meta_data ->> 'role', 'sales'),
         (u.banned_until IS NULL OR u.banned_until <= now()),
         s.id,
         s.sales_code,
         u.created_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  LEFT JOIN public.sales s ON s.user_id = u.id AND s.deleted_at IS NULL
  ORDER BY u.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- =================================
-- 5. admin_create_user — create a User with any of the 3 roles
-- =================================
-- Inserts the auth user directly (SECURITY DEFINER runs as postgres, which
-- owns grants on auth schema tables), mirroring what GoTrue writes on a
-- real signup: bcrypt-hashed password (crypt), confirmed email, the
-- provider metadata, and the email identity row. The on_auth_user_created
-- trigger then runs EXACTLY as it would for a signup — creating the
-- profile and, for owner-capable roles, the sales row.
CREATE OR REPLACE FUNCTION admin_create_user(
  p_email TEXT,
  p_password TEXT,
  p_full_name TEXT,
  p_role TEXT
)
RETURNS UUID AS $$
DECLARE
  v_id UUID := gen_random_uuid();
BEGIN
  IF get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Admin only: this operation requires the admin role'
      USING ERRCODE = '42501';
  END IF;

  IF p_role NOT IN ('admin', 'manager', 'sales') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role USING ERRCODE = '22023';
  END IF;

  IF p_email IS NULL OR p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'A valid email is required' USING ERRCODE = '22023';
  END IF;

  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters'
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(p_email)) THEN
    RAISE EXCEPTION 'This email is already registered' USING ERRCODE = '23505';
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    reauthentication_token, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_id,
    'authenticated',
    'authenticated',
    lower(p_email),
    crypt(p_password, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('role', p_role, 'full_name', COALESCE(p_full_name, '')),
    '', '', '', '', '', '',
    now(), now()
  );
  -- AFTER INSERT trigger (on_auth_user_created) creates the profile here
  -- and the sales row iff the role is owner-capable — the same trigger a
  -- real signup runs.

  INSERT INTO auth.identities (
    user_id, provider_id, identity_data, provider, last_sign_in_at,
    created_at, updated_at
  ) VALUES (
    v_id,
    v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', lower(p_email),
                       'email_verified', true),
    'email',
    now(), now(), now()
  );

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- =================================
-- 6. admin_reset_password — reset any User's password for real
-- =================================
CREATE OR REPLACE FUNCTION admin_reset_password(
  p_user_id UUID,
  p_new_password TEXT
)
RETURNS VOID AS $$
BEGIN
  IF get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Admin only: this operation requires the admin role'
      USING ERRCODE = '42501';
  END IF;

  IF p_new_password IS NULL OR length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters'
      USING ERRCODE = '22023';
  END IF;

  UPDATE auth.users
     SET encrypted_password = crypt(p_new_password, gen_salt('bf')),
         updated_at = now()
   WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions;

-- =================================
-- 7. admin_set_user_active — REAL deactivate / reactivate
-- =================================
-- Deactivate sets banned_until far in the future: GoTrue rejects every
-- subsequent login with "User is banned" (verified against GoTrue v2's
-- ResourceOwnerPasswordGrant). Reactivate clears it. The owner guard runs
-- on deactivate: a Sales Owner cannot leave their customers ownerless.
CREATE OR REPLACE FUNCTION admin_set_user_active(
  p_user_id UUID,
  p_active BOOLEAN
)
RETURNS VOID AS $$
DECLARE
  v_owned INTEGER;
BEGIN
  IF get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Admin only: this operation requires the admin role'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT p_active THEN
    v_owned := admin_owned_customer_count(p_user_id);
    IF v_owned > 0 THEN
      RAISE EXCEPTION
        'Cannot deactivate: this user still owns % customer(s). Reassign their customers first.',
        v_owned;
    END IF;

    UPDATE auth.users
       SET banned_until = now() + interval '100 years',
           updated_at = now()
     WHERE id = p_user_id;
  ELSE
    UPDATE auth.users
       SET banned_until = NULL,
           updated_at = now()
     WHERE id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =================================
-- 8. admin_change_role — change any User's role (with owner guard)
-- =================================
-- Sales <-> Manager is free. Moving OUT of owner-capable into admin is
-- blocked while the user still owns customers (guard reports the count).
-- The sales row follows ADR-0001's invariant in both directions.
CREATE OR REPLACE FUNCTION admin_change_role(
  p_user_id UUID,
  p_new_role TEXT
)
RETURNS TEXT AS $$
DECLARE
  v_current_role TEXT;
  v_owned INTEGER;
  v_username TEXT;
  v_username_base TEXT;
  v_full_name TEXT;
  v_email TEXT;
BEGIN
  IF get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Admin only: this operation requires the admin role'
      USING ERRCODE = '42501';
  END IF;

  IF p_new_role NOT IN ('admin', 'manager', 'sales') THEN
    RAISE EXCEPTION 'Invalid role: %', p_new_role USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(raw_user_meta_data ->> 'role', 'sales'), email
    INTO v_current_role, v_email
    FROM auth.users
   WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent no-op when the role is already the requested one.
  IF v_current_role = p_new_role THEN
    RETURN p_new_role;
  END IF;

  -- Owner-reassignment guard: promoting an owner-capable user to admin.
  IF v_current_role IN ('sales', 'manager') AND p_new_role = 'admin' THEN
    v_owned := admin_owned_customer_count(p_user_id);
    IF v_owned > 0 THEN
      RAISE EXCEPTION
        'Cannot change role to admin: this user still owns % customer(s). Reassign their customers first.',
        v_owned;
    END IF;
  END IF;

  UPDATE auth.users
     SET raw_user_meta_data = jsonb_set(
           COALESCE(raw_user_meta_data, '{}'::jsonb),
           '{role}',
           to_jsonb(p_new_role)
         ),
         updated_at = now()
   WHERE id = p_user_id;

  -- ADR-0001 invariant upkeep: owner-capable users have a sales row, admin
  -- never does. Sales <-> Manager keeps the row untouched.
  IF p_new_role = 'admin' THEN
    UPDATE sales
       SET deleted_at = now(),
           status = 'inactive',
           updated_at = now()
     WHERE user_id = p_user_id
       AND deleted_at IS NULL;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM sales WHERE user_id = p_user_id AND deleted_at IS NULL
    ) THEN
      -- Revive the user's own latest soft-deleted row first: it keeps their
      -- original sales_code/username instead of minting new ones.
      UPDATE sales
         SET deleted_at = NULL,
             status = 'active',
             updated_at = now()
       WHERE id = (
         SELECT id FROM sales
          WHERE user_id = p_user_id AND deleted_at IS NOT NULL
          ORDER BY updated_at DESC
          LIMIT 1
       );

      IF NOT EXISTS (
        SELECT 1 FROM sales WHERE user_id = p_user_id AND deleted_at IS NULL
      ) THEN
        -- Fresh row, mirroring the 0002 trigger's generation rules.
        SELECT COALESCE(p.full_name, u.raw_user_meta_data ->> 'full_name', '')
          INTO v_full_name
          FROM auth.users u
          LEFT JOIN public.profiles p ON p.id = u.id
         WHERE u.id = p_user_id;

        v_username_base := lower(regexp_replace(
          split_part(COALESCE(v_email, ''), '@', 1),
          '[^a-z0-9._-]', '', 'g'
        ));
        IF v_username_base IS NULL OR v_username_base = '' THEN
          v_username_base := 'user';
        END IF;
        v_username := v_username_base || '-' || substr(replace(p_user_id::text, '-', ''), 1, 8);
        -- The id-derived suffix is unique in practice; loop guards the race.
        WHILE EXISTS (SELECT 1 FROM sales WHERE username = v_username) LOOP
          v_username := v_username_base || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 8);
        END LOOP;

        INSERT INTO sales (user_id, sales_code, full_name, username, email, status)
        VALUES (
          p_user_id,
          'SL-' || upper(replace(p_user_id::text, '-', '')),
          v_full_name,
          v_username,
          COALESCE(v_email, ''),
          'active'
        );
      END IF;
    END IF;
  END IF;

  RETURN p_new_role;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- =================================
-- 9. admin_pending_reassignment_count — the UI's advance warning
-- =================================
-- Called BEFORE deactivate / promote-to-admin: the page warns with this
-- number up front, and the guarded RPCs reject with the same number if the
-- operator proceeds anyway.
CREATE OR REPLACE FUNCTION admin_pending_reassignment_count(p_user_id UUID)
RETURNS INTEGER AS $$
BEGIN
  IF get_user_role() != 'admin' THEN
    RAISE EXCEPTION 'Admin only: this operation requires the admin role'
      USING ERRCODE = '42501';
  END IF;

  RETURN admin_owned_customer_count(p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- =================================
-- 10. Grants — Admin-only RPCs, clear errors for everyone else
-- =================================
-- Every function's FIRST statement is the admin check, so granting EXECUTE
-- broadly is safe: non-admin callers get the function's own clear
-- "Admin only" error instead of an opaque PostgREST permission denial.
-- The internal helper (admin_owned_customer_count) stays postgres-only.
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'admin_list_users',
    'admin_create_user',
    'admin_reset_password',
    'admin_set_user_active',
    'admin_change_role',
    'admin_pending_reassignment_count'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %I FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I TO anon, authenticated', fn);
  END LOOP;
END;
$$;

-- Tighten the 0001-era password-reset RPC the new admin_reset_password
-- supersedes: it was left PUBLIC-executable by default. Its own admin
-- check stays; the wide grant does not.
REVOKE ALL ON FUNCTION admin_reset_user_password(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_reset_user_password(UUID, TEXT) TO authenticated;
