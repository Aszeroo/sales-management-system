# เช็คลิสต์ตรวจระบบด้วยมือ (Manual Verification Checklist)

ครอบทุกช่องของ **Permission Matrix** (README) และพฤติกรรมที่คงไว้ทุกข้อ

**วิธีอ่าน**: ทุกข้อมี "วิธีตรวจ" และ "ผลที่บันทึกไว้" พร้อมป้ายวิธีพิสูจน์อย่างตรงไปตรงมา:

- **[test]** — พิสูจน์ด้วยชุดทดสอบอัตโนมัติที่รันจริง (integration test ต่อ Supabase local จริง ยิงผ่าน RLS ด้วย anon key ไม่มี mock)
- **[code]** — ตรวจด้วยการอ่านโค้ดหน้าจอจริง (ระบุไฟล์:บรรทัด) — โครงสร้างถูกต้องแน่นอน แต่การ render จริงบนจอยังควรตามด้วยตาคน
- **[manual: pending]** — ยังไม่ได้ตรวจ ต้องตามด้วยตาคนบนจอจริง

**รอบตรวจล่าสุด: 2026-10-08** — `npx supabase db reset` → `npm test` → **11 ไฟล์ / 103 ผ่านทั้งหมด (0 fail)** → `npm run build` ผ่าน → `npx oxlint` exit 0 ทุกข้อที่ป้าย `[test]` อ้างอิงจากรอบนี้โดยตรง

> วิธีรันรอบใหม่: `npx supabase start` (ถ้ายัง) → `npx supabase db reset` → `npm test` → แล้วไล่ข้อ `[manual: pending]` บนจอจริง (`npm run dev`)

---

## 1. Customer — ทุกช่องของ matrix

| # | ช่อง matrix | วิธีตรวจ | ผล | ป้าย |
|---|---|---|---|---|
| 1.1 | อ่าน: ทุกบทบาทเห็นทุกแถวที่ยังไม่ลบ | test `read: every role reads every non-deleted customer` (`customer-permissions.test.ts`) | ผ่าน (รอบ 2026-10-08) | [test] |
| 1.2 | สร้าง: Admin ได้ทุกรายการ + กำหนด owner เอง | test `create: admin can insert a customer with an explicit owner` | ผ่าน | [test] |
| 1.3 | สร้าง: Manager ได้ทุกรายการ (explicit owner ได้) | test `create: manager can insert any customer (explicit owner allowed)` | ผ่าน | [test] |
| 1.4 | สร้าง: Sales auto เป็น owner ของตัวเอง | test `create: sales insert becomes the Sales Owner automatically` (DB trigger `set_default_customer_owner`) | ผ่าน | [test] |
| 1.5 | สร้าง: Sales ตั้งคนอื่นเป็น owner ไม่ได้ | test `create: sales cannot assign another Sales Owner` | ผ่าน | [test] |
| 1.6 | แก้ไข: Admin ทั้งหมด | โดยอาศัย policy แยก action ของ Admin (SELECT/INSERT/UPDATE — บน customers/projects ไม่มี FOR DELETE policy เหลือสำหรับทุกบทบาท) — test `admin keeps full access on customers` (`rls-regression.test.ts`) + 1.2 | ผ่าน | [test] |
| 1.7 | แก้ไข: Manager ได้ทุกรายการ | test `update: manager can update any customer` | ผ่าน | [test] |
| 1.8 | แก้ไข: Manager เปลี่ยน Sales Owner ไม่ได้ | test `update: manager cannot change the Sales Owner (read-only field)` (RLS pin ผ่าน `customer_sales_owner_id()`) | ผ่าน | [test] |
| 1.9 | แก้ไข: Sales เฉพาะของตน | tests `update: sales can update own customer` + `update: sales cannot update another sales' customer` | ผ่าน | [test] |
| 1.10 | แก้ไข: Sales เปลี่ยน owner ไม่ได้แม้ของตน | test `update: sales cannot change the Sales Owner even on own customer` | ผ่าน | [test] |
| 1.11 | ลบ (soft): Admin ทั้งหมด | test `delete: admin can delete any customer` (RPC `soft_delete_customer`) | ผ่าน | [test] |
| 1.12 | ลบ (soft): Manager ไม่ได้เด็ดขาด | test `delete: manager cannot delete (RLS rejects the soft delete)` | ผ่าน | [test] |
| 1.13 | ลบ (soft): Sales เฉพาะของตน | tests `delete: sales can soft-delete own customer` + `delete: sales cannot delete another sales' customer` | ผ่าน | [test] |
| 1.14 | UI: ปุ่มแก้ไขลูกค้า — admin/manager ทุกแถว, sales เฉพาะแถวของตน | โค้ด: `CustomerListPage.tsx:35-37` (เงื่อนไขแถวละแถว, `useMySalesId`) | โครงสร้างตรง matrix | [code] + visual แนะนำ |
| 1.15 | UI: ปุ่มลบลูกค้า — admin + sales (เฉพาะของตน) เท่านั้น, Manager ไม่มีปุ่ม | โค้ด: `CustomerListPage.tsx:38-40` (ไม่มีเงื่อนไขให้ Manager ได้ปุ่ม) | โครงสร้างตรง matrix | [code] + visual แนะนำ |
| 1.16 | UI: ช่อง Sales Owner — Admin แก้ได้ (Select ทุกแถว sales), Manager/Sales read-only + hint | โค้ด: `CustomerFormModal.tsx:197-219` (Select สำหรับ admin L198-207, disabled TextInput + hint สำหรับ non-admin L210-218, hidden input L219) | โครงสร้างตรง matrix | [code] + visual แนะนำ |
| 1.17 | UI: ฟอร์มสร้างลูกค้า (non-admin) ล็อก owner เป็นตัวเองตั้งแต่เปิดฟอร์ม | โค้ด: `CustomerFormModal.tsx:35-39, 99, 144` (โหลดแถว sales ของตนเป็นค่า default, `displayOwner`) | โครงสร้างตรง matrix | [code] + visual แนะนำ |

