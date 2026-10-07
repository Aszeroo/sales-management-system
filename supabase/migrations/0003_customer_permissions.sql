-- =================================
-- 0003_customer_permissions.sql — Customer permissions end-to-end per the
-- Permission Matrix (issue #4, ADR-0001):
--
--   | operation              | admin | manager        | sales               |
--   |------------------------|-------|----------------|---------------------|
--   | read (non-deleted)     | yes   | yes            | yes                 |
--   | create                 | any   | any            | own (auto-owner)    |
--   | update                 | any   | any            | own only            |
--   | soft delete            | any   | NOT allowed    | own only            |
--   | change Sales Owner     | yes   | read-only      | read-only           |
--
--   1. Manager gains write rights on customers (insert/update). Deletion
--      stays impossible: there is deliberately NO manager DELETE policy, and
--      the soft-delete RPC below rejects the manager outright.
--   2. DB-level auto-assign: a BEFORE INSERT trigger defaults the Sales
--      Owner column (sales_id, per 0001 naming) to current_sales_id() when
--      the payload omits it — a sales user who creates a customer becomes
--      its Sales Owner automatically, even via a direct API call.
--   3. Owner changes are Admin-only, enforced in RLS: the manager UPDATE
--      policy's WITH CHECK pins sales_id to its pre-update value through the
--      SECURITY DEFINER helper customer_sales_owner_id() (a WITH CHECK
--      expression only sees the proposed NEW row, so the old value must be
--      read through a helper). For sales the existing ownership predicate
--      already pins the column: sales_id = current_sales_id() must hold for
--      the new row too (USING is reused as WITH CHECK when omitted).
--   4. Read behavior is untouched: every role keeps reading every
--      non-deleted customer (0002 policies); admin keeps its FOR ALL.
--   5. Soft delete gets a SECURITY DEFINER RPC (soft_delete_customer):
--      PostgreSQL applies the SELECT policies to the NEW row of every UPDATE
--      that requires SELECT rights (any column referenced in the statement —
--      always the case for PostgREST), so an UPDATE setting deleted_at makes
--      the row invisible and is rejected ("new row violates row-level
--      security policy"). Soft delete therefore cannot be a plain UPDATE; a
--      latent bug in the baseline that the matrix exposes. The RPC enforces
--      the delete column of the matrix itself: admin any row, sales own rows
--      (via current_sales_id()), manager never.
--
-- Append-only migration: later tickets extend this; 0001/0002 are not
-- rewritten (squash happens in ticket #9).
-- =================================

-- =================================
-- 1. DB-level Sales Owner auto-assign on INSERT
-- =================================
-- BEFORE ROW triggers run before the RLS WITH CHECK check (PostgreSQL docs),
-- so a NULL sales_id supplied by an owner-capable user (sales or manager) is
-- stamped with their own sales row before the policies validate it. A
-- non-owner-capable caller (admin/service_role) must supply the owner
-- explicitly — the NOT NULL constraint backstops everything else.
CREATE OR REPLACE FUNCTION set_default_customer_owner()
RETURNS TRIGGER AS $$
DECLARE
  v_owner UUID := current_sales_id();
BEGIN
  IF NEW.sales_id IS NULL AND v_owner IS NOT NULL THEN
    NEW.sales_id := v_owner;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS set_default_customer_owner_on_insert ON customers;
CREATE TRIGGER set_default_customer_owner_on_insert
  BEFORE INSERT ON customers
  FOR EACH ROW EXECUTE FUNCTION set_default_customer_owner();

-- =================================
-- 2. Helper: the stored (pre-update) Sales Owner of a customer row
-- =================================
-- Lets an UPDATE policy's WITH CHECK pin sales_id to its old value: WITH
-- CHECK only sees the proposed NEW row, so the pre-update value is read
-- through this SECURITY DEFINER function (definer privileges bypass RLS,
-- which also avoids the same-table policy recursion).
CREATE OR REPLACE FUNCTION customer_sales_owner_id(p_customer_id UUID)
RETURNS UUID AS $$
  SELECT sales_id FROM customers WHERE id = p_customer_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

-- =================================
-- 3. Manager write policies on customers (new in this ticket)
-- =================================
-- INSERT: manager can create any customer. The Sales Owner must exist: an
-- explicit sales_id is allowed (creating on behalf of a salesperson), and an
-- omitted one is stamped with the manager's own sales row by the trigger
-- above (manager is owner-capable, ADR-0001).
DROP POLICY IF EXISTS "Manager can insert customers" ON customers;
CREATE POLICY "Manager can insert customers" ON customers
  FOR INSERT WITH CHECK (
    get_user_role() = 'manager' AND sales_id IS NOT NULL
  );

-- UPDATE: manager can update any live customer, but
--   - deleted_at must stay NULL -> a soft delete (UPDATE setting the
--     timestamp) violates the policy and is rejected outright;
--   - sales_id must equal its pre-update value -> the Sales Owner column is
--     read-only for the manager even on a direct API call (Admin-only
--     ownership changes, ADR-0001).
DROP POLICY IF EXISTS "Manager can update customers" ON customers;
CREATE POLICY "Manager can update customers" ON customers
  FOR UPDATE
  USING (
    get_user_role() = 'manager' AND deleted_at IS NULL
  )
  WITH CHECK (
    get_user_role() = 'manager' AND
    deleted_at IS NULL AND
    sales_id = customer_sales_owner_id(id)
  );

-- DELETE: intentionally NO manager policy. Without a matching policy every
-- DELETE is rejected for the manager (Permission Matrix: Manager cannot
-- delete). See section 4 for the soft-delete RPC.

-- =================================
-- 4. Soft-delete RPC — the app's delete operation
-- =================================
-- "Delete" means soft delete with a timestamp (CONTEXT.md). A plain UPDATE
-- cannot perform it: PostgreSQL re-applies the SELECT policies to the NEW
-- row of every UPDATE requiring SELECT rights (rewrites any column — i.e.
-- every PostgREST UPDATE), so a row that just became soft-deleted fails its
-- own read policy. This SECURITY DEFINER RPC performs the timestamped
-- update with definer rights and enforces the delete column of the matrix
-- itself (ADR-0001 vocabulary: ownership via current_sales_id()):
--   admin   -> any customer
--   sales   -> own customers only
--   manager -> never (explicitly rejected, even own rows)
-- An unknown id is a silent no-op (parity with the previous behavior).
CREATE OR REPLACE FUNCTION soft_delete_customer(p_customer_id UUID)
RETURNS VOID AS $$
DECLARE
  v_role TEXT := get_user_role();
  v_owner UUID;
BEGIN
  SELECT sales_id INTO v_owner FROM customers WHERE id = p_customer_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_role = 'admin'
     OR (v_role = 'sales' AND v_owner = current_sales_id()) THEN
    UPDATE customers
       SET deleted_at = NOW(),
           status = 'inactive'
     WHERE id = p_customer_id;
    RETURN;
  END IF;

  RAISE EXCEPTION 'Permission denied: cannot delete this customer'
    USING ERRCODE = '42501';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION soft_delete_customer(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION soft_delete_customer(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION soft_delete_customer(UUID) TO authenticated, service_role;

-- =================================
-- 5. Unchanged policies (kept by 0002, restated here as the matrix contract)
-- =================================
--   - "Admin full access on customers"  (0001, FOR ALL) — admin keeps full
--     control incl. reassigning the Sales Owner.
--   - "Sales can view all customers"    (0002, IN ('sales','manager')) —
--     every role reads every non-deleted customer.
--   - "Sales can insert own customers"  (0002, sales_id =
--     current_sales_id()) — with the trigger above this is also the
--     auto-assign path; a sales user trying to assign someone else is still
--     rejected by the WITH CHECK.
--   - "Sales can update own customers"  (0002, USING reused as WITH CHECK) —
--     sales can update/soft-delete own rows and cannot reassign the owner
--     (the new row must still satisfy sales_id = current_sales_id()).
--   - "Sales can delete own customers"  (0002, hard DELETE, own rows only).
