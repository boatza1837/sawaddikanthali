# MASTER PROMPT — SMART CANTEEN
## Cashless Welfare Store Management System

คุณคือ Senior Full-Stack Software Architect, UI/UX Designer, Database Engineer และ Security Engineer

ภารกิจของคุณคือออกแบบและพัฒนา Web Application สำหรับร้านค้าสวัสดิการจำหน่ายขนม เครื่องดื่ม และสินค้าเบ็ดเตล็ด โดยสร้างระบบ Cashless Store ที่มีสมาชิก Wallet, PromptPay Top-up, QR Member Identification, RFID Card และ Employee POS

เป้าหมายคือสร้าง Commercial-Grade Application ที่สามารถนำไปใช้งานจริงได้ มีความปลอดภัยสูง ใช้งานง่าย รวดเร็ว และสามารถขยายระบบในอนาคตได้

ห้ามสร้างเพียง UI Mockup หรือ Dashboard ที่ปุ่มต่าง ๆ ใช้งานไม่ได้

---

# 1. TECHNOLOGY STACK

ใช้ Technology Stack ดังนี้

### Frontend
- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui
- Motion สำหรับ Animation
- React Hook Form
- Zod สำหรับ Validation

### Backend
- Next.js Server Actions / Route Handlers
- Modular Monolith Architecture
- Server-side Business Logic
- REST API สำหรับ Hardware Integration

### Database
- PostgreSQL
- Prisma ORM
- Database Transactions
- Database Migration

### Authentication
- Auth.js
- Google OAuth
- Email OTP
- Resend หรือ Amazon SES สำหรับส่งอีเมล

### Cache & Security
- Redis / Upstash
- Rate Limiting
- Session Management

### Infrastructure
- Vercel
- Managed PostgreSQL
- Cloudflare R2 หรือ Supabase Storage
- Sentry สำหรับ Error Monitoring

เลือก Version ที่เสถียรและเข้ากันได้จริง ณ วันที่เริ่มพัฒนา ห้ามใช้ Package ที่เลิกดูแลแล้ว

ออกแบบเป็น Modular Monolith ก่อน ไม่ต้องใช้ Microservices โดยไม่มีความจำเป็น

---

# 2. AUTHENTICATION & REGISTRATION

ระบบสมาชิกต้องสมัครด้วย Google Account เท่านั้น

ห้ามสมัครด้วย Username และ Password แบบปกติ

### Registration Flow

ขั้นตอนที่ 1: Continue with Google
- ผู้ใช้กดปุ่ม Continue with Google
- เข้าสู่ระบบผ่าน Google OAuth
- ตรวจสอบ OAuth Token ฝั่ง Server
- ตรวจสอบ email_verified
- ป้องกันบัญชีซ้ำด้วย Google Provider Account ID

ขั้นตอนที่ 2: Email OTP Verification

หลังผ่าน Google OAuth ในการสมัครครั้งแรก ให้ส่ง OTP ไปยัง Google Email ที่ใช้สมัคร

ข้อกำหนด:
- OTP จำนวน 6 หลัก
- หมดอายุภายใน 5 นาที
- ใช้ได้ครั้งเดียว
- จำกัดจำนวนครั้งที่กรอกรหัสผิด
- จำกัดการขอรหัสใหม่
- เก็บ OTP ในรูปแบบ Hash
- ห้ามบันทึก OTP แบบ Plaintext ใน Database หรือ Logs
- ใช้ Resend หรือ Amazon SES
- แสดง Countdown สำหรับขอ OTP ใหม่

Email OTP เป็นขั้นตอนยืนยันเพิ่มเติมในกระบวนการสมัคร ไม่ใช่ MFA ที่ใช้ปัจจัยอิสระจาก Google Account

ขั้นตอนที่ 3: Phone Number

บังคับให้กรอกเบอร์โทรศัพท์

