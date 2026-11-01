import { auth } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Registration } from "@/components/registration";
import { Wallet } from "@/components/wallet";
export const dynamic = "force-dynamic";
export default async function WalletPage() {
  if (!process.env.AUTH_SECRET) redirect("/");
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
  });
  if (user.status === "SUSPENDED")
    return <h1>บัญชีถูกระงับ กรุณาติดต่อผู้ดูแล</h1>;
  return user.status === "PENDING" ? (
    <Registration />
  ) : (
    <Wallet phone={user.phone} />
  );
}
