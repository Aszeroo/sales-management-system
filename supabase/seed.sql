-- supabase/seed.sql — stable seed data for local dev / tests.
--
-- The local smoke test (src/tests/supabase-smoke.test.ts) signs up a throwaway
-- Sales user via the app's real signup path and cleans it up afterward, so no
-- fixed fixture rows are needed here. Keep this file (config.toml references
-- ./seed.sql) as an explicit no-op so `npx supabase db reset` has a seed step.

SELECT 1;