## 2. Project — ทุกช่องของ matrix

| # | ช่อง matrix | วิธีตรวจ | ผล | ป้าย |
|---|---|---|---|---|
| 2.1 | อ่าน: ทุกบทบาทเห็นทุกแถวที่ยังไม่ลบ | test `read: every role reads every non-deleted project` (`project-permissions.test.ts`) | ผ่าน | [test] |
| 2.2 | สร้าง: Admin ใต้ Customer ใดก็ได้ | test `create: admin can create under any customer` | ผ่าน | [test] |
| 2.3 | สร้าง: Manager ใต้ Customer ใดก็ได้ | test `create: manager can create under any customer` | ผ่าน | [test] |
| 2.4 | สร้าง: Sales เฉพาะใต้ Customer ของตน | test `create: sales can create under own customer` | ผ่าน | [test] |
| 2.5 | สร้าง: Sales ใต้ Customer คนอื่นไม่ได้ (ยิงตรงก็ติด RLS) | test `create: sales cannot create under another sales' customer via direct API (RLS)` | ผ่าน | [test] |
| 2.6 | แก้ไข: Manager ได้ทุกโครงการ | test `update: manager can update any project` | ผ่าน | [test] |
| 2.7 | "ลบ": Manager soft delete ผ่าน UPDATE ปกติไม่ได้ด้วย | test `update: manager cannot soft delete via a plain UPDATE (no delete right)` (WITH CHECK ปัก `deleted_at IS NULL`) | ผ่าน | [test] |
| 2.8 | แก้ไข: Sales เฉพาะใต้ Customer ของตน | tests `update: sales can update own-customer project` + `update: sales cannot update another sales' project` | ผ่าน | [test] |
| 2.9 | แก้ไข: Sales ย้ายโครงการไป Customer คนอื่นไม่ได้ | test `update: sales cannot move a project to another sales' customer` | ผ่าน | [test] |
| 2.10 | ลบ (soft): Admin ทั้งหมด | test `delete: admin can delete any project` (RPC `soft_delete_project`) | ผ่าน | [test] |
| 2.11 | ลบ (soft): Manager ไม่ได้เด็ดขาด | test `delete: manager cannot delete (RPC rejects)` | ผ่าน | [test] |
| 2.12 | ลบ (soft): Sales เฉพาะใต้ Customer ของตน | tests `delete: sales can soft-delete own-customer project` + `delete: sales cannot delete another sales' project` | ผ่าน | [test] |
| 2.13 | UI: ฟอร์มโครงการของ Sales กรองตัวเลือกลูกค้าเหลือเฉพาะของตน | test `form scoping: sales option list contains only own customers` + โค้ด `customer.service.ts:93-105` (กรองที่ query layer ตามบทบาทจาก session) | ผ่าน | [test] |
| 2.14 | UI: ปุ่มแก้ไขโครงการ — admin/manager ทุกแถว, sales เฉพาะแถวของตน | โค้ด: `ProjectListPage.tsx:35,40` (`isOwnCustomer` → `canEditProjects`) | โครงสร้างตรง matrix | [code] + visual แนะนำ |
| 2.15 | UI: ปุ่มลบโครงการ — admin + sales (เฉพาะของตน) เท่านั้น, Manager ไม่มีปุ่ม | โค้ด: `ProjectListPage.tsx:23,41` (comment "manager NEVER", `canDeleteProjects`) | โครงสร้างตรง matrix | [code] + visual แนะนำ |

