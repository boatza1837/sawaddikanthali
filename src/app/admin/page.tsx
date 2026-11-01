import { auth } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Admin } from "@/components/admin";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  if (!process.env.AUTH_SECRET) redirect("/");
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (user?.status !== "ACTIVE" || user.role !== "ADMIN") return <section className="formal-card"><span className="badge">ADMIN ACCESS</span><h1>พื้นที่สำหรับผู้ดูแล</h1><p>บัญชีนี้ยังไม่มีสิทธิ์ผู้ดูแล กรุณาติดต่อผู้ดูแลระบบ</p></section>;
  return <Admin name={user.name ?? "ผู้ดูแล"} userId={user.id} />;
}
