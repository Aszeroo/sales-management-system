# SMS - Sales Management System

ระบบจัดการฝ่ายขายและลูกค้า สำหรับธุรกิจขนาดกลางและขนาดย่อม — Sales ดูแลลูกค้าของตนเอง และแต่ละลูกค้ามีโครงการภายใต้ตัวเอง ภายใต้โมเดลสิทธิ์ 3 บทบาท (Admin / Manager / Sales)

<img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" />
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white" />
<img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" />
<img alt="Supabase" src="https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?style=flat-square&logo=supabase&logoColor=white" />
<img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" />

---

## ฟีเจอร์หลัก

- **Dashboard แยกตามบทบาท** — Sales เห็นเฉพาะตัวเลขของตน (ลูกค้า/โครงการ/งบประมาณของตน); Manager และ Admin เห็นทั้งระบบ (Recharts)
- **Customer Management** — จัดการลูกค้าพร้อมมอบหมาย Sales Owner; ทุก Customer มีเจ้าของเสมอ
- **Project Management** — โครงการภายใต้ลูกค้า พร้อมงบประมาณและสถานะ
- **User Management (Admin)** — สร้างบัญชีทุกบทบาท, เปลี่ยนบทบาท, รีเซ็ตรหัสผ่าน, ปิด/เปิดบัญชี (ban จริง — บัญชีที่ถูกปิดล็อกอินไม่ได้) ผ่านหน้า "ผู้ใช้" หน้าเดียว
- **Owner-reassignment guard** — ปิดบัญชีหรือเลื่อนบทบาทคนที่ยังดูแลลูกค้าอยู่ถูกบล็อกพร้อมแจ้งจำนวนลูกค้า; UI เตือนล่วงหน้าก่อนกด
- **Soft Delete** — ทุกการลบเป็นการ mark วันเวลา (`deleted_at`) ไม่ลบข้อมูลจริง
- **Auto Logout** — ออกจากระบบอัตโนมัติเมื่อไม่มีการใช้งาน 10 นาที (mouse, keyboard, scroll, touch)
- **Thai / English** — รองรับสองภาษา (i18next) สลับได้จาก Sidebar/หน้าล็อกอิน
- **Responsive Design** — Desktop, Laptop, Tablet, Mobile (sidebar แบบ hamburger บนจอเล็ก)
- **Code Splitting** — โหลดหน้าแบบ Lazy Load + vendor/charts/ui chunks

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript 6, Vite 8 |
| Styling | Tailwind CSS 4 |
| Routing | React Router DOM 7 |
| Forms | React Hook Form + Zod |
| Charts | Recharts 3 |
| Notifications | SweetAlert2 |
| Icons | Lucide React |
| i18n | i18next + react-i18next |
| Backend | Supabase (PostgreSQL 17, Auth, RLS) |
| Testing | Vitest 5 (ต่อฐานข้อมูล Supabase จริง) |
| Lint | oxlint |

---

## Permission Matrix

บังคับสองชั้นเสมอ: **ที่ฐานข้อมูล** (RLS policies + SECURITY DEFINER RPC — ลบ/ไฟล์ใน `supabase/migrations/0001_init.sql`) และ **ที่ UI** (ซ่อน/แสดงปุ่มและฟอร์มตามบทบาท) การเรียก API ตรง ๆ ข้าม UI ก็ยังโดน RLS บังคับเหมือนเดิม

