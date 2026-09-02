# SMS - Sales Management System

ระบบจัดการฝ่ายขายและลูกค้า สำหรับธุรกิจขนาดกลางและขนาดย่อม

<img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" />
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white" />
<img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" />
<img alt="Supabase" src="https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?style=flat-square&logo=supabase&logoColor=white" />
<img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" />

---

## ฟีเจอร์หลัก

- **Dashboard** — แดชบอร์ดสรุปข้อมูลด้วยกราฟ (Recharts) แยกตามบทบาท Admin / Sales
- **Sales Management** — จัดการข้อมูลฝ่ายขาย (CRUD + Soft Delete)
- **Customer Management** — จัดการข้อมูลลูกค้า พร้อมมอบหมายให้ฝ่ายขาย
- **Project Management** — จัดการโครงการ พร้อมติดตามงบประมาณและสถานะ
- **Role-Based Access Control** — สองบทบาท: Admin และ Sales พร้อม Row Level Security
- **สิทธิ์การเข้าถึงลูกค้า** — Sales จัดการได้เฉพาะลูกค้าของตัวเอง (เพิ่ม/แก้ไข/ลบ)
- **Auto Logout** — ออกจากระบบอัตโนมัติเมื่อไม่มีการใช้งานเป็นเวลา 10 นาที
- **Thai / English** — รองรับสองภาษา (i18next)
- **Responsive Design** — ใช้งานได้ทั้ง Desktop, Laptop, Tablet, iPad, Mobile
- **Code Splitting** — โหลดหน้าแบบ Lazy Load เพื่อประสิทธิภาพสูงสุด

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
| Backend | Supabase (PostgreSQL, Auth, RLS) |

---

## โครงสร้างโปรเจค

```
sms/
├── supabase/
│   ├── schema.sql              # โครงสร้างฐานข้อมูล + RLS Policies + Triggers
│   ├── fix-signup-v4.sql       # แก้ไขปัญหา signup trigger (รันหลัง schema.sql)
│   ├── fix-confirm-email.sql   # แก้ไขการยืนยันอีเมล
│   ├── fix-admin-role.sql      # แก้ไขบทบาท admin
│   ├── fix-sales-rls.sql       # แก้ไข RLS สำหรับฝ่ายขาย
│   └── fix-signup-v*.sql       # เวอร์ชันก่อนหน้าของ fix signup
├── public/
│   └── favicon.svg             # Favicon
├── src/
│   ├── main.tsx                # Entry point
│   ├── App.tsx                 # Routes + Code Splitting (React.lazy)
│   ├── index.css               # Tailwind CSS
│   │
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client configuration
│   │   ├── i18n.ts             # i18next setup (Thai/English)
│   │   └── utils.ts            # Utility functions (formatCurrency, formatDate)
│   │
│   ├── types/
│   │   └── index.ts            # TypeScript interfaces
│   │
│   ├── contexts/
│   │   └── AuthContext.tsx      # Authentication state + role management + auto-logout
│   │
│   ├── services/
│   │   ├── sales.service.ts    # Sales CRUD operations
│   │   ├── customer.service.ts # Customer CRUD operations
│   │   └── project.service.ts  # Project CRUD operations
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Layout.tsx      # Main layout (sidebar + content area)
│   │   │   ├── Sidebar.tsx     # Navigation sidebar
│   │   │   └── Navbar.tsx      # Top navigation bar
│   │   ├── ui/
│   │   │   ├── Button.tsx      # Button component (primary/secondary/danger/ghost)
│   │   │   ├── Card.tsx        # Card + CardStat components
│   │   │   ├── Modal.tsx       # Modal dialog
│   │   │   ├── StatusBadge.tsx # Status badge (active/inactive/planning/etc.)
│   │   │   ├── SearchInput.tsx # Search input with icon
│   │   │   ├── Select.tsx      # Dropdown select
│   │   │   ├── TextInput.tsx   # Text input with label + error
│   │   │   ├── Textarea.tsx    # Textarea with label + error
│   │   │   ├── EmptyState.tsx  # Empty state placeholder
│   │   │   └── LoadingSpinner.tsx # Loading spinner + Full page loader
│   │   ├── ProtectedRoute.tsx  # Route guard (auth + role check)
│   │   └── ErrorBoundary.tsx   # Error boundary fallback UI
│   │
│   ├── locales/
│   │   ├── en/translation.json # English translations
│   │   └── th/translation.json # Thai translations
│   │
│   └── pages/
│       ├── login/
│       │   └── LoginPage.tsx
│       ├── dashboard/
│       │   └── DashboardPage.tsx
│       ├── sales/
│       │   ├── SalesListPage.tsx
│       │   └── SalesDetailPage.tsx
│       ├── customers/
│       │   ├── CustomerListPage.tsx      # 列表 + สิทธิ์จัดการตามบทบาท
│       │   ├── CustomerDetailPage.tsx
│       │   └── CustomerFormModal.tsx     # ฟอร์ม + auto-assign sales_id
│       ├── projects/
│       │   ├── ProjectListPage.tsx
│       │   ├── ProjectDetailPage.tsx
│       │   └── ProjectFormModal.tsx
│       ├── profile/
│       │   └── ProfilePage.tsx
│       └── admin/
│           ├── sales/AdminSalesPage.tsx       # จัดการฝ่ายขาย + สร้างผู้ใช้
│           ├── customers/AdminCustomerPage.tsx # จัดการลูกค้า (admin view)
│           └── projects/AdminProjectPage.tsx   # จัดการโครงการ (admin view)
│
├── .env.example                # Environment variables template
├── vercel.json                 # Vercel SPA routing config
├── vite.config.ts              # Vite config + Tailwind plugin + Code splitting
├── tsconfig.json
└── package.json
```