วัตถุประสงค์:
- เป็นข้อมูลติดต่อสำรอง
- ใช้ติดต่อสมาชิกเมื่อเกิดปัญหา
- ใช้สำหรับงานบริการลูกค้า
- รองรับการเพิ่มระบบยืนยันเบอร์โทรศัพท์ในอนาคต

ข้อกำหนด:
- ไม่ต้องส่ง SMS OTP
- ไม่ต้องมี SMS Gateway
- จัดเก็บเบอร์ในรูปแบบมาตรฐาน E.164
- แสดงเบอร์แบบ Masking ในหน้า Profile
- แยกสถานะ Phone Verified และ Unverified
- ห้ามถือว่าเบอร์ที่กรอกแล้วเป็นเบอร์ที่ผ่านการยืนยัน
- ไม่ใช้เบอร์ที่ยังไม่ยืนยันเป็นช่องทาง Authentication หรือ Recovery โดยอัตโนมัติ

ขั้นตอนที่ 4: Account Creation

เมื่อสมัครสำเร็จ:
- สร้าง User Profile
- สร้าง Wallet อัตโนมัติ
- กำหนด Role เป็น USER
- บันทึกวันที่สมัคร
- Redirect ไปหน้า User Dashboard

### Subsequent Login

Login ครั้งต่อไป:
- ใช้ Google OAuth
- ไม่ต้องกรอก Email OTP ซ้ำทุกครั้ง
- หากพบความเสี่ยงให้ใช้ Re-authentication
- รองรับ Session Expiration และ Logout

### Employee / Admin Authentication

- Employee และ Admin ต้องได้รับบัญชีหรือสิทธิ์จาก Admin
- ห้ามผู้สมัครทั่วไปกำหนด Role ตัวเอง
- มี Permission แยกตามหน้าที่
- Admin ต้องเปิดใช้ MFA

---

# 3. USER SYSTEM

ออกแบบ User Interface แบบ Mobile-first

### User Dashboard

แสดง:
- ยอดเงิน Wallet
- ปุ่มเติมเงิน
- QR สำหรับใช้จ่าย
- ประวัติการทำรายการล่าสุด
- รายการเติมเงินล่าสุด
- Notification
- ข้อมูลสมาชิก

### Wallet

สมาชิกสามารถ:
- ดูยอดเงินคงเหลือ
- ดูรายการเติมเงิน
- ดูรายการใช้จ่าย
- ดูรายการคืนเงิน
- ดูรายละเอียดแต่ละ Transaction
- ดูวันที่และเวลา
- ดู Transaction Reference

ยอดเงินต้องแสดงแบบ Real-time เมื่อมีการยืนยันธุรกรรมจาก Server

### Member QR

สร้าง QR Code สำหรับระบุตัวสมาชิก

ข้อกำหนด:
- ใช้ Opaque Token
- ไม่เปิดเผย Member ID หรือข้อมูลส่วนตัว
- รองรับ Token แบบหมดอายุ
- ป้องกันการนำ QR Screenshot เก่ากลับมาใช้ซ้ำ
- สามารถออก Token ใหม่ได้
- QR สำหรับระบุตัวสมาชิกต้องแยกจาก PromptPay QR สำหรับเติมเงิน

สมาชิกสามารถแสดง QR นี้ให้พนักงานสแกนเพื่อระบุตัวตนและชำระเงิน

### Transaction History

แสดง:
- Transaction Type
- Amount
- Date
- Time
- Status
- Employee / Terminal
- Reference ID

ใช้สีและ Icon แยกประเภท:
- Top-up
- Purchase
- Refund
- Adjustment

---

# 4. PROMPTPAY TOP-UP SYSTEM

สร้างระบบเติมเงินผ่าน PromptPay โดยรองรับ Payment Provider Adapter เพื่อให้เปลี่ยนผู้ให้บริการได้ในอนาคต

### Phase 1: Dynamic QR

