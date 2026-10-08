-- supabase/seed.sql — seed accounts for local dev / tests.
--
-- Runs automatically after migrations on `npx supabase db reset` (see
-- [db.seed] in supabase/config.toml), so the local DB is never empty: three
-- sign-in-able accounts, one per role, exactly as documented in the README's
-- local-dev section.
--
--   email                password            role     sales row
--   admin@example.com    Seed-Password-123   admin    none (ADR-0001)
--   manager@example.com  Seed-Password-123   manager  SEED-MG-001
--   sales@example.com    Seed-Password-123   sales    SEED-SL-001
--
-- LOCAL DEV ONLY — these are well-known credentials; never reuse them
-- anywhere real data lives.
--
-- How it works: the standard "seed auth users" SQL pattern — insert into
-- auth.users with encrypted_password from crypt + gen_salt('bf') (pgcrypto
-- lives in the `extensions` schema) and email_confirmed_at set, so GoTrue
-- accepts a password sign-in immediately. Row shape (instance_id, aud/role,
-- raw_app_meta_data provider chain, email identity) mirrors what GoTrue's
-- own signUp writes, and because the insert goes through auth.users, the
-- REAL signup trigger on_auth_user_created (handle_new_user) fires for each
-- account: it writes the profile row and — for sales/manager only — the
-- sales row from raw_user_meta_data (sales_code/username are preserved
-- byte-for-byte by the trigger). Admin deliberately gets no sales row.
--
-- Idempotent within a reset cycle: fixed UUIDs + ON CONFLICT DO NOTHING mean
-- re-running this file against an already-seeded DB is a no-op, and the
-- guarded profile/sales backfills (SELECT ... FROM auth.users) rebuild those
-- rows without ever conflicting with the trigger's own inserts.

-- =================================
-- 1. Auth users — one per role
-- =================================
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  last_sign_in_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '11111111-1111-4111-8111-111111111111',
    'authenticated',
    'authenticated',
    'admin@example.com',
    extensions.crypt('Seed-Password-123', extensions.gen_salt('bf')),
    now(),
    now(),
    '',
    '',
    '',
    '',
    '{"provider": "email", "providers": ["email"]}',
    '{"sub": "11111111-1111-4111-8111-111111111111", "role": "admin", "full_name": "Seed Admin"}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '22222222-2222-4222-8222-222222222222',
    'authenticated',
    'authenticated',
    'manager@example.com',
    extensions.crypt('Seed-Password-123', extensions.gen_salt('bf')),
    now(),
    now(),
    '',
    '',
    '',
    '',
    '{"provider": "email", "providers": ["email"]}',
    '{"sub": "22222222-2222-4222-8222-222222222222", "role": "manager", "full_name": "Seed Manager", "sales_code": "SEED-MG-001", "username": "seed-manager"}',
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '33333333-3333-4333-8333-333333333333',
    'authenticated',
    'authenticated',
    'sales@example.com',
    extensions.crypt('Seed-Password-123', extensions.gen_salt('bf')),
    now(),
    now(),
    '',
    '',
    '',
    '',
    '{"provider": "email", "providers": ["email"]}',
    '{"sub": "33333333-3333-4333-8333-333333333333", "role": "sales", "full_name": "Seed Sales", "sales_code": "SEED-SL-001", "username": "seed-sales"}',
    now(),
    now()
  )
ON CONFLICT DO NOTHING;

-- =================================
-- 2. Email identities for the seed users
-- =================================
-- GoTrue's signUp creates an auth.identities row alongside the user; keep
-- the seeded state faithful (guarded by the fixed user ids, so a skipped
-- user above is skipped here too — no dangling inserts).
INSERT INTO auth.identities (
  provider_id,
  user_id,
  identity_data,
  provider,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  au.id::text,
  au.id,
  au.raw_user_meta_data
    || jsonb_build_object('email', au.email, 'email_verified', true),
  'email',
  now(),
  now(),
  now()
FROM auth.users au
WHERE au.id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
)
ON CONFLICT (provider_id, provider) DO NOTHING;

-- =================================
-- 3. Backfill profiles + sales rows
-- =================================
-- On a fresh reset the signup trigger above already created these rows
-- (the inserts into auth.users fire handle_new_user for real). These
-- guarded backfills only matter on re-runs where the auth.users insert was
-- skipped but the public-side rows were deleted afterwards — identical
-- column values, so ON CONFLICT DO NOTHING makes them no-ops when the
-- trigger already did its job.

INSERT INTO public.profiles (id, full_name)
SELECT
  au.id,
  COALESCE(au.raw_user_meta_data ->> 'full_name', '')
FROM auth.users au
WHERE au.id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
)
ON CONFLICT (id) DO NOTHING;

-- Owner-capable roles only (sales, manager) — admin must never get a sales
-- row here either (ADR-0001). The metadata guards keep NOT NULL columns
-- safe if the DB is ever in a half-seeded state.
INSERT INTO public.sales (user_id, sales_code, full_name, username, email, status)
SELECT
  au.id,
  au.raw_user_meta_data ->> 'sales_code',
  COALESCE(au.raw_user_meta_data ->> 'full_name', ''),
  au.raw_user_meta_data ->> 'username',
  au.email,
  'active'
FROM auth.users au
WHERE au.id IN (
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333'
)
  AND COALESCE(au.raw_user_meta_data ->> 'sales_code', '') <> ''
  AND COALESCE(au.raw_user_meta_data ->> 'username', '') <> ''
ON CONFLICT DO NOTHING;
