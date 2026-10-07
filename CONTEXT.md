# SMS — Sales Management System

ระบบจัดการฝ่ายขายและลูกค้าสำหรับธุรกิจ SME: Sales ดูแล Customer ของตนเอง และแต่ละ Customer มี Project ภายใต้ตัวเอง

## Language

### บทบาท (Roles)

**Admin**:
ผู้ดูแลระบบสูงสุด — จัดการได้ทุกอย่าง รวมถึงบัญชีผู้ใช้และการกำหนด Sales Owner แต่ไม่เป็น Sales Owner เอง
_Avoid_: Superuser, root, เว็บมาสเตอร์

**Sales**:
บทบาทพนักงานขาย — ผู้ใช้ที่ดูแล Customer ของตนเอง และ Project ภายใต้ Customer เหล่านั้น
_Avoid_: Salesperson (เมื่อหมายถึงบทบาท), พนักงาน

**Manager**:
บทบาทผู้จัดการ — เห็นและสร้าง/แก้ไข Customer และ Project ได้ทั้งหมด แต่ลบไม่ได้ และจัดการบัญชีผู้ใช้ไม่ได้; เป็น Sales Owner ได้เช่นเดียวกับ Sales
_Avoid_: Supervisor, หัวหน้า

### วัตถุทางธุรกิจ (Business Objects)

**Customer**:
องค์กรหรือบุคคลผู้เป็นลูกค้าของธุรกิจ — ถูกดูแลโดย Sales Owner เพียงคนเดียวเสมอ
_Avoid_: Client, account, ลูกค้าบุคคล/นิติบุคคล

**Project**:
งานที่ดำเนินการภายใต้ Customer หนึ่ง — มีงบประมาณและสถานะของตัวเอง
_Avoid_: Job, deal, order

**Sales Owner**:
Sales หรือ Manager ผู้รับผิดชอบ Customer หนึ่งๆ — Customer หนึ่งมี Sales Owner ได้คนเดียวเสมอ และต้องมีเจ้าของเสมอ (ห้ามไร้เจ้าของ)
_Avoid_: Assignee, PIC, ผู้ดูแลลูกค้า

**Owner-capable**:
บทบาทที่เป็น Sales Owner ได้ — ได้แก่ Sales และ Manager เท่านั้น (Admin ไม่รวม)
_Avoid_: owner group, กลุ่มผู้ดูแล

**User**:
บัญชีผู้ใช้ที่เข้าสู่ระบบได้ — มีหนึ่งบทบาทเสมอ และ Admin เปลี่ยนบทบาทให้ได้ภายหลัง
_Avoid_: บัญชี, member, account

### กติกาการลบ

**Soft Delete**:
การ "ลบ" ในระบบหมายถึงการทำเครื่องหมายว่าลบพร้อมวันเวลา — ไม่ใช่การนำข้อมูลออกจริง
_Avoid_: ลบถาวร, hard delete