---

## Routes

| Path | หน้า | สิทธิ์เข้าถึง |
|------|------|--------|
| `/login` | เข้าสู่ระบบ | Public |
| `/dashboard` | แดชบอร์ด | ทุกคน |
| `/sales` | รายการฝ่ายขาย | ทุกคน |
| `/sales/:id` | รายละเอียดฝ่ายขาย | ทุกคน |
| `/customers` | รายการลูกค้า | ทุกคน |
| `/customers/:id` | รายละเอียดลูกค้า | ทุกคน |
| `/projects` | รายการโครงการ | ทุกคน |
| `/projects/:id` | รายละเอียดโครงการ | ทุกคน |
| `/profile` | โปรไฟล์ของฉัน | ทุกคน |
| `/admin/sales` | จัดการฝ่ายขาย | Admin |
| `/admin/customers` | จัดการลูกค้า | Admin |
| `/admin/projects` | จัดการโครงการ | Admin |

---

## สิทธิ์การใช้งาน (Permissions)

### Admin
- จัดการฝ่ายขาย (เพิ่ม/แก้ไข/ลบ/รีเซ็ตรหัสผ่าน)
- จัดการลูกค้าทั้งหมด (เพิ่ม/แก้ไข/ลบ + กำหนดเจ้าของลูกค้า)
- จัดการโครงการทั้งหมด (เพิ่ม/แก้ไข/ลบ)
- ดูแดชบอร์ดสรุปข้อมูลทั้งระบบ

### Sales
- ดูลูกค้าทั้งหมด (read-only)
- **เพิ่มลูกค้าใหม่** — กำหนดให้เป็นลูกค้าของตัวเองโดยอัตโนมัติ
- **แก้ไข/ลบลูกค้า** — ทำได้เฉพาะลูกค้าของตัวเองเท่านั้น
- จัดการโครงการภายใต้ลูกค้าของตัวเอง
- ดูแดชบอร์ดสรุปข้อมูลของตัวเอง

---

## กฎธุรกิจ (Business Rules)

| # | กฎ |
|---|------|
| 1 | Sales หนึ่งคน มีลูกค้าได้หลายคน |
| 2 | ลูกค้าหนึ่งคน อยู่กับ Sales ได้คนเดียว |
| 3 | ลูกค้าหนึ่งคน มีโครงการได้หลายโครงการ |
| 4 | แต่ละโครงการมีงบประมาณของตัวเอง |
| 5 | Sales สร้าง/แก้ไข/ลบ ได้เฉพาะลูกค้าของตัวเอง |
| 6 | Sales สร้าง/แก้ไข/ลบ โครงการได้เฉพาะในลูกค้าของตัวเอง |
| 7 | Admin เท่านั้นที่จัดการ Sales ได้ |
| 8 | Admin เท่านั้นที่กำหนดเจ้าของลูกค้า (Sales Owner) |
| 9 | ลบข้อมูลแบบ Soft Delete ไม่ลบจริง |
| 10 | ใช้ UUID เป็น Primary Key ทั้งหมด |
| 11 | ออกจากระบบอัตโนมัติเมื่อไม่มีการใช้งาน 10 นาที |

---

## โครงสร้างฐานข้อมูล

