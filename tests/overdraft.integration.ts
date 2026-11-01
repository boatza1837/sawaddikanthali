import "dotenv/config";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { charge, refund, post } from "@/modules/finance";
import { digest } from "@/lib/security";
const suite=process.env.RUN_DB_TESTS==="1"?describe:describe.skip;
suite("explicit THB 50 overdraft guard (dedicated local test database)",()=>{
  beforeAll(()=>{if(!process.env.DATABASE_URL?.includes("canteen_test"))throw Error("Dedicated test database required");});
  afterAll(()=>db.$disconnect());
  async function setup() {
    const suffix=randomUUID();
    const member=await db.user.create({data:{email:suffix+"@example.test",status:"ACTIVE",wallet:{create:{}}},include:{wallet:true}});
    const employee=await db.user.create({data:{status:"ACTIVE",role:"EMPLOYEE"}});
    const terminal=await db.posTerminal.create({data:{id:suffix,name:"Credit test"}});
    const shift=await db.staffShift.create({data:{userId:employee.id,terminalId:terminal.id}});
    async function token() {const value=randomUUID()+randomUUID();await db.memberToken.create({data:{userId:member.id,digest:digest(value),expiresAt:new Date(Date.now()+60000)}});return value;}
    return {member,employee,shift,token};
  }
  it("does not create debt or consume a token without explicit approval",async()=>{
    const s=await setup(),token=await s.token();
    await expect(charge({actorId:s.employee.id,shiftId:s.shift.id,token,amount:1100,key:randomUUID()})).rejects.toThrow("INSUFFICIENT_BALANCE");
    expect((await db.wallet.findUniqueOrThrow({where:{userId:s.member.id}})).balance).toBe(0);
    expect((await db.memberToken.findUniqueOrThrow({where:{digest:digest(token)}})).usedAt).toBeNull();
  });
  it("audits employee approval, records only newly borrowed money, and deduplicates retry",async()=>{
    const s=await setup();
    await db.$transaction(async tx => {
      await tx.wallet.update({ where: { id: s.member.wallet!.id }, data: { balance: { increment: 500 } } });
      await post(tx, { key: randomUUID(), hash: "test-funding", kind: "TOPUP", actorId: s.employee.id, walletId: s.member.wallet!.id, amount: 500, debit: "CLEARING", credit: "WALLET_LIABILITY" });
    });
    const request={actorId:s.employee.id,shiftId:s.shift.id,token:await s.token(),amount:1100,key:randomUUID(),allowNegative:true};
    const result=await charge(request);await charge(request);
    const sale=await db.posTransaction.findUniqueOrThrow({where:{ledgerId:result.transactionId}});
    expect(sale).toMatchObject({amount:1100,balanceBefore:500,balanceAfter:-600,borrowed:600,overdraftApproved:true});
    expect(await db.posTransaction.count({where:{memberId:s.member.id}})).toBe(1);
    expect(await db.auditLog.count({where:{targetId:result.transactionId,action:"OVERDRAFT_APPROVED",actorId:s.employee.id}})).toBe(1);
    await expect(charge({...request,allowNegative:false})).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await charge({...request,token:await s.token(),amount:900,key:randomUUID()});
    const second=await db.posTransaction.findFirstOrThrow({where:{memberId:s.member.id,amount:900}});
    expect(second).toMatchObject({balanceBefore:-600,balanceAfter:-1500,borrowed:900});
    await expect(db.posTransaction.update({where:{id:second.id},data:{borrowed:1}})).rejects.toThrow();
  });
  it("enforces the exact 50-baht floor and permits a refund to reduce debt",async()=>{
    const s=await setup();
    const first=await charge({actorId:s.employee.id,shiftId:s.shift.id,token:await s.token(),amount:5000,key:randomUUID(),allowNegative:true});
    const token=await s.token();
    await expect(charge({actorId:s.employee.id,shiftId:s.shift.id,token,amount:1,key:randomUUID(),allowNegative:true})).rejects.toThrow("OVERDRAFT_LIMIT_EXCEEDED");
    expect((await db.memberToken.findUniqueOrThrow({where:{digest:digest(token)}})).usedAt).toBeNull();
    expect((await db.wallet.findUniqueOrThrow({where:{userId:s.member.id}})).balance).toBe(-5000);
    const sale=await db.posTransaction.findUniqueOrThrow({where:{ledgerId:first.transactionId}});
    await db.user.update({where:{id:s.employee.id},data:{role:"SUPERVISOR"}});
    await refund({actorId:s.employee.id,purchaseId:sale.id,amount:1000,key:randomUUID(),reason:"Approved debt refund"});
    expect((await db.wallet.findUniqueOrThrow({where:{userId:s.member.id}})).balance).toBe(-4000);
    expect((await db.posTransaction.findUniqueOrThrow({where:{id:sale.id}})).borrowed).toBe(5000);
  });
  it("serializes concurrent approvals so they cannot exceed the credit ceiling",async()=>{
    const s=await setup();
    const results=await Promise.allSettled([1,2].map(async()=>charge({actorId:s.employee.id,shiftId:s.shift.id,token:await s.token(),amount:3000,key:randomUUID(),allowNegative:true})));
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    expect((await db.wallet.findUniqueOrThrow({where:{userId:s.member.id}})).balance).toBe(-3000);
    expect((await db.posTransaction.aggregate({where:{memberId:s.member.id},_sum:{borrowed:true}}))._sum.borrowed).toBe(3000);
  });
  it("rejects a balanced negative ledger debit that has no explicit POS approval",async()=>{
    const s=await setup();
    await expect(db.$transaction(async tx=>{
      await tx.wallet.update({where:{id:s.member.wallet!.id},data:{balance:-100}});
      await post(tx,{key:randomUUID(),hash:"test",kind:"PURCHASE",actorId:s.employee.id,walletId:s.member.wallet!.id,amount:100,debit:"WALLET_LIABILITY",credit:"SALES"});
    })).rejects.toThrow();
    expect((await db.wallet.findUniqueOrThrow({where:{userId:s.member.id}})).balance).toBe(0);
  });
});
