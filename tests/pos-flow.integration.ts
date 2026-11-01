import "dotenv/config";
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import { randomUUID } from "node:crypto";
const state=vi.hoisted(()=>({user:{id:"",role:"EMPLOYEE",status:"ACTIVE"}}));
vi.mock("@/auth",()=>({auth:vi.fn()}));
vi.mock("@/lib/http",async original=>({...await original<typeof import("@/lib/http")>(),actor:vi.fn(async()=>state.user)}));
import { db } from "@/lib/db";
import { charge,post } from "@/modules/finance";
import { digest } from "@/lib/security";
import { GET,POST } from "@/app/api/[...path]/route";
const suite=process.env.RUN_DB_TESTS==="1"?describe:describe.skip;
const request=(path:string,body:unknown)=>new Request("https://canteen.example/api/pos/"+path,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
suite("shiftless checkout and private insufficient-funds notices",()=>{
 beforeAll(()=>{if(!process.env.DATABASE_URL?.includes("canteen_test"))throw Error("Dedicated test database required");});
 afterAll(()=>db.$disconnect());
 async function setup() {
  const member=await db.user.create({data:{status:"ACTIVE",wallet:{create:{}}},include:{wallet:true}});
  const staff=await db.user.create({data:{status:"ACTIVE",role:"EMPLOYEE"}});
  const second=await db.user.create({data:{status:"ACTIVE",role:"ADMIN"}});
  const terminal=await db.posTerminal.create({data:{id:randomUUID(),name:"Shared counter"}});
  const token=async()=>{const value=randomUUID()+randomUUID();await db.memberToken.create({data:{userId:member.id,digest:digest(value),expiresAt:new Date(Date.now()+60000)}});return value;};
  return{member,staff,second,terminal,token};
 }
 it("allows two cashiers at one terminal with no shift and immutable attribution",async()=>{
  const s=await setup();
  const old=await db.user.create({data:{status:"ACTIVE",role:"EMPLOYEE"}});
  await db.staffShift.create({data:{userId:old.id,terminalId:s.terminal.id}});
  const before=await db.staffShift.count({where:{terminalId:s.terminal.id}});
  await db.$transaction(async tx=>{
   await tx.wallet.update({where:{id:s.member.wallet!.id},data:{balance:5000}});
   await post(tx,{key:randomUUID(),hash:"funding",kind:"TOPUP",actorId:s.staff.id,walletId:s.member.wallet!.id,amount:5000,debit:"CLEARING",credit:"WALLET_LIABILITY"});
  });
  const [a,b]=await Promise.all([
   charge({actorId:s.staff.id,terminalId:s.terminal.id,amount:1000,token:await s.token(),key:randomUUID()}),
   charge({actorId:s.second.id,terminalId:s.terminal.id,amount:500,token:await s.token(),key:randomUUID()})
  ]);
  expect((await db.wallet.findUniqueOrThrow({where:{userId:s.member.id}})).balance).toBe(3500);
  const first=await db.posTransaction.findUniqueOrThrow({where:{ledgerId:a.transactionId}});
  const second=await db.posTransaction.findUniqueOrThrow({where:{ledgerId:b.transactionId}});
  expect(first).toMatchObject({shiftId:null,cashierId:s.staff.id,terminalId:s.terminal.id});
  expect(second.cashierId).toBe(s.second.id);
  expect(await db.staffShift.count({where:{terminalId:s.terminal.id}})).toBe(before);
  await expect(db.posTransaction.update({where:{id:first.id},data:{cashierId:s.second.id}})).rejects.toThrow();
  await db.posTerminal.update({where:{id:s.terminal.id},data:{locked:true}});
  await expect(charge({actorId:s.staff.id,terminalId:s.terminal.id,amount:100,token:await s.token(),key:randomUUID()})).rejects.toThrow("TERMINAL_UNAVAILABLE");
 });
 it("notifies only the QR owner without debiting, and closes notices after cancel or paid approval",async()=>{
  const s=await setup(),token=await s.token();state.user=s.staff;
  const identified=await POST(request("identify",{token,amount:1100}));expect(identified.status).toBe(200);
  expect((await db.wallet.findUniqueOrThrow({where:{userId:s.member.id}})).balance).toBe(0);
  state.user=s.member;
  const own=await GET(new Request("https://canteen.example/api/wallet"));const wallet=await own.json();
  expect(wallet.notices).toHaveLength(1);expect(wallet.notices[0]).toMatchObject({amount:1100,balance:0});
  const other=await db.user.create({data:{status:"ACTIVE",wallet:{create:{}}}});state.user=other;
  const denied=await GET(new Request("https://canteen.example/api/wallet?userId="+s.member.id));
  expect((await denied.json()).notices).toEqual([]);
  state.user=s.second;await POST(request("cancel",{token,amount:1100}));
  expect(await db.memberNotice.count({where:{userId:s.member.id,status:"INSUFFICIENT"}})).toBe(1);
  state.user=s.staff;await POST(request("cancel",{token,amount:1100}));
  expect(await db.memberNotice.count({where:{userId:s.member.id,status:"INSUFFICIENT"}})).toBe(0);
  await POST(request("identify",{token,amount:1100}));
  const payload={terminalId:s.terminal.id,token,amount:1100,key:randomUUID(),allowNegative:true};
  const paid=await POST(request("charge",payload));expect(paid.status).toBe(200);
  await POST(request("charge",payload));
  expect((await db.wallet.findUniqueOrThrow({where:{userId:s.member.id}})).balance).toBe(-1100);
  expect(await db.memberNotice.count({where:{userId:s.member.id,status:"INSUFFICIENT"}})).toBe(0);
  expect(await db.posTransaction.count({where:{memberId:s.member.id}})).toBe(1);
 });
 it("expires informational notices and retires shift endpoints",async()=>{
  const s=await setup();state.user=s.staff;const token=await s.token();
  await POST(request("identify",{token,amount:100}));
  await db.memberNotice.updateMany({where:{userId:s.member.id},data:{expiresAt:new Date(0)}});
  state.user=s.member;const response=await GET(new Request("https://canteen.example/api/wallet"));
  expect((await response.json()).notices).toEqual([]);
  state.user=s.staff;expect((await POST(request("shift",{terminalId:s.terminal.id,action:"open"}))).status).toBe(410);
 });
});
