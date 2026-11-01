# ใช้งานและตั้งค่าต่อ — Smart Canteen

เว็บออนไลน์: https://sawaddikanthali.vercel.app

## ตั้งค่าแล้ว

- Google OAuth client แยกใน Smart Canteen project พร้อม callback `/api/auth/callback/google` ของเว็บออนไลน์และ localhost
- PostgreSQL จริงแผนฟรีใน Singapore พร้อม migrations และ counter-1 โดยไม่มีข้อมูลสมาชิกหรือเงินจำลอง
- Upstash Redis แผนฟรี เชื่อมกับ Vercel และทดสอบจำกัดคำขอกับบริการจริงแล้ว
- Brevo เป็นผู้ส่งอีเมลปัจจุบัน ตามที่ผู้ใช้อนุมัติให้ใช้บัญชีเดิมและสร้าง key แยก Restricted เฉพาะ Transactional email
- อีเมลตรวจการเชื่อมต่อส่งถึงและเปิดอ่านแล้วตาม Brevo logs; การสมัครครบ flow ยังต้องยืนยัน OTP และเบอร์โทรของสมาชิกจริง

ไม่มีการแก้ไฟล์หรือ key ของ D:\Gehue และไม่มีการสมัครแพ็กเกจเสียเงิน

## สมัครสมาชิก

1. กด Continue with Google และทำรายการในแท็บเดียว อย่ากดเริ่ม Login ซ้อนหลายครั้ง
2. กดส่ง OTP แล้วตรวจอีเมล Google ที่ใช้ Login รวมถึงโฟลเดอร์ Spam
3. กรอก OTP 6 หลักภายใน 5 นาทีและยืนยัน ใช้ได้ครั้งเดียว
4. กรอกเบอร์โทร E.164 เช่น เบอร์ไทยขึ้นต้น +66 และตัดเลข 0 ตัวแรก กดเปิด Wallet

เบอร์โทรเป็นข้อมูลติดต่อ ยังไม่ผ่านการยืนยันและไม่ใช้กู้บัญชีโดยอัตโนมัติ ระบบไม่มี SMS OTP

ขอรหัสใหม่เว้นอย่างน้อย 60 วินาที และจำกัดคำขอ 3 ครั้งต่อ 15 นาที หน้าเว็บใช้เวลารอที่ server ส่งกลับมา ห้ามล้าง/ข้ามข้อจำกัดเพื่อให้ทดสอบผ่าน

## ค่าอีเมลใน Vercel Production

- EMAIL_PROVIDER=brevo
- BREVO_API_KEY: key ของ Smart Canteen OTP ที่เก็บเป็น Secret
- BREVO_SENDER_EMAIL: ผู้ส่งที่ยืนยันแล้วในบัญชี Brevo

ผู้ส่ง Gmail ที่ยืนยันแล้วใช้กับการตั้งค่า Brevo ปัจจุบันได้ โดย Brevo อาจเปลี่ยนโดเมน From เป็นโดเมนของบริการ การมีโดเมนที่ยืนยัน DNS ยังช่วยเรื่องการส่งถึงและชื่อแบรนด์

Resend เป็น adapter ทางเลือก หากจะกลับไปใช้ให้ตั้ง EMAIL_PROVIDER=resend พร้อม RESEND_API_KEY และ EMAIL_FROM ตามข้อกำหนดของ Resend ไม่ได้เป็นผู้ส่งหลักในปัจจุบัน

ผู้ใช้ยืนยันให้ปิด IP blocking ของ API keys ทั้งบัญชี Brevo เพื่อรองรับ IP ขาออกของ Vercel ที่เปลี่ยนได้ การเรียก API ยังคงต้องใช้ API key ที่ถูกต้อง ผู้ใช้แจ้งว่าทดสอบส่งอีเมลเองแล้ว และไม่ให้เปลี่ยนการตั้งค่าหรือทดสอบ Brevo เพิ่ม

## Redis และฐานข้อมูล

แอปรองรับ UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN หรือ KV_REST_API_URL / KV_REST_API_TOKEN ที่ Vercel integration สร้างให้ ห้ามใช้ read-only token สำหรับ rate limiter

DATABASE_URL อยู่ใน Secret ของ Vercel และไฟล์ .env.production.local ที่ไม่ขึ้น Git ใช้ `pnpm db:migrate` กับฐานข้อมูลเป้าหมายที่ตรวจแล้ว ไม่ใช้ db push หรือ development seed บน production

## พนักงานและ POS

เมื่อสมาชิกลงทะเบียนสำเร็จ ผู้ดูแลฐานข้อมูลที่เชื่อถือได้จึงกำหนด EMPLOYEE หรือ SUPERVISOR ผ่าน scripts/grant-staff.ts ได้ การทำรายการจะบันทึก audit; ผู้สมัครทั่วไปกำหนด Role เองไม่ได้

POS ใช้เปิดกะ counter-1 -> กรอกยอด -> อ่าน QR/token สมาชิก -> ยืนยันบน server ไม่มี product cart ยอด Wallet ต้องมีเงินที่รับรองโดยระบบเงินจริงก่อนใช้จ่าย

## ยังไม่พร้อมเปิดใช้เงินจริง

ยังไม่มี Payment Provider production credentials/adapter ที่ผ่านการทดสอบ PromptPay จึงปิดเติมเงินบนเว็บออนไลน์และปิด sandbox ฝั่ง Production ไม่อนุมัติยอดด้วยสลิปหรือข้อมูลจาก browser

ยังต้องทำ Admin MFA/หน้าจัดการ, payment reconciliation, operational recovery, backup/restore และทดสอบอุปกรณ์จริงก่อนเปิดการเงินทั่วไป อ่าน DEPLOYMENT_STATUS.md สำหรับผลตรวจล่าสุดและรายการเงื่อนไขที่ยอมรับ
