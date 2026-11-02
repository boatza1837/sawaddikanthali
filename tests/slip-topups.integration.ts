import "dotenv/config";
import { beforeAll, afterAll, it, expect, describe, vi } from "vitest";
import { randomUUID } from "node:crypto";
vi.mock("../src/lib/security",async importOriginal=>{const actual=await importOriginal<typeof import("../src/lib/security")>();return {...actual,rateLimit:vi.fn()};});
import { db } from "../src/lib/db";
import { createSlipTopup, submitSlip } from "../src/modules/slip-topups";
const suite=process.env.RUN_DB_TESTS==="1"?describe:describe.skip;
suite("Slip settlement on dedicated local test database, provider mocked",()=>{
  let member:string, other:string;
  const suffix=randomUUID();
  const file=(tag:string)=>new File([new Uint8Array([137,80,78,71,13,10,26,10]),suffix,tag],"test.png",{type:"image/png"});
  let ref="";
  let amount=100;
  beforeAll(async()=>{
    if(!process.env.DATABASE_URL?.includes("canteen_test"))throw Error("Refuse tests outside canteen_test");
    for(const [key,value] of Object.entries({PAYMENT_MODE:"slip2go",SLIP2GO_SECRET_KEY:"local-fixture-only",TOPUP_BANK_CODE:"014",TOPUP_BANK_ACCOUNT:"1234567890",TOPUP_ACCOUNT_NAME:"นาย ทดสอบ ระบบ",TOPUP_PROMPTPAY:"0812345678"}))vi.stubEnv(key,value);
    member=(await db.user.create({data:{email:`slip-${suffix}@example.test`,status:"ACTIVE",wallet:{create:{}}}})).id;
    other=(await db.user.create({data:{email:`other-slip-${suffix}@example.test`,status:"ACTIVE",wallet:{create:{}}}})).id;
    vi.stubGlobal("fetch",vi.fn().mockImplementation(async()=>Response.json({code:"200200",data:{transRef:ref,amount,dateTime:new Date().toISOString(),sender:{bank:{id:"004"}},receiver:{bank:{id:"014"},account:{name:"นาย ทดสอบ ระบบ",bank:{account:"xxx-x-xx7890"}}}}})));
  });
  afterAll(async()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();await db.$disconnect();});
  it("credits once under concurrent uploads and replays without another provider request",async()=>{
    ref=`reference-${suffix}`;
    const intent=await createSlipTopup(member,10000,randomUUID());
    const results=await Promise.allSettled([submitSlip(member,intent.id,file("same")),submitSlip(member,intent.id,file("same"))]);
    expect(results.some(r=>r.status==="fulfilled")).toBe(true);
    expect((await db.wallet.findUniqueOrThrow({where:{userId:member}})).balance).toBe(10000);
    const calls=vi.mocked(fetch).mock.calls.length;
    expect((await submitSlip(member,intent.id,file("same"))).replayed).toBe(true);
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
    expect(await db.ledgerTransaction.count({where:{reference:intent.id}})).toBe(1);
  });
  it("rejects a changed image of an already credited bank transaction globally",async()=>{
    const intent=await createSlipTopup(other,10000,randomUUID());
    await expect(submitSlip(other,intent.id,file("changed-image"))).rejects.toThrow("SLIP_ALREADY_USED");
    expect((await db.wallet.findUniqueOrThrow({where:{userId:other}})).balance).toBe(0);
  });
  it("rejects cross-member intent access before calling provider",async()=>{
    const intent=await createSlipTopup(member,10000,randomUUID());
    const calls=vi.mocked(fetch).mock.calls.length;
    await expect(submitSlip(other,intent.id,file("access"))).rejects.toThrow("NOT_FOUND");
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
  });
  it("rejects wrong amount and expired intents without credit",async()=>{
    ref=`mismatch-${suffix}`;amount=50;
    const intent=await createSlipTopup(other,10000,randomUUID());
    await expect(submitSlip(other,intent.id,file("wrong-amount"))).rejects.toThrow("SLIP_AMOUNT_MISMATCH");
    await db.topupIntent.update({where:{id:intent.id},data:{expiresAt:new Date(0)}});
    const calls=vi.mocked(fetch).mock.calls.length;
    await expect(submitSlip(other,intent.id,file("expired"))).rejects.toThrow("PAYMENT_EXPIRED");
    expect(vi.mocked(fetch).mock.calls.length).toBe(calls);
    expect((await db.wallet.findUniqueOrThrow({where:{userId:other}})).balance).toBe(0);
  });
});