ขั้นตอน:
1. สมาชิกเลือกจำนวนเงิน
2. Backend สร้าง Top-up Intent
3. สร้าง Dynamic PromptPay QR ผ่าน Payment Provider
4. แสดง QR ให้สมาชิก
5. สมาชิกสแกนและชำระเงิน
6. Provider ส่ง Webhook
7. Backend ตรวจสอบ Webhook Signature
8. ตรวจสอบยอดเงินและ Reference
9. บันทึก Payment
10. เพิ่มเงินเข้า Wallet
11. แจ้งสมาชิกว่าเติมเงินสำเร็จ

ข้อกำหนด:
- QR มีวันหมดอายุ
- แต่ละรายการมี Unique Reference
- ป้องกันการเติมเงินซ้ำ
- รองรับ Pending / Paid / Failed / Expired
- รองรับ Webhook Retry
- รองรับ Payment Reconciliation

### Phase 2: Static Biller QR

เตรียมระบบรองรับ Thai QR Bill Payment

- Biller ID
- Reference 1 สำหรับแยกสมาชิก
- QR ประจำสมาชิก
- รองรับการระบุจำนวนเงินโดยผู้ชำระเมื่อ Provider อนุญาต
- Automatic Payment Matching

ห้ามสมมติว่า Static PromptPay QR แบบเบอร์โทรศัพท์สามารถระบุสมาชิกได้โดยอัตโนมัติ

ต้องใช้ Biller ID และ Reference ที่ Provider รองรับจริง

### Payment Settings (Admin)

Admin สามารถ:
- ตั้งค่า PromptPay Provider
- ตั้งค่าบัญชีรับเงินตามความสามารถของ Provider
- ตั้งค่า Biller ID
- ตรวจสอบสถานะการเชื่อมต่อ
- ดู Payment History
- ดู Pending Payments
- ตรวจสอบรายการที่จับคู่ไม่ได้
- ดู Webhook Logs

หากการเปลี่ยนบัญชีต้องทำผ่านธนาคารหรือ Provider ให้แสดงคำแนะนำชัดเจน ห้ามแสดงว่าการเปลี่ยนแปลงสำเร็จทั้งที่ยังไม่ได้เปลี่ยนจริง

### Important

ห้ามใช้การอัปโหลดสลิปเป็นหลักฐานยืนยันการเติมเงินโดยอัตโนมัติ

หากไม่มี API Credentials ให้สร้าง Sandbox Payment Provider สำหรับทดสอบเท่านั้น และต้องแยก Sandbox กับ Production อย่างชัดเจน

---

# 5. EMPLOYEE POS SYSTEM

ส่วนนี้สำคัญที่สุด

ออกแบบหน้า Employee POS ให้เป็นหน้าสำหรับคิดเงินโดยเฉพาะ

**ระบบต้องใช้ Manual Amount-based Payment ไม่ใช่ Product-based POS**

พนักงานเป็นผู้คำนวณราคาสินค้าทั้งหมดเอง แล้วกรอกยอดรวมที่ต้องการเรียกเก็บ

ห้ามบังคับให้พนักงานเลือกสินค้า
ห้ามบังคับให้สแกน Barcode สินค้า
ห้ามมี Product Cart เป็นขั้นตอนบังคับ
ห้ามทำให้การขายหนึ่งรายการต้องผ่านหลายหน้า

### POS Workflow

ขั้นตอนที่ 1: Enter Amount

พนักงานกรอกจำนวนเงินเอง

ตัวอย่าง:
- กรอก 15 บาท
- กรอก 25 บาท
- กรอก 45.50 บาท

ใช้ Numeric Keypad ที่มีปุ่มขนาดใหญ่

แสดงยอดเงินให้เห็นชัดเจน

รองรับ:
- ตัวเลข 0-9
- จุดทศนิยม
- ปุ่มลบ
- ปุ่ม Clear
- ปุ่ม Confirm Amount

ขั้นตอนที่ 2: Identify Member