| การกระทำ | Admin | Manager | Sales |
|---|---|---|---|
| อ่าน Customer / Project (แถวที่ยังไม่ลบ) | ทั้งหมด | ทั้งหมด | ทั้งหมด |
| สร้าง Customer | ได้ทุกรายการ + กำหนด Sales Owner เอง | ได้ทุกรายการ (เลือก owner หรือ auto ตัวเอง) | ได้ — auto เป็น owner ของตัวเอง |
| แก้ไข Customer | ทั้งหมด | ทั้งหมด (แก้ Sales Owner ไม่ได้) | เฉพาะลูกค้าของตน |
| ลบ Customer (soft delete) | ทั้งหมด | **ไม่ได้** | เฉพาะลูกค้าของตน |
| สร้าง Project | ใต้ Customer ใดก็ได้ | ใต้ Customer ใดก็ได้ | เฉพาะใต้ Customer ของตน (ฟอร์มกรองตัวเลือกลูกค้า) |
| แก้ไข Project | ทั้งหมด | ทั้งหมด | เฉพาะใต้ Customer ของตน |
| ลบ Project (soft delete) | ทั้งหมด | **ไม่ได้** | เฉพาะใต้ Customer ของตน |
| กำหนด/ย้าย Sales Owner | ได้ | อ่านอย่างเดียว (ฟอร์ม read-only) | อ่านอย่างเดียว (ฟอร์ม read-only) |
| จัดการบัญชีผู้ใช้ (สร้าง / เปลี่ยนบทบาท / รีเซ็ตรหัสผ่าน / ปิด-เปิดบัญชี) | ได้ (หน้า `/admin/users`) | ไม่ได้ | ไม่ได้ |
| Dashboard | ทั้งระบบ | ทั้งระบบ | เฉพาะของตน |

กติกาที่คาดไม่ได้เลย:

- **ทุก Customer ต้องมี Sales Owner เสมอ** — ปิดบัญชีหรือเลื่อนบทบาทเป็น Admin ของคนที่ยังมีลูกค้าต้องถูกบล็อกพร้อมจำนวน (ต้องย้ายเจ้าของก่อน); หน้า "ผู้ใช้" เรียก `admin_pending_reassignment_count` เตือนล่วงหน้าก่อนกด
- **Owner-capable = Sales + Manager** — ทั้งสองบทบาทมีแถวในตาราง `sales` โดยอัตโนมัติตั้งแต่สมัคร (มีแถว = เป็นเจ้าของลูกค้าได้); **Admin ไม่มีแถว sales และเป็นเจ้าของลูกค้าไม่ได้ตลอดไป**
- **การจัดการบัญชีผู้ใช้เป็น RPC** — `admin_create_user`, `admin_change_role`, `admin_reset_password`, `admin_set_user_active`, `admin_list_users`, `admin_pending_reassignment_count` (ตรวจสิทธิ์ Admin ทุกตัว)
- **Ban = ห้ามล็อกอินจริง** — ปิดบัญชีตั้ง `banned_until` ไกลอนาคตใน `auth.users` GoTrue ปฏิเสธทุกการล็อกอินจนกว่าจะเปิดกลับ
- **การลบทั้งหมดเป็น soft delete** ผ่าน RPC `soft_delete_customer` / `soft_delete_project` เท่านั้น — ที่ฐานข้อมูลไม่มี RLS policy FOR DELETE บน customers/projects เหลืออยู่เลยสำหรับทุกบทบาท (รวม Admin) การเรียก hard DELETE ตรง ๆ จึงไม่กระทบแถวใดเลย

---

## เริ่มต้นใช้งาน (Getting Started)

### ข้อกำหนด

- Node.js 20.19+ หรือ 22.12+ (ทดสอบบน 22)
- npm
- Docker (รัน Supabase local stack)
- Supabase CLI — มีใน `devDependencies` แล้ว เรียกผ่าน `npx supabase` ได้เลย ไม่ต้องติดตั้งแยก

### 1. Clone และติดตั้ง

```bash
git clone https://github.com/your-username/sms.git
cd sms
npm install
```

### 2. เริ่ม Supabase local stack

```bash
npx supabase start       # รัน Postgres + Auth + REST API + Studio ในเครื่อง
```

### 3. สร้างฐานข้อมูลจาก migrations

```bash
npx supabase db reset    # rebuild ล้างใหม่จาก supabase/migrations + seed ได้ทุกเมื่อ
```

`supabase/migrations/0001_init.sql` เป็นไฟล์เดียวที่สร้างทั้งระบบ (สคีมา + RLS + RPC) — `db reset` คือวิธีมาตรฐานในการได้ DB ใหม่สะอาด ๆ ทุกครั้ง

### 4. ตั้งค่า Environment Variables

```bash
npx supabase status      # ดู URL และ keys ของ local stack
cp .env.example .env
```

แก้ไข `.env` (พอร์ตเอาจาก `npx supabase status` ของเครื่องนั้น — repo นี้ตั้ง local stack ไว้ที่พอร์ต 54351/54352):

