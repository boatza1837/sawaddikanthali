import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { ensure } from "@/lib/errors";
import { digest, opaque, rateLimit } from "@/lib/security";
import { base32, matchCounter, seal, unseal } from "@/lib/totp";
import { serial } from "./finance";
const cookieName = "canteen-admin-stepup";
export async function adminSession(user: { id: string; role: string }) {
  ensure(user.role === "ADMIN", "ADMIN_REQUIRED", 403);
  const jar = await cookies();
  const sessionToken = jar.get("__Secure-authjs.session-token")?.value ?? jar.get("authjs.session-token")?.value;
  ensure(sessionToken, "UNAUTHENTICATED", 401);
  const session = await db.session.findUnique({ where: { sessionToken } });
  ensure(session && session.userId === user.id && session.expires > new Date(), "UNAUTHENTICATED", 401);
  return { sessionHash: digest(sessionToken), grant: jar.get(cookieName)?.value, jar };
}
export async function requireAdmin(user: { id: string; role: string }) {
  const session = await adminSession(user);
  const grant = session.grant ? await db.adminGrant.findUnique({ where: { digest: digest(session.grant) } }) : null;
  ensure(grant && grant.userId === user.id && grant.sessionHash === session.sessionHash && grant.expiresAt > new Date(), "ADMIN_MFA_REQUIRED", 403);
}
export async function mfaStatus(user: { id: string; role: string }) {
  await adminSession(user);
  const credential = await db.adminMfa.findUnique({ where: { userId: user.id } });
  let verified = false;
  try { await requireAdmin(user); verified = true; } catch {}
  return { enrolled: Boolean(credential?.enabled), verified };
}
export async function enroll(user: { id: string; role: string; email: string | null }) {
  const session = await adminSession(user);
  await rateLimit("mfa-enroll:" + user.id, 3, 600);
  const secret = randomBytes(20), secretText = base32(secret);
  await serial(async tx => {
    const prior = await tx.adminMfa.findUnique({ where: { userId: user.id } });
    ensure(!prior?.enabled, "MFA_ALREADY_ENROLLED", 409);
    const data = { secret: seal(secret, user.id), pendingSession: session.sessionHash, expiresAt: new Date(Date.now() + 600000), lastCounter: -1 };
    await tx.adminMfa.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
  });
  return { secret: secretText, uri: "otpauth://totp/" + encodeURIComponent("Smart Canteen:" + user.email) + "?secret=" + secretText + "&issuer=Smart%20Canteen&algorithm=SHA1&digits=6&period=30" };
}
export async function verifyMfa(user: { id: string; role: string }, code: string) {
  const session = await adminSession(user);
  await rateLimit("mfa-verify:" + user.id, 5, 300);
  const token = opaque(), expiresAt = new Date(Date.now() + 15 * 60000);
  await serial(async tx => {
    const credential = await tx.adminMfa.findUnique({ where: { userId: user.id } });
    ensure(credential, "MFA_ENROLL_REQUIRED", 403);
    if (!credential.enabled) ensure(credential.pendingSession === session.sessionHash && credential.expiresAt > new Date(), "MFA_ENROLL_EXPIRED", 403);
    const counter = matchCounter(unseal(credential.secret, user.id), code, Number(credential.lastCounter));
    ensure(counter !== null, "INVALID_OR_REUSED_MFA_CODE", 403);
    const changed = await tx.adminMfa.updateMany({ where: { userId: user.id, lastCounter: credential.lastCounter }, data: { enabled: true, lastCounter: counter } });
    ensure(changed.count === 1, "INVALID_OR_REUSED_MFA_CODE", 403);
    await tx.adminGrant.deleteMany({ where: { userId: user.id, sessionHash: session.sessionHash } });
    await tx.adminGrant.create({ data: { digest: digest(token), userId: user.id, sessionHash: session.sessionHash, expiresAt } });
    await tx.auditLog.create({ data: { actorId: user.id, action: credential.enabled ? "ADMIN_MFA_VERIFY" : "ADMIN_MFA_ENROLL", targetId: user.id } });
  });
  session.jar.set(cookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/api/admin", maxAge: 900 });
  return { verified: true, expiresAt };
}