รองรับ:
- Scan QR ด้วยกล้องโทรศัพท์
- USB 2D QR Scanner
- USB Barcode Scanner ที่อ่าน Member Barcode
- RFID Reader ในอนาคต

เมื่อสแกนสำเร็จ:
- ค้นหา Member
- ตรวจสอบสถานะบัญชี
- ตรวจสอบสถานะ Token หรือ Card
- แสดงชื่อสมาชิก
- แสดง Member ID
- แสดงยอดเงินคงเหลือ

ขั้นตอนที่ 3: Payment Confirmation

แสดงหน้าต่างยืนยันการชำระเงิน

ตัวอย่าง:

Member: User 00128

Current Balance: ฿120.00

Payment Amount: ฿45.00

Remaining Balance: ฿75.00

มีปุ่ม:
- Confirm Payment
- Cancel

หากยอดเงินไม่เพียงพอ:
- แสดง Insufficient Balance
- ห้ามตัดเงิน
- แสดงยอดเงินที่ขาด

ขั้นตอนที่ 4: Backend Processing

เมื่อพนักงานกดยืนยัน:
- ส่ง Payment Request ไป Backend
- ตรวจสอบ Session ของ Employee
- ตรวจสอบ Permission
- ตรวจสอบสถานะสมาชิก
- ตรวจสอบยอดเงินล่าสุด
- ตรวจสอบ Transaction Idempotency
- ใช้ Database Transaction
- ตัดเงินจาก Wallet
- บันทึก Ledger
- บันทึก Employee ID
- บันทึก Terminal ID
- บันทึก Timestamp

ห้ามให้ Frontend ตัดเงินเอง

ขั้นตอนที่ 5: Payment Success

แสดง:
- Payment Successful
- Amount
- Member Name
- Transaction ID
- Remaining Balance
- Date / Time

เล่นเสียงแจ้งเตือนเมื่อ Backend ยืนยันสำเร็จเท่านั้น

รองรับ Success Sound และ Error Sound

ขั้นตอนที่ 6: Continuous POS

เมื่อทำรายการสำเร็จ:
- ล้างยอดเงินรายการเดิม
- ล้างข้อมูลสมาชิก
- กลับสู่หน้า POS
- พร้อมรับรายการถัดไปทันที
- ไม่ต้อง Refresh Browser
- ไม่ต้อง Logout
- ไม่ต้องเปิดหน้าใหม่

### POS Additional Features

- ปุ่ม Lock Terminal
- ปุ่ม Logout
- Transaction History ของพนักงาน
- เปิดและปิดกะ
- สรุปยอดขายประจำกะ
- จำกัดยอดชำระสูงสุดต่อรายการ
- แจ้งเตือนเมื่อสมาชิกมียอดเงินต่ำ
- ป้องกันการ Double Click
- ป้องกัน Request ซ้ำ
- รองรับการเชื่อมต่อ Scanner แบบ Keyboard Wedge

### Refund

พนักงานทั่วไปไม่มีสิทธิ์แก้ไขยอดเงิน

การคืนเงินต้อง:
- มี Permission
- ระบุ Transaction ต้นทาง
- ระบุเหตุผล
- ได้รับการอนุมัติจาก Supervisor หรือ Admin
- สร้าง Refund Transaction ใหม่
- เก็บ Audit Log

ห้ามแก้ไขหรือ Delete Ledger เดิม

---

# 6. RFID SYSTEM

รองรับสมาชิกที่ไม่มีโทรศัพท์

ใช้ RFID / NFC Card เพื่อระบุตัวสมาชิก

### Card Registration

- Admin หรือ Employee ที่ได้รับสิทธิ์สามารถผูกบัตร
- สมาชิกหนึ่งคนสามารถมีหลายบัตรได้ตามนโยบาย
- แต่ละบัตรผูกกับ Wallet ของสมาชิก
- รองรับการระงับบัตร
- รองรับการเปลี่ยนบัตร
- รองรับบัตรสูญหาย

### Card Security

