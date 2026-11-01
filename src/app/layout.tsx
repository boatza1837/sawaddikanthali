import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
export const metadata: Metadata = {
  title: "Smart Canteen",
  description: "ระบบร้านค้าสวัสดิการ Cashless",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>
        <header>
          <Link
            href="/"
            style={{ fontWeight: 800, textDecoration: "none", fontSize: 20 }}
          >
            SMART CANTEEN
          </Link>
          <nav>
            <Link href="/wallet">สมาชิก</Link>
            <Link href="/pos">POS พนักงาน</Link>
            <Link href="/admin">ผู้ดูแล</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
