# SMS - Sales Management System

ระบบจัดการฝ่ายขายและลูกค้า สำหรับธุรกิจขนาดกลางและขนาดย่อม

<img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=white" />
<img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript&logoColor=white" />
<img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" />
<img alt="Supabase" src="https://img.shields.io/badge/Supabase-PostgreSQL-3FCF8E?style=flat-square&logo=supabase&logoColor=white" />
<img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?style=flat-square&logo=vite&logoColor=white" />

---

## Features

- **Dashboard** — แดชบอร์ดสรุปข้อมูลด้วยกราฟ (Recharts) แยกตามบทบาท Admin / Sales
- **Sales Management** — จัดการข้อมูลฝ่ายขาย (CRUD + Soft Delete)
- **Customer Management** — จัดการข้อมูลลูกค้า พร้อมมอบหมายให้ฝ่ายขาย
- **Project Management** — จัดการโครงการ พร้อมติดตามงบประมาณและสถานะ
- **Role-Based Access Control** — สองบทบาท: Admin และ Sales พร้อม Row Level Security
- **Thai / English** — รองรับสองภาษา (i18next)
- **Responsive Design** — ใช้งานได้ทั้ง Desktop, Laptop, Tablet, iPad, Mobile
- **Code Splitting** — โหลดหน้าแบบ Lazy Load เพื่อประสิทธิภาพสูงสุด...

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

## Project Structure

```
sms/
├── supabase/
│   └── schema.sql              # โครงสร้างฐานข้อมูล + RLS Policies + Triggers
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
│   │   └── AuthContext.tsx      # Authentication state & role management
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
│       │   ├── CustomerListPage.tsx
│       │   ├── CustomerDetailPage.tsx
│       │   └── CustomerFormModal.tsx
│       ├── projects/
│       │   ├── ProjectListPage.tsx
│       │   ├── ProjectDetailPage.tsx
│       │   └── ProjectFormModal.tsx
│       ├── profile/
│       │   └── ProfilePage.tsx
│       └── admin/
│           ├── sales/AdminSalesPage.tsx
│           ├── customers/AdminCustomerPage.tsx
│           └── projects/AdminProjectPage.tsx
│
├── .env.example                # Environment variables template
├── vercel.json                 # Vercel SPA routing config
├── vite.config.ts              # Vite config + Tailwind plugin + Code splitting
├── tsconfig.json
└── package.json
```

---

## Routes

| Path | Page | Access |
|------|------|--------|
| `/login` | Login | Public |
| `/dashboard` | Dashboard | All |
| `/sales` | Sales List | All |
| `/sales/:id` | Sales Detail | All |
| `/customers` | Customer List | All |
| `/customers/:id` | Customer Detail | All |
| `/projects` | Project List | All |
| `/projects/:id` | Project Detail | All |
| `/profile` | My Profile | All |
| `/admin/sales` | Sales Management | Admin |
| `/admin/customers` | Customer Management | Admin |
| `/admin/projects` | Project Management | Admin |

---

## Business Rules

| # | Rule |
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

---

## Database Schema

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

RLS Policies enforce that:
- **Admin** has full access to all tables
- **Sales** can read all data but write only their own customers/projects

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn or pnpm
- Supabase project (free tier works)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/sms.git
cd sms
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and add your Supabase credentials:

```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...your-anon-key...
```

> Find these in Supabase Dashboard → Settings → API

### 4. Set up the database

1. Open Supabase Dashboard → **SQL Editor**
2. Copy the contents of `supabase/schema.sql`
3. Paste and click **Run**

This creates:
- 4 tables (profiles, sales, customers, projects)
- Indexes for performance
- Row Level Security policies
- Auto-create profile trigger
- Auto-confirm email trigger

### 5. Create the first Admin user

1. Supabase Dashboard → **Authentication → Users → Add user**
2. Enter email and password
3. After creation, click on the user
4. Add to **User Metadata**:
   ```json
   {
     "role": "admin",
     "full_name": "Admin User"
   }
   ```

> **Important:** Without `"role": "admin"` in user metadata, the user will be treated as a Sales user.

### 6. Start development server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) and log in.

---

## Deployment

### Vercel (Recommended)

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → Import your repo
3. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy

Vercel auto-detects Vite. The `vercel.json` handles SPA routing.

### Netlify

1. Build command: `npm run build`
2. Publish directory: `dist`
3. Add environment variables

---

## Available Scripts

| Command | Description |
|---------|------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run linter (oxlint) |

---

## Security

- **Row Level Security (RLS)** — enforced at database level, not just frontend
- **UUID Primary Keys** — internal IDs never exposed or used in URLs for auth
- **Soft Delete** — data is never permanently deleted
- **Password never displayed** — plain text passwords are never shown
- **Supabase Anon Key only** — service role key is never used in the frontend

---

## License

MIT