แนะนำ MIFARE DESFire EV3 หรือ Smart Card ที่รองรับ AES Authentication

ข้อกำหนด:
- ไม่ใช้ UID เพียงอย่างเดียวเป็นระบบยืนยันตัวตนที่ปลอดภัย
- ไม่เก็บ Wallet Balance ในบัตร
- เก็บข้อมูลยอดเงินใน Server เท่านั้น
- รองรับ Card Revocation
- รองรับ Card Replacement

### Hardware Compatibility

PC:
- USB NFC Reader
- PC/SC หรือ CCID
- Local Reader Bridge สำหรับ Browser หากจำเป็น

Android:
- Native NFC Integration
- เชื่อมต่อกับ Backend API

iPhone:
- ใช้ QR Code เป็นช่องทางหลัก
- ไม่บังคับใช้ Web NFC

RFID เป็น Phase 2 โดยต้องออกแบบ Database และ API เผื่อไว้ตั้งแต่ Phase 1

---

# 7. ADMIN DASHBOARD

สร้าง Admin Dashboard ที่ดูเป็น Commercial SaaS

### Overview

แสดง:
- Today's Sales
- Monthly Sales
- Total Top-ups
- Total Transactions
- Outstanding Wallet Balance
- Average Transaction Amount
- Active Members
- Best Transaction Hours
- Pending Payments
- Failed Transactions

ต้องแยก:
- ยอดเงินเติมเข้า Wallet
- ยอดขายจากการซื้อสินค้า
- ยอดเงินคงเหลือของสมาชิก

ห้ามนำยอดเติมเงินไปนับเป็นรายได้จากการขายสินค้าโดยตรง

### Member Management

- รายชื่อสมาชิก
- ค้นหาสมาชิก
- ดูยอดเงิน
- ดูประวัติธุรกรรม
- ระงับบัญชี
- ดูเบอร์โทรศัพท์
- จัดการ RFID
- ตรวจสอบสถานะบัญชี

### Employee Management

- เพิ่มพนักงาน
- แก้ไขข้อมูล
- ระงับบัญชี
- กำหนด Role
- กำหนด Permission
- ดูยอดขายรายบุคคล
- ดูประวัติการทำงาน
- ดูกะทำงาน

### Financial Management

- Top-up History
- Purchase History
- Refund History
- Wallet Ledger
- Manual Adjustment
- Payment Reconciliation
- Export CSV / Excel

ทุกการปรับปรุงยอดเงินต้องมี:
- ผู้ดำเนินการ
- จำนวนเงิน
- เหตุผล
- เวลาที่ดำเนินการ
- Transaction Reference

### Reports

- รายงานรายวัน
- รายงานรายเดือน
- รายงานรายปี
- รายงานตามพนักงาน
- รายงานตามช่วงเวลา
- รายงานยอดเติมเงิน
- รายงานยอดใช้จ่าย
- รายงาน Refund
- รายงานธุรกรรมผิดปกติ

### Product & Inventory (Optional Module)

เนื่องจาก POS ใช้การกรอกยอดรวมเอง จึงไม่จำเป็นต้องเชื่อม Product Catalog กับขั้นตอนชำระเงิน

สามารถพัฒนาโมดูลเสริมสำหรับ:
- รายการสินค้า
- หมวดหมู่
- สต็อก
- วันหมดอายุ
- สินค้าใกล้หมด

แต่ต้องไม่บังคับให้พนักงานเลือกสินค้าใน POS

---

# 8. DATABASE ARCHITECTURE

ใช้ PostgreSQL และออกแบบความสัมพันธ์ให้ถูกต้อง

ตารางหลัก:

Authentication:
- users
- accounts
- sessions
- profiles
- roles
- permissions
- user_roles

Verification:
- otp_challenges
- email_verifications

Wallet:
- wallets
- ledger_transactions
- ledger_entries

Payment:
- topup_intents
- payment_webhooks
- payment_providers
- payment_settings

