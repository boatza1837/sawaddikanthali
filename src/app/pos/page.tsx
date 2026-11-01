import { auth } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Pos } from "@/components/pos";
export const dynamic = "force-dynamic";
export default async function PosPage() {
  if (!process.env.AUTH_SECRET) redirect("/");
  const s = await auth();
  if (!s?.user?.id) redirect("/");
  const user = await db.user.findUniqueOrThrow({ where: { id: s.user.id } });
  if (
    user.status !== "ACTIVE" ||
    !["EMPLOYEE", "SUPERVISOR", "ADMIN"].includes(user.role)
  )
    return <h1>ต้องได้รับสิทธิ์พนักงานจากผู้ดูแล</h1>;
  return <Pos userId={user.id} name={user.name ?? "พนักงาน"} role={user.role} />;
}