```
auth.users (Supabase)
    │
    ├── profiles (id, full_name, avatar_url)
    │       │
    │       └── sales (id, user_id → profiles.id, sales_code, full_name, ...)
    │               │
    │               └── customers (id, sales_id → sales.id, customer_code, ...)
    │                       │
    │                       └── projects (id, customer_id → customers.id, project_code, ...)
```

RLS Policies บังคับใช้:
- **Admin** มีสิทธิ์เข้าถึงทุกตารางแบบเต็ม
- **Sales** อ่านข้อมูลได้ทั้งหมด แต่เขียนได้เฉพาะลูกค้าและโครงการของตัวเอง
- **Auto-logout** เมื่อไม่มี activity เป็นเวลา 10 นาที (ติดตาม mouse, keyboard, scroll, touch)

---

## เริ่มต้นใช้งาน (Getting Started)

### ข้อกำหนด

- Node.js 18+
- npm หรือ yarn หรือ pnpm
- Supabase project (ใช้ free tier ได้)

### 1. Clone โปรเจค

```bash
git clone https://github.com/your-username/sms.git
cd sms
```

### 2. ติดตั้ง dependencies

```bash
npm install
```

### 3. ตั้งค่า Environment Variables

```bash
cp .env.example .env
```

แก้ไข `.env` และใส่ Supabase credentials:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key...
```

> หาได้จาก Supabase Dashboard → Settings → API

### 4. ตั้งค่าฐานข้อมูล

1. เปิด Supabase Dashboard → **SQL Editor**
2. คัดลอกเนื้อหาจาก `supabase/schema.sql`
3. วางและกด **Run**

จากนั้นรัน fix scripts (ตามลำดับ):
```bash
# รันใน Supabase SQL Editor
# 1. schema.sql (หลัก)
# 2. fix-signup-v4.sql (แก้ไข signup trigger)
```

สิ่งที่สร้างขึ้น:
- 4 ตาราง (profiles, sales, customers, projects)
- Indexes สำหรับประสิทธิภาพ
- Row Level Security policies
- Trigger สำหรับสร้าง profile อัตโนมัติเมื่อสมัครสมาชิก
- Trigger สำหรับ sync อีเมลและชื่อระหว่าง sales ↔ auth.users

### 5. สร้าง Admin User คนแรก

1. Supabase Dashboard → **Authentication → Users → Add user**
2. ใส่อีเมลและรหัสผ่าน
3. หลังสร้างเสร็จ คลิกที่ผู้ใช้
4. เพิ่มใน **User Metadata**:
   ```json
   {
     "role": "admin",
     "full_name": "Admin User"
   }
   ```

> **สำคัญ:** ถ้าไม่ใส่ `"role": "admin"` ใน user metadata ผู้ใช้จะถูกมองเป็น Sales โดยอัตโนมัติ

### 6. เริ่ม Development Server

```bash
npm run dev
```

เปิด [http://localhost:5173](http://localhost:5173) และเข้าสู่ระบบ

---

## การ Deploy

### Vercel (แนะนำ)

1. Push โค้ดไปที่ GitHub
2. ไปที่ [vercel.com](https://vercel.com) → **New Project** → Import repo ของคุณ
3. เพิ่ม Environment Variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy

Vercel จะตรวจจับ Vite โดยอัตโนมัติ `vercel.json` จัดการ SPA routing ให้แล้ว

### Netlify

1. Build command: `npm run build`
2. Publish directory: `dist`
3. เพิ่ม Environment Variables

---

## คำสั่งที่ใช้ได้

| คำสั่ง | คำอธิบาย |
|---------|------------|
| `npm run dev` | เริ่ม development server |
| `npm run build` | สร้างไฟล์ production |
| `npm run preview` | ดูตัวอย่าง production build |
| `npm run lint` | รัน linter (oxlint) |

---

## ความปลอดภัย

- **Row Level Security (RLS)** — บังคับใช้ที่ระดับฐานข้อมูล ไม่ใช่แค่ frontend
- **UUID Primary Keys** — ไม่เปิดเผย internal IDs ใน URL หรือใช้สำหรับ auth
- **Soft Delete** — ข้อมูลไม่ถูกลบจริง สามารถกู้คืนได้
- **รหัสผ่านไม่แสดง** — ไม่แสดงรหัสผ่านแบบ plain text
- **Supabase Anon Key เท่านั้น** — ไม่ใช้ service role key ใน frontend
- **Auto Logout** — ออกจากระบบอัตโนมัติหลังไม่มีการใช้งาน 10 นาที

---

## License

MIT