POS:
- pos_transactions
- pos_terminals
- staff_shifts

RFID:
- rfid_cards
- rfid_card_events

Administration:
- audit_logs
- system_settings
- notifications

Optional Inventory:
- products
- categories
- inventory_movements

### Database Requirements

- Foreign Keys
- Unique Constraints
- Indexes
- Proper Relations
- Database Migration
- Seed Data
- Soft Delete เฉพาะข้อมูลที่เหมาะสม

### Financial Data

ใช้จำนวนเต็มหน่วยสตางค์ เช่น:

100 บาท = 10000

ห้ามใช้ Floating Point ในการคำนวณเงิน

ใช้ Double-entry Ledger

ตัวอย่างเติมเงิน 100 บาท:

Debit: Payment Clearing +10000

Credit: Member Wallet Liability +10000

ตัวอย่างซื้อสินค้า 45 บาท:

Debit: Member Wallet Liability -4500

Credit: Sales Revenue +4500

ออกแบบ Ledger ให้ตรวจสอบยอดรวม Debit และ Credit ได้

ห้ามแก้ไขหรือลบรายการ Ledger ที่สำเร็จแล้ว

การ Refund ต้องสร้างรายการกลับรายการใหม่

Wallet Balance Summary ต้องสามารถตรวจสอบย้อนกลับกับ Ledger ได้

---

# 9. SECURITY REQUIREMENTS

ให้ความสำคัญกับความปลอดภัยระดับ Production

ใช้ OWASP Security Best Practices

### Authentication
- Google OAuth Validation
- Secure Session
- HttpOnly Cookies
- SameSite Cookies
- Session Expiration
- Admin MFA

### Authorization
- RBAC
- Server-side Permission Checks
- ห้ามเชื่อ Role จาก Frontend
- ตรวจ Permission ทุก API ที่เกี่ยวข้อง

### Database
- SQL Injection Protection
- Input Validation
- Parameterized Queries
- Transaction Integrity
- Concurrency Control

### Financial Security
- Idempotency
- Immutable Ledger
- Double-entry Accounting
- Duplicate Payment Protection
- Duplicate Purchase Protection
- Server-side Balance Validation

### OTP
- Hash OTP
- Expiration
- Single Use
- Attempt Limit
- Resend Cooldown
- Rate Limiting

### API
- Input Validation ด้วย Zod
- CSRF Protection ตามรูปแบบ Authentication
- Webhook Signature Verification
- Request Rate Limiting
- Error Handling

### Audit
บันทึก:
- Login
- Logout
- Wallet Adjustment
- Refund
- Payment Settings Changes
- Member Suspension
- RFID Card Changes
- Employee Permission Changes

ห้ามบันทึก Password, OTP, OAuth Token หรือ Secret ลง Logs

### Backup
- Automated Database Backup
- Point-in-Time Recovery เมื่อ Provider รองรับ
- Backup Retention Policy
- ทดสอบ Restore จริง

ห้ามอนุมัติการใช้จ่ายจากข้อมูล Wallet ที่ Cache ไว้เมื่อไม่สามารถตรวจสอบยอดกับ Server ได้

---

# 10. UI / UX DESIGN SYSTEM

ต้องการหน้าตาแบบ Premium Commercial Web Application

Design Direction:
- Modern
- Minimal
- Premium
- Clean
- Friendly
- Trustworthy
- Smooth
- Professional

ใช้สี:
- Warm White
- Soft Gray
- Emerald / Deep Green
- Navy สำหรับข้อมูลสำคัญ

Typography:
- IBM Plex Sans Thai
- Noto Sans Thai
- Inter

หลีกเลี่ยง:
- AI-generated Dashboard แบบสำเร็จรูป
- Gradient มากเกินไป
- Glassmorphism มากเกินไป
- Animation ที่ไม่จำเป็น
- ปุ่มที่ไม่มีการทำงานจริง
- Layout ที่แน่นและอ่านยาก

