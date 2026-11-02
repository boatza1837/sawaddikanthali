import "dotenv/config";
import {describe,it,expect,vi,beforeAll,afterAll} from "vitest";
import {randomUUID} from "node:crypto";
vi.mock("@upstash/redis",()=>({Redis:class{get(){return Promise.resolve(true)}}}));
vi.mock("../src/lib/redis",()=>({redisConnection:()=>({url:"https://unused.example",token:"test"})}));
import {db} from "../src/lib/db";
import {createConnext,acceptConnext} from "../src/modules/connext";
const suite=process.env.RUN_DB_TESTS==="1"?describe:describe.skip;
suite("Connext real PostgreSQL, simulated notification only",()=>{
 let userId:string;const suffix=randomUUID();
 beforeAll(async()=>{
  if(!process.env.DATABASE_URL?.includes("canteen_test"))throw Error("Dedicated test database required");
  for(const [key,value] of Object.entries({PAYMENT_MODE:"slip2go",SLIP2GO_SECRET_KEY:"test",TOPUP_BANK_CODE:"006",TOPUP_BANK_ACCOUNT:"1234568619",TOPUP_ACCOUNT_NAME:"Test",TOPUP_PROMPTPAY:"0812345678"}))vi.stubEnv(key,value);
  userId=(await db.user.create({data:{status:"ACTIVE",email:`connext-${suffix}@example.test`,wallet:{create:{}}}})).id;
  await db.auditLog.create({data:{action:"TOPUP_MODE_CHANGED",actorId:"test",targetId:"test",detail:"connext"}});
 });
 afterAll(async()=>{vi.unstubAllEnvs();await db.$disconnect();});
 it("reserves distinct amounts and credits exactly once under concurrent delivery",async()=>{
  const [a,b]=await Promise.all([createConnext(userId,10000,randomUUID()),createConnext(userId,10000,randomUUID())]);
  expect(a.amount).not.toBe(b.amount);
  const now=new Date();const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Bangkok",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false}).formatToParts(now);const get=(type:string)=>parts.find(x=>x.type===type)!.value;
  const text=`เงินเข้า: ${(a.amount/100).toFixed(2)} บาท เข้าบัญชี XX8619 เมื่อ ${get("day")}/${get("month")}/${String(Number(get("year"))+543).slice(-2)} ${get("hour")}:${get("minute")} ยอดเงินที่ใช้ได้ 999,999.00 บาท`;
  const results=await Promise.all([acceptConnext(text),acceptConnext(text)]);
  expect(results.filter(x=>"paid" in x)).toHaveLength(1);
  expect((await db.wallet.findUniqueOrThrow({where:{userId}})).balance).toBe(a.amount);
  expect(await db.ledgerTransaction.count({where:{reference:a.id}})).toBe(1);
  await expect(acceptConnext(text.replace("XX8619","XX0000"))).rejects.toThrow("CONNEXT_ACCOUNT");
 });
});
