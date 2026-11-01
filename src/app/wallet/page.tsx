import { auth, signOut } from "@/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Registration } from "@/components/registration";
import { Wallet } from "@/components/wallet";
import { slipConfig } from "@/modules/slip2go";
import { registrationReady, sandboxAvailable } from "@/lib/readiness";

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  if (!registrationReady()) redirect("/");
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  const user = await db.user.findUniqueOrThrow({
    where: { id: session.user.id },
  });
  if (user.status === "SUSPENDED")
    return <h1>บัญชีถูกระงับ กรุณาติดต่อผู้ดูแล</h1>;

  const challenge = user.status === "PENDING" && !user.otpVerifiedAt
    ? await db.otpChallenge.findFirst({ where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() }, attempts: { lt: 5 } }, orderBy: { createdAt: "desc" }, select: { createdAt: true } })
    : null;
  const initialStep = user.otpVerifiedAt ? "phone" : challenge ? "verify" : "send";
  const initialSeconds = challenge ? Math.max(0, Math.ceil((challenge.createdAt.getTime() + 60000 - Date.now()) / 1000)) : 0;

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return user.status === "PENDING" ? (
    <Registration email={user.email ?? undefined} initialStep={initialStep} initialSeconds={initialSeconds} />
  ) : (
    <Wallet
      phone={user.phone}
      phoneVerified={user.phoneVerified}
      name={user.name ?? session.user?.name ?? undefined}
      email={user.email ?? session.user?.email ?? undefined}
      sandboxEnabled={sandboxAvailable()}
      slipEnabled={Boolean(slipConfig())}
      onSignOut={handleSignOut}
    />
  );
}