```
VITE_SUPABASE_URL=http://127.0.0.1:54351
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key...
```

Frontend ใช้แค่ URL + anon key เท่านั้น (ไม่มี service key ใน frontend) ถ้าจะรันชุดทดสอบ ให้เพิ่ม `SUPABASE_SERVICE_KEY` จาก `npx supabase status` ด้วย (ใช้แค่ตอน cleanup ของ test — ดูหัวข้อการทดสอบ) **ห้าม commit `.env`**

### 5. ล็อกอินด้วยบัญชี seed (ครบ 3 บทบาท)

`supabase/seed.sql` รันอัตโนมัติทันทีหลัง migrations ทุกครั้งที่ `npx supabase db reset` — ได้บัญชี login พร้อมใช้ครบทั้ง 3 บทบาททันที (ล็อกอินผ่านแอปได้เลย — email confirm ปิดอยู่ใน local config):

| อีเมล | รหัสผ่าน | บทบาท | แถว sales |
|------|----------|-------|-----------|
| `admin@example.com` | `Seed-Password-123` | `admin` | ไม่มี (ADR-0001 — Admin ไม่เป็นเจ้าของ) |
| `manager@example.com` | `Seed-Password-123` | `manager` | `SEED-MG-001` |
| `sales@example.com` | `Seed-Password-123` | `sales` | `SEED-SL-001` |

แถว sales ของ manager/sales เกิดจาก trigger `on_auth_user_created` ตัวจริง (เดียวกันกับ signup ผ่านแอป) สร้างบัญชีอื่น ๆ ต่อจากหน้า **ผู้ใช้** (`/admin/users`) ได้เลย

> **สำหรับ local dev เท่านั้น** — รหัสผ่าน seed เป็นค่าที่รู้กันทั่วไป อย่านำไปใช้กับบัญชีบน cloud project (บน cloud ต้องสร้าง Admin เองที่ Supabase Studio → Authentication → Users แล้วแก้ User Metadata เป็น `{ "role": "admin", "full_name": "..." }`)

> บัญชีที่ไม่ใส่ `role` จะถูกมองเป็น Sales โดยอัตโนมัติ (ทั้ง DB `get_user_role()` และ frontend `coerceUserRole`) และเฉพาะ `sales`/`manager` เท่านั้นที่ได้แถว sales อัตโนมัติจาก trigger

### 6. เริ่ม Development Server

```bash
npm run dev
```

