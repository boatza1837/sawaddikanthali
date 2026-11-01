import { posAttribution } from "@/lib/pos-attribution";
import { adjustWallet } from "@/modules/adjustments";
import { bangkokToday, bangkokDayBounds } from "@/lib/report-day";
import { z } from "zod";
import { api, actor } from "@/lib/http";
import { db } from "@/lib/db";
import { ensure } from "@/lib/errors";
import { enroll, mfaStatus, requireAdmin, verifyMfa } from "@/modules/admin";
import { serial } from "@/modules/finance";
export const dynamic = "force-dynamic";
export const GET = api(async req => {
  const user = await actor(req), path = new URL(req.url).pathname;
  if (path === "/api/admin/mfa") return mfaStatus(user);
  await requireAdmin(user);
  if (path === "/api/admin/debt") {
    const params = new URL(req.url).searchParams;
    const day = params.get("date") ?? bangkokToday();
    const bounds = bangkokDayBounds(day);
    ensure(bounds, "INVALID_REPORT_DATE", 400);
    const after = z.string().min(1).max(100).optional().parse(params.get("after") ?? undefined);
    const where = { borrowed: { gt: 0 }, ledger: { createdAt: bounds } };
    if (after) ensure(await db.posTransaction.findFirst({ where: { ...where, id: after }, select: { id: true } }), "INVALID_REPORT_CURSOR", 400);
    const [totals, borrowers, debt, page] = await Promise.all([
      db.posTransaction.aggregate({ where, _sum: { borrowed: true }, _count: true }),
      db.posTransaction.groupBy({ by: ["memberId"], where }),
      db.wallet.aggregate({ where: { balance: { lt: 0 } }, _sum: { balance: true } }),
      db.posTransaction.findMany({ where, take: 51, ...(after ? { cursor: { id: after }, skip: 1 } : {}), orderBy: [{ ledger: { createdAt: "desc" } }, { id: "desc" }], include: { ledger: { select: { createdAt: true } }, cashier: { select: { name: true, email: true } }, shift: { select: { terminalId: true, user: { select: { name: true, email: true } } } } } })
    ]);
    const rows = page.slice(0, 50);
    const members = await db.user.findMany({ where: { id: { in: [...new Set(rows.map(row => row.memberId))] } }, select: { id: true, name: true, email: true, wallet: { select: { balance: true } } } });
    const byId = new Map(members.map(member => [member.id, member]));
    return { day, borrowed: totals._sum.borrowed ?? 0, count: totals._count, borrowers: borrowers.length, outstanding: -(debt._sum.balance ?? 0), nextCursor: page.length > 50 ? rows.at(-1)!.id : null, rows: rows.map(row => { const m = byId.get(row.memberId); return { ...posAttribution(row), member: m ? { name: m.name, email: m.email, balance: m.wallet?.balance ?? 0 } : null }; }) };
  }
  if (path === "/api/admin/overview") {
    const [members, wallet, sales, refunds, terminals, audit, transactions] = await Promise.all([
      db.user.count(), db.wallet.aggregate({ _sum: { balance: true } }),
      db.posTransaction.aggregate({ _sum: { amount: true, refunded: true }, _count: true }),
      db.ledgerTransaction.count({ where: { kind: "REFUND" } }),
      db.posTerminal.findMany({ orderBy: { id: "asc" } }),
      db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      db.posTransaction.findMany({ orderBy: { ledger: { createdAt: "desc" } }, take: 50, include: { ledger: { select: { createdAt: true } }, cashier: { select: { name: true, email: true } }, shift: { select: { user: { select: { name: true, email: true } }, terminalId: true } } } })
    ]);
    return { members, walletBalance: wallet._sum.balance ?? 0, grossSales: sales._sum.amount ?? 0, refunded: sales._sum.refunded ?? 0, saleCount: sales._count, refundCount: refunds, shifts: [], terminals, audit, transactions: transactions.map(posAttribution) };
  }
  if (path === "/api/admin/wallet") {
    const memberId = z.string().min(1).max(100).parse(new URL(req.url).searchParams.get("memberId"));
    const member = await db.user.findUnique({ where: { id: memberId }, select: { id: true, name: true, email: true, status: true, wallet: { select: { balance: true } } } });
    ensure(member, "NOT_FOUND", 404); return member;
  }
  if (path === "/api/admin/members") {
    const search = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 100);
    return db.user.findMany({ where: search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }, { id: search }] } : {}, select: { id: true, name: true, email: true, role: true, status: true, createdAt: true, wallet: { select: { balance: true } } }, take: 100, orderBy: { createdAt: "desc" } });
  }
  ensure(false, "NOT_FOUND", 404);
});
export const POST = api(async req => {
  const user = await actor(req), path = new URL(req.url).pathname;
  ensure(user.role === "ADMIN", "ADMIN_REQUIRED", 403);
  if (path === "/api/admin/mfa/enroll") return enroll(user);
  if (path === "/api/admin/mfa/verify") {
    const { code } = z.object({ code: z.string().regex(/^\d{6}$/) }).strict().parse(await req.json());
    return verifyMfa(user, code);
  }
  await requireAdmin(user);
  if (path === "/api/admin/adjust") {
    const data = z.object({ memberId: z.string().min(1).max(100), direction: z.enum(["CREDIT","DEBIT"]), amount: z.number().int().positive().max(1_000_000), reason: z.string().trim().min(5).max(500), key: z.string().uuid(), expectedBalance: z.number().int() }).strict().parse(await req.json());
    return adjustWallet({ ...data, actorId: user.id });
  }
  if (path === "/api/admin/member") {
    const data = z.object({ id: z.string().min(1), role: z.enum(["USER", "EMPLOYEE", "SUPERVISOR"]), status: z.enum(["ACTIVE", "SUSPENDED"]), reason: z.string().trim().min(5).max(500) }).strict().parse(await req.json());
    return serial(async tx => {
      const current = await tx.user.findUnique({ where: { id: data.id } });
      ensure(current && current.id !== user.id && current.role !== "ADMIN", "PROTECTED_ACCOUNT", 403);
      ensure(current.status !== "PENDING", "REGISTRATION_REQUIRED", 409);
      await tx.user.update({ where: { id: data.id }, data: { role: data.role, status: data.status } });
      await tx.session.deleteMany({ where: { userId: data.id } });
      await tx.adminGrant.deleteMany({ where: { userId: data.id } });
      await tx.memberToken.updateMany({ where: { userId: data.id, usedAt: null }, data: { usedAt: new Date() } });
      await tx.auditLog.create({ data: { actorId: user.id, action: "MEMBER_ACCESS_CHANGED", targetId: data.id, detail: JSON.stringify({ before: { role: current.role, status: current.status }, after: { role: data.role, status: data.status }, reason: data.reason }) } });
      return { saved: true };
    });
  }
  if (path === "/api/admin/terminal") {
    const data = z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/), name: z.string().trim().min(1).max(100), active: z.boolean(), locked: z.boolean() }).strict().parse(await req.json());
    return serial(async tx => {
      await tx.posTerminal.upsert({ where: { id: data.id }, create: data, update: { name: data.name, active: data.active, locked: data.locked } });
      await tx.auditLog.create({ data: { actorId: user.id, action: "TERMINAL_UPDATED", targetId: data.id, detail: JSON.stringify(data) } });
      return { saved: true };
    });
  }
  ensure(false, "NOT_FOUND", 404);
});
