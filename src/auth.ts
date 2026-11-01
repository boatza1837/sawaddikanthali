import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";
const adapter = PrismaAdapter(db);
const originalLinkAccount = adapter.linkAccount!;
adapter.linkAccount = async (account) => {
  await originalLinkAccount({
    userId: account.userId,
    type: account.type,
    provider: account.provider,
    providerAccountId: account.providerAccountId,
  });
};
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
  providers: [
    Google({ authorization: { params: { prompt: "select_account" } } }),
  ],
  session: { strategy: "database", maxAge: 8 * 60 * 60 },
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider !== "google" || profile?.email_verified !== true)
        return false;
      if (user.id) {
        const stored = await db.user.findUnique({ where: { id: user.id } });
        if (stored?.status === "SUSPENDED") return false;
      }
      return true;
    },
    async session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (user.id)
        await db.auditLog.create({
          data: { actorId: user.id, action: "LOGIN", targetId: user.id },
        });
    },
  },
  pages: { signIn: "/" },
});
