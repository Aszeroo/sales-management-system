# โมเดลสิทธิ์ 3 บทบาท — Sales และ Manager เป็น Owner ได้, Admin ไม่มีสิทธิ์เป็น Owner

**Status**: accepted
**Date**: 2026-10-07

## บริบทและการตัดสินใจ

ระบบเดิมมี 2 บทบาท (Admin/Sales) กำหนดผ่าน user metadata และบังคับด้วย RLS เท่านั้น การปรับปรุงระบบเพิ่มบทบาท **Manager** (ผู้จัดการ) เข้ามา ทำให้ต้องนิยามโมเดลสิทธิ์ใหม่ทั้งชุด

**การตัดสินใจ**: มี 3 บทบาทเสมอ — ผู้ใช้หนึ่งคนมีหนึ่งบทบาท และเป็น **Owner-capable** (เป็น Sales Owner ของลูกค้าได้) เฉพาะ `Sales` และ `Manager` เท่านั้น ผู้ใช้ Owner-capable ทุกคนมีแถวในตาราง `sales` โดยอัตโนมัติตั้งแต่สมัคร (trigger เดียวกันทั้งสองบทบาท) ส่วน **Admin ไม่มีแถว sales และเป็นเจ้าของลูกค้าไม่ได้ตลอดไป** แม้จะจัดการข้อมูลได้ทุกอย่าง

## Considered Options

- **Strict 1:1** — เฉพาะ `Sales` เท่านั้นที่มีแถว sales/เป็น owner, Manager เป็นเพียงผู้กำกับดูแล: **ถูกปฏิเสธ** เพราะผู้ใช้ต้องการให้ Manager ลงมือดูแลลูกค้าด้วยตนเองได้ในบางกรณี (ตัดสินใจโดยเจ้าของโปรเจกต์, 2026-10-07)
- **Flexible (เลือกใช้)** — Manager เป็น owner ได้เช่นเดียวกับ Sales: กติกาเดียวกันทุกบทบาทที่ own ได้ → RLS เช็ค "มีแถว sales = เป็น owner ได้" โดยไม่ต้องดู role ซ้ำ

## Consequences

- **ทุก Customer ต้องมี Sales Owner เสมอ** — ปิดบัญชีหรือเลื่อนบทบาทผู้ใช้ที่กำลังเป็น owner ขึ้นเป็น Admin ต้อง**ย้ายเจ้าของลูกค้าทุกรายการก่อน** ระบบจะบังคับ (UI เตือนล่วงหน้า + ตรวจใน RPC/DB)
- การกำหนด/ย้าย Sales Owner เป็นสิทธิ์ **Admin เท่านั้น** (กฎ #8 เดิมคงไว้) — ฟอร์มของ Manager เห็น owner แบบ read-only
- Manager: เห็น/สร้าง/แก้ไข Customer-Project ทั้งหมด แต่**ลบไม่ได้**, จัดการบัญชีผู้ใช้ไม่ได้, dashboard เห็นทั้งระบบ
- Sales: จัดการเฉพาะลูกค้าของตน (เดิม), สร้างลูกค้าใหม่ auto เป็น owner ของตัวเอง
- RLS อ้างอิง "แถว sales ของ auth.uid()" เป็นตัวตั้งของ ownership — การลบแถว sales จึงต้องผ่านเงื่อนไข owner-reassignment เสมอ

## Technical Design

ชนิดบทบาทใหม่ (`src/types/index.ts`):

```ts
export type UserRole = 'admin' | 'manager' | 'sales';
```

Trigger สร้างแถว sales อัตโนมัติ — สร้างเมื่อ role เป็น owner-capable เท่านั้น (ยืดจาก `handle_new_user` เดิมใน `supabase/schema.sql`):

```sql
-- pseudo: ภายใน trigger หลังสร้าง profiles
if new_role in ('sales', 'manager') then
  insert into sales (user_id, sales_code, full_name, email)
    values (new_id, generate_code(...), new_name, new_email);
end if;
```

RLS helper — ตัวตั้งของ ownership คือ "แถว sales ของผู้ใช้ปัจจุบัน" ไม่ใช่ role:

```sql
create function public.current_sales_id() returns uuid
  security definer as $$
  select id from sales where user_id = auth.uid() and deleted_at is null;
$$;
-- policy ownership เช็ค: customer.sales_id = current_sales_id()
```

การเปลี่ยนบทบาท/ปิดบัญชี/สร้างผู้ใช้ ใช้ SECURITY DEFINER RPC ที่ Admin เรียกผ่าน anon key (แทนการ hack `signUp` เดิมของหน้าจัดการ Sales ที่ถูกแทนด้วยหน้า "ผู้ใช้" รวม — issue #7, migration `0005_user_management.sql`) — ดูเพิ่มเติม: `src/contexts/AuthContext.tsx` (role + auto-logout), `src/components/ProtectedRoute.tsx` (route guard)
