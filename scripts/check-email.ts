import { sendServiceEmail } from "../src/modules/email";
import { writeFileSync } from "node:fs";
const recipient = process.argv[2];
if (!recipient || !/^\S+@\S+\.\S+$/.test(recipient))
  throw Error("Usage: tsx scripts/check-email.ts recipient-email");
const result = await sendServiceEmail(
  recipient,
  "[Smart Canteen] ตรวจการเชื่อมต่ออีเมล",
  "ทดสอบการส่งอีเมลจริงจาก Smart Canteen ผ่าน Brevo ตามที่คุณร้องขอ อีเมลนี้เป็นการตรวจการเชื่อมต่อ ไม่ใช่ OTP และไม่มีการเปลี่ยนยอดเงินใน Wallet",
);
writeFileSync(".cache/email-check.json", JSON.stringify(result));
console.log(
  "Provider accepted the connection-check email. Delivery must still be checked in provider events/inbox.",
);