## 3. Sales Owner assignment — กำหนด/ย้าย

| # | ช่อง matrix | วิธีตรวจ | ผล | ป้าย |
|---|---|---|---|---|
| 3.1 | Admin เท่านั้นที่ย้าย owner ได้ (ตาราง) | tests 1.2 / 1.8 / 1.10 (Admin ย้ายได้, Manager/Sales ถูก RLS ปัก) | ผ่าน | [test] |
| 3.2 | Manager/Sales เห็น owner แบบ read-only ในฟอร์ม | โค้ด: `CustomerFormModal.tsx:197-219` (ดู 1.16) | โครงสร้างตรง matrix | [code] + visual แนะนำ |

## 4. User Management — Admin เท่านั้น

| # | ช่อง matrix | วิธีตรวจ | ผล | ป้าย |
|---|---|---|---|---|
| 4.1 | สร้างบัญชีได้ทุกบทบาท (RPC `admin_create_user`) | tests `sales user → ...`, `manager user → ...`, `admin user → NO sales row` + `the created users all appear in the unified list` (`user-management.test.ts`) | ผ่าน | [test] |
| 4.2 | เปลี่ยนบทบาทได้ (RPC `admin_change_role`) | tests `Sales <-> Manager changes work...` + `promotion to admin and demotion back keep the sales-row invariant` | ผ่าน | [test] |
| 4.3 | รีเซ็ตรหัสผ่านได้จริง (RPC `admin_reset_password`) | test `after a reset the old password fails and the new one works` | ผ่าน | [test] |
| 4.4 | ปิดบัญชี = **ban จริง** ห้ามล็อกอิน / เปิดกลับได้ | test `deactivated user cannot sign in; reactivated user can again` (`admin_set_user_active` → `banned_until`) | ผ่าน | [test] |
| 4.5 | Owner guard: ปิดบัญชีคนที่ยังมีลูกค้า = ถูกบล็อกพร้อมจำนวน | test `deactivating a user who owns customers is rejected with the count` | ผ่าน | [test] |
| 4.6 | Owner guard: เลื่อนเป็น Admin คนที่ยังมีลูกค้า = ถูกบล็อกพร้อมจำนวน; ย้ายลูกค้าแล้วทำได้ | test `promoting a Sales Owner to admin is rejected with the count; works after reassignment` | ผ่าน | [test] |
| 4.7 | UI เตือนล่วงหน้าด้วย `admin_pending_reassignment_count` ก่อนปิดบัญชี | test `pending reassignment count returns the number of owned customers` + โค้ด `AdminUsersPage.tsx:68-100` (เรียกก่อนพยายาม L73, Swal warning แล้ว abort ถ้า > 0 L77-79) | ผ่าน | [test] |
| 4.8 | UI เตือนล่วงหน้าก่อนเลื่อนเป็น Admin | โค้ด: `AdminUsersPage.tsx:373-380` (เรียก RPC เมื่อ promote เป็น admin, Swal warning ถ้า > 0) | โครงสร้างตรง matrix | [code] + visual แนะนำ |
| 4.9 | ข้อความ owner-guard จาก RPC แสดงพร้อมจำนวนบนหน้าผู้ใช้ | โค้ด: `AdminUsersPage.tsx:39-48` (`describeRpcError` จับ "still owns" + regex จำนวน → `adminUsers.ownerBlocked`) | โครงสร้างตรง matrix | [code] + visual แนะนำ |
| 4.10 | RPC admin ทั้งหมดปฏิเสธ sales/manager/anonymous ชัดเจน | test `every admin RPC rejects sales, manager and anonymous callers with a clear error` | ผ่าน | [test] |
| 4.11 | แถว sales เขียนได้ด้วย Admin เท่านั้น (rule #7) | tests `sales can no longer UPDATE...`, `sales can no longer INSERT...`, `manager cannot write the sales table either` | ผ่าน | [test] |
| 4.12 | UI: หน้า `/admin/users` เข้าได้เฉพาะ Admin (บทบาทอื่นโดน redirect) | โค้ด: `App.tsx:153-164` (`requiredRole="admin"`) + `ProtectedRoute.tsx:25-27` (role ไม่ตรง → `/dashboard`) | โครงสร้างตรง matrix | [code] + visual แนะนำ |
| 4.13 | UI: เมนู Admin Management (ผู้ใช้/ลูกค้า/โครงการ) แสดงเฉพาะ Admin | โค้ด: `Sidebar.tsx:99-124` (`isAdmin && ...`) | โครงสร้างตรง matrix | [code] + visual แนะนำ |

## 5. Dashboard scope

| # | ช่อง matrix | วิธีตรวจ | ผล | ป้าย |
|---|---|---|---|---|
| 5.1 | Sales เห็นเฉพาะของตน (รวมเชิงลบ: ข้อมูลเพื่อนไม่หลุดมา) | test `sales: dashboard aggregates cover only own customers and projects (positive + negative)` (`dashboard-scoping.test.ts`) | ผ่าน | [test] |
| 5.2 | Manager เห็นทั้งระบบ | test `manager: dashboard sees org-wide data (both sales users included)` | ผ่าน | [test] |
| 5.3 | Admin เห็นทั้งระบบ | test `admin: dashboard sees org-wide data (both sales users included)` | ผ่าน | [test] |
| 5.4 | การสร้างข้อมูลเลื่อนตัวเลขทุกบทบาทถูกต้อง | test `creating a customer/project moves every role's dashboard numbers correctly` | ผ่าน | [test] |
| 5.5 | การสร้างของเพื่อนไม่เลื่อนตัวเลขของ Sales | test `a colleague's creation never moves a sales user's own dashboard` | ผ่าน | [test] |
| 5.6 | UI: หัวเรื่อง/ชุดกราฟต่างกันตาม scope (own vs org) | โค้ด: `DashboardPage.tsx:69-79` (branch `scope === 'org'` / `'own'`), `dashboard.service.ts:30-40` | โครงสร้างตรง matrix | [code] + visual แนะนำ |

## 6. พฤติกรรมที่คงไว้ (preserved behaviors)

| # | รายการ | วิธีตรวจ | ผล | ป้าย |
|---|---|---|---|---|
| 6.1 | Soft delete ทั้งหมด (ลูกค้า/โครงการ → `deleted_at`, ไม่ลบจริง) | ทุก test ลบใน 1.11–1.13 / 2.10–2.12 (RPC เซ็ต timestamp) | ผ่าน | [test] |
| 6.2 | แถวที่ลบแล้วหายจากทุกการอ่าน (list/detail/dropdown) | โค้ด: filter `deleted_at IS NULL` ในทุก read — `customer.service.ts:30,43,57,115`, `project.service.ts:25,38,51,88-89,99`, `sales.service.ts:17,31,45,69` | โครงสร้างถูกต้อง | [code] |
| 6.3 | ไม่มี UI กู้คืน/undo หลังลบ (ยืนยันก่อนลบด้วย Swal) | โค้ด: `useCrudList.ts:108-129` (Swal confirm → ลบ → success Swal; ไม่มี undo) | โครงสร้างตรงที่ออกแบบ | [code] + visual แนะนำ |
| 6.4 | พฤติกรรม RLS ยุค 2 บทบาทเดิมยังคงเดิมทั้งหมด | 8 tests ใน `rls-regression.test.ts` (issue #19: เดินผ่าน service layer — sales insert/update/ลบของตน, อ่านทุกแถว, admin เต็ม, sales แทรกโครงการใต้ customer ตน) | ผ่าน | [test] |
| 6.4b | ไม่มีบทบาทใด hard DELETE Customer/Project ได้ (DB-level, issue #19) | tests `soft-delete-only.test.ts` (direct DELETE = 0 rows สำหรับ sales/manager/admin, soft delete RPC ยังหวังผล) + ตรวจ `pg_policies` หลัง `db reset` | ผ่าน | [test] |
| 6.5 | Trigger สมัคร: sales/manager ได้แถว sales อัตโนมัติ (generate code เมื่อไม่ระบุ, คง metadata ที่ระบุแบบ byte-for-byte) | tests `three-roles.test.ts` 4 ข้อแรก | ผ่าน | [test] |
| 6.6 | Admin สมัคร = ไม่มีแถว sales เด็ดขาด | tests `admin signup → no sales row` + helper `returns null for admin` | ผ่าน | [test] |
| 6.7 | ทั้ง 3 บทบาทล็อกอินได้จริง | test `all three roles can log in` | ผ่าน | [test] |
| 6.8 | Ownership ผ่าน helper `current_sales_id()` (admin ได้ null) | tests `helper "current user's sales row"...` + `returns null for admin...` | ผ่าน | [test] |
| 6.9 | Smoke ครบวงจร: ล็อกอินด้วยบัญชี seed Sales → สร้างลูกค้าเป็นเจ้าของ → อ่านกลับได้ → cleanup | test `seed Sales user round-trips a Customer through the services layer` (`supabase-smoke.test.ts`; issue #20 — ใช้บัญชี seed แทนการสมัครใหม่) | ผ่าน | [test] |
| 6.10 | ชื่อบทบาทแสดงทั้งไทย/อังกฤษ (3 บทบาท, คนละคำกัน) | tests `role-names-i18n.test.ts` ทั้ง 3 ข้อ | ผ่าน | [test] |

## 7. UI ทั่วไป — ตรวจด้วยการอ่านโค้ด (ควรตามด้วยตาคน 1 รอบก่อนส่งมอบ)

| # | รายการ | วิธีตรวจ | ผล | ป้าย |
|---|---|---|---|---|
| 7.1 | Auto logout 10 นาทีเมื่อไม่มี activity (mouse/keyboard/scroll/touch reset ตัวจับเวลา) | โค้ด: `AuthContext.tsx:7` (`INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000`) + listener `mousedown/keydown/scroll/touchstart` → `signOut` + ไป `/login` | โครงสร้างถูกต้อง — **ยังไม่ได้รอจริง 10 นาทีบนจอ** | [manual: pending] |
| 7.2 | สลับภาษา th/en ได้จาก Sidebar และหน้าล็อกอิน, จำค่าใน `localStorage` (`language`) | โค้ด: `Sidebar.tsx:29-33, 129-138`, `LoginPage.tsx:49-53, 59-67`, `i18n.ts` (default `en`) | โครงสร้างถูกต้อง — ควรกดดูจริง 1 รอบ | [manual: pending] |
| 7.3 | Responsive: hamburger เมนู + sidebar overlay บนจอเล็ก, grid ยุบเป็นคอลัมน์เดียว | โค้ด: `Layout.tsx:21-32,43-48` (`lg:`), `Navbar.tsx:29-34` (`lg:hidden`), `list.tsx:42,98` (`sm:`/`md:`/`xl:`), `DashboardPage.tsx:108,136,208,235` | โครงสร้างถูกต้อง — ควรย่อหน้าต่างดูจริง 1 รอบ | [manual: pending] |
| 7.4 | SweetAlert flow: ยืนยันก่อนลบ, แจ้งสำเร็จ/ล้มเหลวหลังบันทึกฟอร์ม, คำเตือน owner บนหน้าผู้ใช้ | โค้ด: `useCrudList.ts:108-129`, `formSubmit.ts:40,44`, `AdminUsersPage.tsx:78-98,377-402` | โครงสร้างถูกต้อง — ควรกดผ่านจริง 1 รอบ | [manual: pending] |
| 7.5 | ล็อกอินล้มเหลวแสดง error แบบ inline (รวมบัญชีถูก ban ที่ GoTrue ปฏิเสธ) | โค้ด: `LoginPage.tsx:80-84` (inline error), `AuthContext.tsx:67-85` (แปลง error → i18n key) | โครงสร้างถูกต้อง — ข้อความ ban ควรดูบนจอจริง 1 ครั้ง | [manual: pending] |
| 7.6 | Code splitting: ทุกหน้า lazy load + chunks vendor/charts/ui | โค้ด: `App.tsx` (React.lazy ทุกเพจ) + `vite.config.ts` (manualChunks) + build log (vendor 218 kB / charts 399 kB แยกไฟล์) | ผ่าน (เห็นจาก build จริง) | [code] |

---

## สรุปรอบตรวจ 2026-10-08

| ป้ายวิธีตรวจ | จำนวนข้อ |
|---|---|
| **[test]** — ยืนยันด้วยชุดทดสอบอัตโนมัติ (รันจริง 103/103 ผ่าน) | 50 |
| **[code]** — ยืนยันด้วยการอ่านโค้ดหน้าจอ/บริการ (ระบุไฟล์:บรรทัด) | 15 |
| **[manual: pending]** — ต้องตามด้วยตาคนบนจอจริง | 5 |
| **รวม** | **70** |

ข้อที่ยัง `[manual: pending]` ล้วนเป็นเรื่องประสบการณ์บนจอ (จับเวลา logout จริง, กดสลับภาษา, ย่อหน้าต่าง, ไล่กด dialog, ดูข้อความ ban) — ตรรกะเบื้องหลังทั้งหมดถูกยืนยันด้วย test/code แล้ว
