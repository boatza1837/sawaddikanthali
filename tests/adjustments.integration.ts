import "dotenv/config";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { adjustWallet } from "@/modules/adjustments";
const suite=process.env.RUN_DB_TESTS==="1"?describe:describe.skip;
suite("Admin audited balance adjustments (local test database only)",()=>{
 beforeAll(()=>{if(!process.env.DATABASE_URL?.includes("canteen_test"))throw Error("Dedicated test database required");});
 afterAll(()=>db.$disconnect());
 async function setup(){
  const admin=await db.user.create({data:{role:"ADMIN",status:"ACTIVE"}});
  const member=await db.user.create({data:{status:"ACTIVE",wallet:{create:{}}},include:{wallet:true}});
  return {admin,member,input:{actorId:admin.id,memberId:member.id,direction:"CREDIT" as const,amount:1000,expectedBalance:0,reason:"Approved correction with evidence",key:randomUUID()}};
 }
 it("posts balanced adjustment and audit once under concurrent retry",async()=>{
  const s=await setup(),[a,b]=await Promise.all([adjustWallet(s.input),adjustWallet(s.input)]);
  expect(a.transactionId).toBe(b.transactionId);
  expect((await db.wallet.findUniqueOrThrow({where:{userId:s.member.id}})).balance).toBe(1000);
  const ledger=await db.ledgerTransaction.findUniqueOrThrow({where:{id:a.transactionId},include:{entries:true}});
  expect(ledger.kind).toBe("ADJUSTMENT");
  expect(ledger.entries).toEqual(expect.arrayContaining([expect.objectContaining({account:"ADMIN_ADJUSTMENT",side:"DEBIT",amount:1000}),expect.objectContaining({account:"WALLET_LIABILITY",side:"CREDIT",amount:1000})]));
  expect(await db.auditLog.count({where:{action:"WALLET_ADJUSTMENT",targetId:a.transactionId}})).toBe(1);
  await expect(adjustWallet({...s.input,amount:2000})).rejects.toThrow("IDEMPOTENCY_CONFLICT");
 });
 it("debits only available funds and keeps a complete before/after record",async()=>{
  const s=await setup();await adjustWallet(s.input);
  const result=await adjustWallet({...s.input,key:randomUUID(),direction:"DEBIT",amount:300,expectedBalance:1000});
  expect(result).toMatchObject({balanceBefore:1000,balanceAfter:700,direction:"DEBIT",amount:300});
  await expect(adjustWallet({...s.input,key:randomUUID(),direction:"DEBIT",amount:701,expectedBalance:700})).rejects.toThrow("INSUFFICIENT_BALANCE");
  expect((await db.wallet.findUniqueOrThrow({where:{userId:s.member.id}})).balance).toBe(700);
 });
 it("rejects stale reviewed balance after a different transaction",async()=>{
  const s=await setup();await adjustWallet(s.input);
  await expect(adjustWallet({...s.input,key:randomUUID()})).rejects.toThrow("WALLET_CHANGED");
  expect(await db.ledgerTransaction.count({where:{reference:s.member.id,kind:"ADJUSTMENT"}})).toBe(1);
 });
 it("rejects employees and inactive administrators",async()=>{
  const s=await setup();await db.user.update({where:{id:s.admin.id},data:{role:"EMPLOYEE"}});
  await expect(adjustWallet(s.input)).rejects.toThrow("ADMIN_REQUIRED");
  await db.user.update({where:{id:s.admin.id},data:{role:"ADMIN",status:"SUSPENDED"}});
  await expect(adjustWallet(s.input)).rejects.toThrow("ADMIN_REQUIRED");
  expect((await db.wallet.findUniqueOrThrow({where:{userId:s.member.id}})).balance).toBe(0);
 });
 it("rejects excessive amounts and missing reasons without posting",async()=>{
  const s=await setup();
  await expect(adjustWallet({...s.input,amount:1000001})).rejects.toThrow("INVALID_AMOUNT");
  await expect(adjustWallet({...s.input,reason:""})).rejects.toThrow("INVALID_ADJUSTMENT");
  expect((await db.wallet.findUniqueOrThrow({where:{userId:s.member.id}})).balance).toBe(0);
 });
});
