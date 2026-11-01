# ตั้งค่าต่ออย่างไร

เปิดเว็บพัฒนา: http://localhost:3000 (พอร์ต 3000)

## สิ่งที่สร้างให้แล้ว

เอกสารสถาปัตยกรรมและ ERD, โครง Next.js, PostgreSQL/Prisma migrations, wallet ledger ฝั่ง server, OTP flow, sandbox webhook, QR สมาชิก, POS กรอกยอดเอง, สิทธิ์พนักงาน, audit และ tests อ่านขอบเขต/ผลตรวจจริงใน VERIFICATION.md

## สิ่งที่คุณต้องสร้าง

1. Google Cloud project สำหรับ Smart Canteen (แยกจาก Grab Driver Dashboard)
   - ตั้งค่า consent/branding และ audience เป็นผู้ทดสอบตามบัญชีที่ใช้
   - สร้าง OAuth Client ชนิด Web application
   - Origin: http://localhost:3000
   - Redirect URI: http://localhost:3000/api/auth/callback/google
   - ใส่ client ID / secret ใน .env ชื่อ AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET
2. Resend account และ API key
   - ทดสอบด้วย EMAIL_FROM=onboarding@resend.dev ส่งหาอีเมลเจ้าของบัญชี Resend ก่อน
   - หากจะส่ง OTP ให้สมาชิกคนอื่น ต้องมีโดเมนที่คุณควบคุม DNS ได้ เพิ่ม domain และยืนยัน DNS ใน Resend
   - ตั้ง RESEND_API_KEY และ EMAIL_FROM ใน .env
   - โดเมนอีเมลผู้ส่งแยกจาก URL ของเว็บ: deploy ไป *.vercel.app อย่างเดียวไม่ได้ยืนยันโดเมนส่งอีเมลให้
3. Upstash Redis REST database: ใส่ UPSTASH_REDIS_REST_URL และ UPSTASH_REDIS_REST_TOKEN
   - ระบบจำกัดคำขอจะปฏิเสธการทำงานหากยังไม่ตั้งค่า จึงต้องมีส่วนนี้ก่อนทดสอบสมัคร/Wallet/POS ผ่านเว็บครบ flow
4. Payment provider merchant/sandbox credentials สำหรับขั้นต่อไป
   - ตอนนี้มี sandbox จำลองที่ติดป้ายชัดเจนเท่านั้น ยังไม่มี PromptPay รับเงินจริง
5. เมื่อจะ deploy: บัญชี Vercel, PostgreSQL แบบ managed, URL คงที่/โดเมน และเพิ่ม Google callback ของ HTTPS URL นั้น

ไม่จำเป็นต้อง deploy ก่อนทดสอบ Google Login บน localhost อย่าส่ง secret หรือ OTP ลงแชต ใส่ใน .env ภายในเครื่องและ secret settings ของผู้ให้บริการ deploy เท่านั้น

## ลำดับทดลอง

ทำตาม README ติดตั้ง dependency และ migration -> ตั้ง Google/Resend/Upstash -> ลงทะเบียนด้วย Google -> รับ OTP -> กรอกเบอร์โทร E.164 -> เปิด Wallet -> สร้าง topup sandbox -> ส่ง signed simulated webhook ด้วย scripts/sandbox-settle.ts -> สร้าง QR สมาชิก -> เปิด POS ด้วยบัญชีที่ได้รับสิทธิ์พนักงาน -> เปิดกะ counter-1 -> กรอกยอดและสแกน token -> ยืนยัน

ตัวอย่างการตั้งสิทธิ์พนักงานหลังลงทะเบียนสำเร็จ (เฉพาะผู้ดูแลฐานข้อมูลที่เชื่อถือได้):

`pnpm exec tsx scripts/grant-staff.ts your-email@example.com EMPLOYEE`

พนักงานทั่วไปไม่สามารถคืนเงินเอง การคืนเงินผ่าน API ต้องใช้ SUPERVISOR และระบุรายการต้นทาง/เหตุผล หน้าขออนุมัติและการจัดการ Admin ยังต้องพัฒนาต่อ

ยังไม่พร้อมเปิดเงินจริง: ต้องทำ Admin MFA, production PromptPay adapter, reconciliation, operational recovery และทดสอบบริการ/อุปกรณ์จริงเพิ่มเติม ดู README และ DEPLOYMENT.md
