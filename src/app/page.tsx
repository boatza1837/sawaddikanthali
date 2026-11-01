import { auth, signIn, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import Link from "next/link";
export default async function Home() {
  const configured = Boolean(
    process.env.AUTH_GOOGLE_ID &&
    process.env.AUTH_GOOGLE_SECRET &&
    process.env.AUTH_SECRET,
  );
  const session = configured ? await auth() : null;
  return (
    <>
      <span className="badge">Phase 1 · Development foundation</span>
      <h1 style={{ marginTop: 24 }}>ร้านสวัสดิการ ใช้จ่ายสะดวก</h1>
      <p className="muted">เติม Wallet แสดง QR แล้วให้พนักงานยืนยันยอดบนระบบ</p>
      <section className="card" style={{ maxWidth: 600, marginTop: 28 }}>
        <h2>
          {session
            ? `สวัสดี ${session.user?.name ?? "สมาชิก"}`
            : "เริ่มต้นด้วยบัญชี Google"}
        </h2>
        <p>สมัครด้วย Google ยืนยันอีเมล OTP และเพิ่มเบอร์โทรติดต่อ</p>
        {!configured ? (
          <div className="notice">
            ยังไม่ได้ตั้งค่า Google OAuth และ AUTH_SECRET กรุณาทำตาม README
            ก่อนเข้าสู่ระบบ
          </div>
        ) : session ? (
          <>
            <Link className="button primary" href="/wallet">
              เปิด Wallet
            </Link>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <Button variant="outline">ออกจากระบบ</Button>
            </form>
          </>
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/wallet" });
            }}
          >
            <Button>Continue with Google</Button>
          </form>
        )}
      </section>
      <div className="notice">
        ระบบระหว่างพัฒนา — sandbox ใช้ทดสอบเท่านั้น ยังไม่รองรับการรับเงินจริง
      </div>
    </>
  );
}
