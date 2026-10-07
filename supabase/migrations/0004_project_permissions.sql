-- =================================
-- 0004_project_permissions.sql — Project permissions end-to-end per the
-- Permission Matrix (issue #5, ADR-0001):
--
--   | operation              | admin | manager        | sales               |
--   |------------------------|-------|----------------|---------------------|
--   | read (non-deleted)     | yes   | yes            | yes                 |
--   | create                 | any   | any            | own customer only   |
--   | update                 | any   | any            | own customer only   |
--   | soft delete            | any   | NOT allowed    | own customer only   |
--
--   Ownership derives through the Customer (ADR-0001): a Project belongs to
--   a Sales user iff its customer's Sales Owner is that user — checked via
--   the SECURITY DEFINER helper current_sales_id() (0002) joined through
--   customer_id, so a direct API call cannot bypass it.
--
--   1. Manager gains write rights on projects (insert/update, any customer).
--      Deletion stays impossible: there is deliberately NO manager DELETE
--      policy, and the manager UPDATE policy's WITH CHECK pins deleted_at to
--      NULL so even a plain UPDATE cannot soft delete — mirroring 0003's
--      manager policies on customers.
--   2. Sales policies from 0002 are kept unchanged (their USING expression
--      doubles as WITH CHECK, so a sales user also cannot move a project to
--      a customer they do not own).
--   3. Read behavior is untouched: every role keeps reading every
--      non-deleted project (0002 policy); admin keeps its FOR ALL.
--   4. Soft delete gets a SECURITY DEFINER RPC (soft_delete_project) — the
--      same latent baseline bug 0003 fixed for customers: PostgreSQL applies
--      the SELECT policies to the NEW row of every UPDATE that touches any
--      column, so a plain UPDATE setting deleted_at makes the row invisible
--      to its own read policy and is rejected ("new row violates row-level
--      security policy"). The RPC performs the timestamped update with
--      definer rights and enforces the delete column of the matrix itself:
--      admin any row, sales own-customer rows (via current_sales_id() joined
--      through customer_id), manager never (explicitly rejected, even own
--      rows). An unknown id is a silent no-op (parity with soft_delete_customer).
--
-- Append-only migration: later tickets extend this; 0001–0003 are not
-- rewritten (squash happens in ticket #9).
-- =================================

-- =================================
-- 1. Manager write policies on projects (new in this ticket)
-- =================================
-- INSERT: manager can create a project under any (live) customer. The
-- subquery is evaluated under the manager's own read policies on customers
-- (0002: every non-deleted customer is visible), so the target must be a
-- live customer row — the FK backstops existence.
DROP POLICY IF EXISTS "Manager can insert projects" ON projects;
CREATE POLICY "Manager can insert projects" ON projects
  FOR INSERT WITH CHECK (
    get_user_role() = 'manager' AND
    customer_id IN (SELECT id FROM customers)
  );

-- UPDATE: manager can update any live project, but
--   - deleted_at must stay NULL -> a soft delete (UPDATE setting the
--     timestamp) violates the policy and is rejected outright (the matrix's
--     "Manager cannot delete", enforced at the DB level, not just the UI).
DROP POLICY IF EXISTS "Manager can update projects" ON projects;
CREATE POLICY "Manager can update projects" ON projects
  FOR UPDATE
  USING (
    get_user_role() = 'manager' AND deleted_at IS NULL
  )
  WITH CHECK (
    get_user_role() = 'manager' AND deleted_at IS NULL
  );

-- DELETE: intentionally NO manager policy. Without a matching policy every
-- DELETE is rejected for the manager (Permission Matrix: Manager cannot
-- delete). The soft-delete RPC below enforces the same rule.

-- =================================
-- 2. Soft-delete RPC — the app's delete operation
-- =================================
-- Same contract as soft_delete_customer (0003), for projects: ownership
-- resolves through the Customer (ADR-0001), so the stored Sales Owner is
-- read via a join through customer_id.
--   admin   -> any project
--   sales   -> projects under own customers only
--   manager -> never (explicitly rejected, even own rows)
CREATE OR REPLACE FUNCTION soft_delete_project(p_project_id UUID)
RETURNS VOID AS $$
DECLARE
  v_role TEXT := get_user_role();
  v_owner UUID;
BEGIN
  SELECT c.sales_id INTO v_owner
    FROM projects p
    JOIN customers c ON c.id = p.customer_id
   WHERE p.id = p_project_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_role = 'admin'
     OR (v_role = 'sales' AND v_owner = current_sales_id()) THEN
    UPDATE projects
       SET deleted_at = NOW(),
           status = 'cancelled'
     WHERE id = p_project_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Permission denied: cannot delete this project'
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION soft_delete_project(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION soft_delete_project(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION soft_delete_project(UUID) TO authenticated, service_role;

-- =================================
-- 3. Unchanged policies (kept by 0001/0002, restated here as the matrix contract)
-- =================================
--   - "Admin full access on projects"  (0001, FOR ALL) — admin keeps full
--     control incl. deleting.
--   - "Sales can view all projects"    (0002, IN ('sales','manager')) —
--     every role reads every non-deleted project.
--   - "Sales can insert own projects"  (0002, customer owned by
--     current_sales_id() and live) — a sales user cannot create a project
--     under another salesperson's customer, even via a direct API call.
--   - "Sales can update own projects"  (0002, USING reused as WITH CHECK) —
--     sales can update projects under own customers only, and cannot move a
--     project to a customer they do not own (the new row must satisfy the
--     same predicate).
--   - "Sales can delete own projects"  (0002, hard DELETE, own-customer
--     rows only).