เปิด [http://localhost:5173](http://localhost:5173) และเข้าสู่ระบบ

---

## Migrations

```
supabase/
├── migrations/
│   └── 0001_init.sql     # ทั้งระบบในไฟล์เดียว: ตาราง + index + trigger
│                         #   + helper functions + RLS policies + RPCs
├── seed.sql              # บัญชี login ครบ 3 บทบาท (admin/manager/sales) สำหรับ local dev
└── config.toml           # ค่าคงที่ของ local stack (พอร์ต, auth, seed path)
```

- **Idempotent** — `CREATE IF NOT EXISTS` / `CREATE OR REPLACE` / `DROP IF EXISTS` ทั้งไฟล์ รันซ้ำได้
- **ต่อยอด**: เพิ่มไฟล์ใหม่ `supabase/migrations/0002_<ชื่อ>.sql` เป็น append-only migration แล้ว `npx supabase db reset` — อย่าแก้ไฟล์เก่าที่เคยถูก apply แล้ว
- ตาราง: `profiles` (1:1 กับ `auth.users`) ← `sales` (แถวเจ้าของ) ← `customers` ← `projects`

---

## โครงสร้างโปรเจค

```
sms/
├── supabase/                     # migrations + seed + config (ดูหัวข้อ Migrations)
├── src/
│   ├── main.tsx                  # Entry point
│   ├── App.tsx                   # Routes + Code Splitting (React.lazy)
│   ├── index.css                 # Tailwind CSS
│   ├── types/index.ts            # UserRole (admin|manager|sales) + entity types
│   ├── lib/
│   │   ├── supabase.ts           # Supabase client
│   │   ├── i18n.ts               # i18next (th/en)
│   │   ├── roles.ts              # coerceUserRole + isAdminRole/isManagerRole/isSalesRole
│   │   ├── permissions.ts        # ตารางสิทธิ์กลาง (can* ต่อบทบาท + dashboardScope + isOwnerCapable)
│   │   ├── status.ts             # คลังสถานะลูกค้า/โครงการ (badge, label, filter)
│   │   ├── audit.ts              # touchUpdatedAt() สำหรับทุก UPDATE
│   │   └── utils.ts              # formatCurrency, formatDate
│   ├── contexts/AuthContext.tsx  # session + role + auto-logout 10 นาที
│   ├── services/                 # ชั้นเรียก Supabase ทั้งหมด
│   │   ├── customer.service.ts   #   customers + soft_delete_customer RPC
│   │   ├── project.service.ts    #   projects + soft_delete_project RPC
│   │   ├── sales.service.ts      #   sales (อ่านอย่างเดียว)
│   │   ├── user.service.ts       #   admin_* RPCs ทั้งหมด
│   │   ├── dashboard.service.ts  #   รวมตัวเลขแยก scope own/org
│   │   ├── table.ts              #   insert/update กลาง + updated_at
│   │   └── enrichment.ts         #   ตัวเลขรวมต่อแถว (จำนวน/งบ)
│   ├── components/
│   │   ├── layout/               # Layout, Sidebar (เมนูตามบทบาท + สลับภาษา), Navbar
│   │   ├── ui/                   # Button, Card, Modal, inputs, badges, ...
│   │   ├── shared/               # แกนกลางหน้าลิสต์/ฟอร์ม/ดีเทล (ใช้ร่วมทุกบทบาท)
│   │   ├── ProtectedRoute.tsx    # Route guard (auth + requiredRole)
│   │   └── ErrorBoundary.tsx
│   ├── locales/                  # en/th translation.json
│   ├── pages/
│   │   ├── login/                # LoginPage (+ สลับภาษา)
│   │   ├── dashboard/            # DashboardPage (own/org ตามบทบาท)
│   │   ├── sales/                # รายการ/รายละเอียดฝ่ายขาย (อ่านอย่างเดียว)
│   │   ├── customers/            # ลิสต์/ดีเทล/ฟอร์มลูกค้า (ปุ่มตามบทบาท)
│   │   ├── projects/             # ลิสต์/ดีเทล/ฟอร์มโครงการ (ฟอร์มกรองลูกค้าของตน)
│   │   ├── profile/              # ProfilePage
│   │   └── admin/
│   │       ├── users/            # AdminUsersPage — จัดการบัญชีทุกบทบาท
│   │       ├── customers/        # มุมมองจัดการลูกค้า (admin)
│   │       └── projects/         # มุมมองจัดการโครงการ (admin)
│   └── tests/                    # Vitest ต่อ Supabase จริง (ดูหัวข้อการทดสอบ)
├── .env.example                  # template ของ VITE_SUPABASE_* + SUPABASE_SERVICE_KEY
├── vercel.json                   # SPA routing config
├── vite.config.ts                # React + Tailwind plugin + manualChunks
└── package.json
```

---

## Routes

| Path | หน้า | สิทธิ์เข้าถึง |
|------|------|--------|
| `/login` | เข้าสู่ระบบ | Public |
| `/dashboard` | แดชบอร์ด (scope ตามบทบาท) | ทุกบทบาท |
| `/sales`, `/sales/:id` | รายการ/รายละเอียดฝ่ายขาย | ทุกบทบาท (อ่านอย่างเดียว) |
| `/customers`, `/customers/:id` | รายการ/รายละเอียดลูกค้า | ทุกบทบาท (แก้ไขตาม matrix) |
| `/projects`, `/projects/:id` | รายการ/รายละเอียดโครงการ | ทุกบทบาท (แก้ไขตาม matrix) |
| `/profile` | โปรไฟล์ของฉัน | ทุกบทบาท |
| `/admin/users` | จัดการบัญชีผู้ใช้ | Admin |
| `/admin/customers` | จัดการลูกค้า | Admin |
| `/admin/projects` | จัดการโครงการ | Admin |

Route guard: `ProtectedRoute` — ไม่ล็อกอิน → `/login`; บทบาทไม่ตรง `requiredRole` → `/dashboard`

---

## สถาปัตยกรรมสำคัญ (Architecture Notes)

- **สิทธิ์บังคับที่ DB ระดับ RLS ก่อนเสมอ** — UI ซ่อนปุ่มเพื่อ UX เท่านั้น แม้ยิง API ตรงก็ติด policy เหมือนกัน (ทุกเซลล์ของ matrix มี test ยืนยัน)
- **SECURITY DEFINER helpers** — `get_user_role()` (จาก JWT metadata), `current_sales_id()` (แถว sales ของผู้ใช้ปัจจุบัน = ตัวตั้งของ ownership), `customer_sales_owner_id()` (ค่า owner เดิมก่อน UPDATE — ใช้ปักหลักว่า Manager เปลี่ยน owner ไม่ได้)
- **Auto sales row trigger** — `handle_new_user` บน `auth.users`: สร้าง profile ให้ทุกคน + แถว sales ให้เฉพาะ `sales`/`manager` (sales_code/username จาก metadata ถ้ามี, generate ถ้าไม่มี)
- **Owner-capable ได้แถว sales เสมอ, Admin ไม่มี** — `admin_change_role` รักษาเงื่อนไขนี้ทั้งเลื่อนขึ้น (soft delete แถว) และลดกลับ (revive แถวเดิมหรือสร้างใหม่)
- **Soft delete ผ่าน RPC เท่านั้น** — UPDATE ปกติที่เซ็ต `deleted_at` จะทำให้แถว fail read policy ของตัวเองกลางทาง `soft_delete_customer`/`soft_delete_project` จึงเป็นทางเดียวที่ลบได้ และเป็นตัวบังคับ "ใครลบอะไรได้" — ที่ฐานข้อมูล เหนือขึ้นไปกว่านั้น บน customers/projects ไม่มี RLS policy FOR DELETE เหลือสำหรับทุกบทบาท (hard DELETE ไม่กระทบแถวใดเลย)
- **การจัดการบัญชีผ่าน RPC (ADR-0001)** — ไม่มีการ hack `signUp` จากหน้าจัดการ และไม่มี service key ใน frontend; ทุก RPC ตรวจบทบาท Admin เป็น statement แรก
- **Auto logout 10 นาที** — จับ `mousedown`/`keydown`/`scroll`/`touchstart` reset ตัวจับเวลา
- **i18n** — `th`/`en` สลับที่ Sidebar (และหน้าล็อกอิน) จำค่าไว้ใน `localStorage`

รายละเอียดโมเดลสิทธิ์และคำตัดสินใจ: [`docs/adr/0001-permission-model.md`](docs/adr/0001-permission-model.md) · ศัพท์ของระบบ: [`CONTEXT.md`](CONTEXT.md) · ตารางตรวจระบบด้วยมือ: [`docs/manual-checklist.md`](docs/manual-checklist.md)

---

## การทดสอบ (Testing)

ชุดทดสอบเป็น integration test จริง — **ไม่มี mock**: สมัครผู้ใช้จริงผ่าน Supabase Auth ของ local stack, ยิงผ่าน RLS จริงด้วย anon key, และ cleanup ด้วย service key ต้องรัน local Supabase ก่อน (ขั้นตอน 2–4 ด้านบน รวมถึง `SUPABASE_SERVICE_KEY` ใน `.env`) — ข้อยกเว้นเดียวคือ `permissions.test.ts`: unit test ล้วนของ helper ตารางสิทธิ์ฝั่ง frontend ไม่แตะ DB

```bash
npm test                  # ทั้งชุด (11 ไฟล์)
npx vitest run src/tests/customer-permissions.test.ts   # เฉพาะไฟล์
```

| ไฟล์ | ครอบคลุม |
|------|----------|
| `supabase-smoke.test.ts` | ล็อกอินด้วยบัญชี seed ครบ 3 บทบาท → แถว sales ตามบทบาท (admin ไม่มี) → สร้าง/อ่าน Customer ผ่าน services layer |
| `three-roles.test.ts` | trigger สร้างแถว sales ตามบทบาท, ล็อกอินทักษะ, helper ownership |
| `rls-regression.test.ts` | พฤติกรรม RLS เดิม (ยุค 2 บทบาท) ยังคงเดิมใต้โมเดล 3 บทบาท |
| `soft-delete-only.test.ts` | ไม่มีบทบาทใด hard DELETE ได้ (direct DELETE = 0 rows) — ลบได้ทางเดียวคือ soft-delete RPC, Admin ลบแบบ soft ได้ทุกแถว |
| `customer-permissions.test.ts` | ทุกเซลล์ matrix ฝั่ง Customer (อ่าน/สร้าง/แก้/ลบ/owner) |
| `customer-owner-capable.test.ts` | payload สร้าง Customer ฝั่ง service (issue #23): owner-capable ไม่มีแถว sales ในมือ = ไม่ส่งฟิลด์ owner (trigger auto-assign), มีแถว = ส่ง owner ของตัวเองชัดเจน |
| `project-permissions.test.ts` | ทุกเซลล์ matrix ฝั่ง Project + การกรองตัวเลือกลูกค้าของฟอร์ม |
| `dashboard-scoping.test.ts` | scope แดชบอร์ด own/org ทั้ง 3 บทบาท |
| `user-management.test.ts` | สร้างบัญชี/ban จริง/owner guard/เปลี่ยนบทบาท/รีเซ็ตรหัสผ่าน/RPC admin-only |
| `role-names-i18n.test.ts` | ชื่อบทบาทครบทั้ง th/en |
| `permissions.test.ts` | unit test ล้วนของ helper ตารางสิทธิ์กลาง (issue #22): แถว matrix ทุกช่อง + isOwnerCapable/losesOwnerCapability + dashboardScope (ไม่แตะ DB) |

`docs/manual-checklist.md` คือเช็คลิสต์ตรวจด้วยมือทั้งระบบ (ทุกเซลล์ของ matrix + พฤติกรรมที่ทดสอบอัตโนมัติไม่ครอบ) พร้อมผลการตรวจล่าสุด

---

## คำสั่งที่ใช้ได้

| คำสั่ง | คำอธิบาย |
|---------|------------|
| `npm run dev` | เริ่ม development server (Vite) |
| `npm run build` | typecheck (`tsc -b`) + สร้างไฟล์ production |
| `npm run preview` | ดูตัวอย่าง production build |
| `npm test` | รันชุดทดสอบ (ต้องมี local Supabase + `.env`) |
| `npm run lint` | รัน oxlint |
| `npx supabase start` | เริ่ม Supabase local stack |
| `npx supabase db reset` | สร้าง DB ใหม่จาก migrations + seed |
| `npx supabase status` | ดู URL/keys ของ local stack |

---

## การ Deploy

### Vercel (แนะนำ)

1. Push โค้ดไปที่ GitHub
2. [vercel.com](https://vercel.com) → **New Project** → Import repo
3. เพิ่ม Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (ชี้ไปที่ Supabase project จริง)
4. Deploy — `vercel.json` จัดการ SPA routing ให้แล้ว

> ฝั่ง production ต้อง apply `supabase/migrations/0001_init.sql` กับ Supabase project จริงด้วย (`supabase db push` หลัง link project)

### Netlify

1. Build command: `npm run build`, Publish directory: `dist`
2. เพิ่ม Environment Variables เดียวกัน

---

## ความปลอดภัย

- **Row Level Security (RLS)** — บังคับที่ระดับฐานข้อมูล ไม่ใช่แค่ frontend
- **Supabase Anon Key เท่านั้นใน frontend** — service key ใช้เฉพาะใน test cleanup และไม่เข้าใกล้ app bundle
- **SECURITY DEFINER RPC** — ทุกตัวตรวจบทบาทเอง และมี `REVOKE`/`GRANT` ชัดเจนต่อฟังก์ชัน
- **รหัสผ่านไม่แสดง** — เก็บ bcrypt hash ฝั่ง DB (`crypt`/`gen_salt`) reset ผ่าน RPC ตรวจสิทธิ์ Admin
- **Soft Delete** — ข้อมูลไม่ถูกลบจริง (`deleted_at` + สถานะเปลี่ยน)
- **Auto Logout** — ออกจากระบบอัตโนมัติหลังไม่มีการใช้งาน 10 นาที

---

## License

MIT
