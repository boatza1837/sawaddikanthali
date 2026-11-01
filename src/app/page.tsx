import { auth, signIn, signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { GoogleSignInButton } from "@/components/google-signin-button";
import { registrationReady } from "@/lib/readiness";
export default async function Home() {
  const configured = registrationReady();
  const session = configured ? await auth() : null;
  return (
    <>
      <span className="badge">SMART CANTEEN</span>
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
            กำลังเตรียมระบบสมัครสมาชิก กรุณากลับมาอีกครั้งภายหลัง
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
            <GoogleSignInButton />
          </form>
        )}
      </section>
      <div className="notice">ยังไม่เปิดบริการเติมเงินและรับชำระเงินจริง</div>
    </>
  );
}