### User UI
เน้น:
- Wallet Balance
- Top-up
- Member QR
- Transaction History

### Employee UI
เน้น:
- Amount Input
- Member Scanner
- Member Information
- Confirm Payment
- Payment Status

ปุ่มใหญ่ ใช้งานง่าย รองรับ Touchscreen

### Admin UI
เน้น:
- Sidebar Navigation
- Dashboard
- Data Tables
- Charts
- Search
- Filters
- Reports

ทุกหน้าต้อง Responsive

---

# 11. PERFORMANCE & LOADING STRATEGY

ต้องออกแบบสำหรับอินเทอร์เน็ตที่มีความเร็วต่ำด้วย

ใช้ Progressive Loading

Priority 1:
- HTML
- CSS
- Authentication
- Wallet
- POS
- QR Scanner
- Core API

Priority 2:
- Transaction History
- Profile
- Reports
- Product Images

Priority 3:
- Charts
- Advanced Analytics
- Animation
- Non-essential Components

ใช้:
- Next.js Server Components
- Dynamic Imports
- Lazy Loading
- Code Splitting
- Optimized Images
- WebP / AVIF
- PWA
- Skeleton Loading

### Performance Rules

- POS ต้องโหลดเร็วเป็นพิเศษ
- Scanner ต้องไม่ถูกโหลดในหน้าที่ไม่เกี่ยวข้อง
- ห้ามโหลดกราฟทั้งหมดตั้งแต่หน้าแรก
- ห้ามโหลดรูปภาพขนาดใหญ่โดยไม่จำเป็น
- ใช้ Animation เฉพาะจุด
- รองรับ prefers-reduced-motion
- Cache เฉพาะข้อมูลที่เหมาะสม
- ห้าม Cache Wallet Balance ข้ามสมาชิก
- ห้าม Cache ข้อมูลที่ใช้ตัดสินใจอนุมัติธุรกรรม

เมื่ออินเทอร์เน็ตช้า ต้องแสดง Loading Status อย่างชัดเจน

ห้ามแสดง Payment Success จนกว่า Backend จะยืนยัน

---

# 12. NOTIFICATION SYSTEM

รองรับ:
- Email Notification
- In-app Notification

แจ้งเตือน:
- สมัครสมาชิกสำเร็จ
- เติมเงินสำเร็จ
- ใช้จ่ายสำเร็จ
- Refund
- บัตร RFID ถูกระงับ
- มีการ Login ที่ผิดปกติ
- Wallet Activity ที่น่าสงสัย

ออกแบบ Notification Center สำหรับ User และ Admin

---

# 13. TESTING & QUALITY ASSURANCE

ต้องสร้าง Automated Tests

### Authentication Tests
- Google OAuth
- Email OTP
- OTP Expiration
- OTP Reuse
- Duplicate Account
- Unauthorized Access

### Wallet Tests
- Top-up
- Purchase
- Refund
- Insufficient Balance
- Negative Balance Prevention
- Concurrent Transactions

### Payment Tests
- Duplicate Webhook
- Invalid Signature
- Payment Timeout
- Payment Expiration
- Reconciliation

### POS Tests
- Manual Amount Entry
- QR Identification
- RFID Identification
- Duplicate Request
- Network Failure
- Double Click
- Insufficient Balance

### Security Tests
- Unauthorized Admin API
- Role Escalation
- CSRF
- XSS
- Rate Limiting
- Session Security

ต้องทดสอบกรณีมีการจ่ายเงินพร้อมกันหลายรายการ เพื่อยืนยันว่า Wallet ไม่ถูกตัดเงินซ้ำและไม่ติดลบ

---

# 14. DEVELOPMENT PHASES

อย่าพยายามสร้างทุกระบบพร้อมกัน

พัฒนาเป็นลำดับ:

### PHASE 1 — Core Platform

- Project Setup
- Database
- Google OAuth
- Email OTP
- Phone Number Collection
- User Dashboard
- Wallet
- Dynamic QR Top-up
- Member QR
- Employee POS
- Admin Dashboard
- Financial Ledger
- RBAC
- Audit Logs

เป้าหมาย: สามารถสมัครสมาชิก เติมเงิน และซื้อสินค้าผ่าน POS ได้จริง

### PHASE 2 — Payment & Reporting

- Static Biller QR
- Automatic Reconciliation
- Advanced Financial Reports
- Employee Reports
- Notification System

### PHASE 3 — RFID

- RFID Registration
- Card Management
- RFID Reader Integration
- Android NFC Application
- Lost Card Management

### PHASE 4 — Advanced Features

- Inventory
- Expiry Management
- Promotions
- Advanced Analytics
- Multi-terminal Management
- Multi-branch Support

---

# 15. DEVELOPMENT RULES

ก่อนเริ่มพัฒนา:

1. วิเคราะห์ Requirement ทั้งหมด
2. ออกแบบ System Architecture
3. ออกแบบ Database ERD
4. ออกแบบ Authentication Flow
5. ออกแบบ Wallet Ledger
6. ออกแบบ Payment Sequence Diagram
7. ออกแบบ Employee POS Flow
8. วางแผน API
9. สร้าง Design System
10. แบ่งงานเป็น Phase

ระหว่างพัฒนา:
- เขียนโค้ดที่อ่านง่าย
- แยก Components
- แยก Business Logic
- แยก Payment Provider
- ใช้ TypeScript อย่างเหมาะสม
- ไม่ Hardcode Secret
- ไม่สร้าง Mock Data ใน Production
- ไม่ทำปุ่มที่กดแล้วไม่มี Action
- ไม่ใช้ข้อมูลจำลองเพื่อแสดงว่าการเงินสำเร็จ
- ตรวจสอบ Error Handling ทุกจุด
- เขียน Tests สำหรับ Business Logic สำคัญ

เมื่อมีส่วนที่ต้องใช้ API Key หรือ Hardware จริง ให้สร้าง Integration Interface และแจ้งรายการที่ต้องตั้งค่าอย่างชัดเจน

ห้ามอ้างว่าระบบเชื่อมต่อธนาคารหรือ RFID สำเร็จ หากยังไม่ได้ทดสอบกับบริการหรืออุปกรณ์จริง

---

# 16. FINAL DELIVERABLES

ส่งมอบระบบที่ประกอบด้วย:

1. Working Full-stack Web Application
2. Responsive UI
3. PostgreSQL Database Schema
4. Database Migrations
5. Seed Data
6. API Documentation
7. Authentication System
8. Wallet & Ledger System
9. PromptPay Integration
10. Employee POS
11. Admin Dashboard
12. RFID-ready Architecture
13. Security Documentation
14. Automated Tests
15. .env.example
16. README
17. Installation Guide
18. Deployment Guide

---

# FINAL OBJECTIVE

สร้าง Smart Canteen ที่เป็นระบบ Cashless Store อย่างแท้จริง

สมาชิกสามารถสมัครด้วย Google ยืนยัน Email OTP เติมเงินผ่าน PromptPay และแสดง QR เพื่อใช้จ่ายได้

พนักงานสามารถกรอกยอดเงินเอง สแกน QR หรือแตะ RFID และตัดเงินจาก Wallet ได้อย่างรวดเร็ว

Admin สามารถตรวจสอบยอดเงิน ธุรกรรม สมาชิก พนักงาน และการทำงานของระบบได้ทั้งหมด

ระบบต้องมีความถูกต้องด้านการเงิน ปลอดภัย ใช้งานง่าย โหลดเร็ว และรองรับการขยายในอนาคต

ให้ความสำคัญกับ Functionality, Security, Performance และ User Experience มากกว่าการทำ UI ให้ดูสวยเพียงอย่างเดียว

เริ่มต้นด้วยการวิเคราะห์ Requirement และเสนอ System Architecture ก่อนลงมือเขียนโค้ดจริง